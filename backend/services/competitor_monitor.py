"""
竞品广告监控引擎 v1.1

═══════════════════════════════════════
📡 广告数据来源 (Ad Data Sources)
═══════════════════════════════════════

渠道 1: Google Play 商店页 — 宣传视频 (Store Content)
  说明: 抓取 App 在 Google Play 商店页展示的宣传视频
  性质: 商店素材 (非付费广告)，但竞品更换宣传视频通常意味着新投放活动
  数据: video_url (YouTube), video_id, title
  方式: google-play-scraper 免费库，无需 API Key
  频率: 每 1 小时

渠道 2: Google Ads 透明度中心 — 付费广告 (Real Paid Ads)
  说明: Google 官方透明度中心，展示广告主在 Google 搜索/YouTube/Gmail 的全部广告
  性质: 真实广告投放数据，含广告缩略图/格式/投放时间/展示次数
  数据: 搜索链接 (需 JS 渲染，后端仅做广告主存在性验证)
  方式: HTTP 请求验证 + 生成查看链接，完全免费
  频率: 每 1 小时

渠道 3: App Store 商店页 — 截图/版本 (Store Content)
  说明: iTunes Lookup API 获取 App Store 最新截图和版本号
  性质: 商店素材变更 (非广告)，但截图更新常伴随新广告投放
  数据: screenshotUrls, version
  方式: iTunes Search API，免费无限制

═══════════════════════════════════════
功能：
1. 关注列表管理（增删改查，JSON 文件存储）
2. 广告快照保存（记录每次抓取的广告数据）
3. 变更检测（新广告发现、爆款识别）
4. 企业微信机器人推送（Markdown 格式消息）
5. 后台定时调度
"""
import json
import os
import time
import threading
from datetime import datetime, UTC
from typing import Optional

import requests as sync_requests

# ============ 配置 ============
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
WATCHLIST_FILE = os.path.join(DATA_DIR, "monitor_watchlist.json")
SNAPSHOTS_DIR = os.path.join(DATA_DIR, "monitor_snapshots")
SETTINGS_FILE = os.path.join(DATA_DIR, "monitor_settings.json")
ALERT_LOG_FILE = os.path.join(DATA_DIR, "monitor_alerts.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)


# ============ 数据模型工具 ============

def _load_json(path: str, default=None) -> dict | list:
    """安全加载 JSON"""
    if default is None:
        default = {}
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return default


def _save_json(path: str, data):
    """安全保存 JSON"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ============ 关注列表管理 ============

def get_watchlist() -> list[dict]:
    """获取关注列表"""
    items = _load_json(WATCHLIST_FILE, [])
    if not isinstance(items, list):
        items = []
    return items


def add_to_watchlist(app: dict) -> dict:
    """
    添加 App 到关注列表
    app 需包含: app_id, name, developer, icon_url, platform (app_store/google_play), bundle_id (可选)
    """
    items = get_watchlist()

    app_id = str(app.get("app_id", ""))
    platform = app.get("platform", "app_store")

    # 检查重复
    for item in items:
        if str(item.get("app_id")) == app_id and item.get("platform") == platform:
            return {"status": "already_watching", "app_id": app_id, "platform": platform}

    item = {
        "app_id": app_id,
        "name": app.get("name", ""),
        "developer": app.get("developer", ""),
        "icon_url": app.get("icon_url", ""),
        "platform": platform,
        "bundle_id": app.get("bundle_id", ""),
        "added_at": _now_iso(),
        "last_checked": None,
        "last_ad_count": 0,
        "total_alerts": 0,
        "tags": app.get("tags", []),
    }
    items.append(item)
    _save_json(WATCHLIST_FILE, items)
    return {"status": "added", "app": item}


def remove_from_watchlist(app_id: str, platform: str = "app_store") -> dict:
    """从关注列表移除"""
    items = get_watchlist()
    new_items = [i for i in items if not (str(i.get("app_id")) == app_id and i.get("platform") == platform)]
    if len(new_items) == len(items):
        return {"status": "not_found", "app_id": app_id, "platform": platform}
    _save_json(WATCHLIST_FILE, new_items)
    # 清理快照
    snap_file = os.path.join(SNAPSHOTS_DIR, f"{platform}_{app_id}.json")
    if os.path.exists(snap_file):
        os.remove(snap_file)
    return {"status": "removed", "app_id": app_id, "platform": platform}


# ============ 广告抓取函数 ============

def _fetch_gp_video(bundle_id: str, app_name: str, country: str = "US") -> list[dict]:
    """
    渠道 1: Google Play 商店宣传视频 (Store Content)
    抓取 App 在 Google Play 商店页展示的宣传视频链接
    性质: 商店素材，非付费广告投放数据
    """
    ads = []
    try:
        from google_play_scraper import search
        results = search(app_name.split(":")[0].strip(), n_hits=3, country=country.lower())

        for r in results:
            video = r.get("video")
            rid = r.get("appId", "")
            if rid and bundle_id and rid.lower() != bundle_id.lower():
                continue

            if video:
                video_id = video.split("=")[-1] if "youtube" in video else video
                ads.append({
                    "source": "google_play_video",
                    "source_label_zh": "Google Play 商店宣传视频",
                    "source_label_en": "Google Play Store Video",
                    "source_nature": "store_content",
                    "video_id": video_id,
                    "video_url": video,
                    "title": r.get("title", ""),
                    "fetched_at": _now_iso(),
                })
    except Exception as e:
        print(f"[Monitor] GP video failed for {app_name}: {e}")
    return ads


def _fetch_google_ads(app_name: str, country: str = "US") -> list[dict]:
    """
    渠道 2: Google Ads 透明度中心 (Real Paid Ads)
    验证广告主存在性 + 生成查看链接
    性质: 真实广告投放数据（Google搜索/YouTube/Gmail展示广告）
    """
    ads = []
    try:
        search_term = app_name.split(":")[0].strip().split()
        lookup_name = " ".join(search_term[:3]) if len(search_term) >= 3 else app_name.split(":")[0].strip()

        search_url = f"https://adstransparency.google.com/?advertiser_name={lookup_name.replace(' ', '+')}&region={country}"

        # 验证广告主是否存在
        exists = False
        try:
            resp = sync_requests.get(
                search_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                timeout=10,
                allow_redirects=True,
            )
            if resp.status_code == 200 and lookup_name.lower()[:5] in resp.text.lower():
                exists = True
        except:
            pass

        ads.append({
            "source": "google_ads",
            "source_label_zh": "Google Ads 透明度中心",
            "source_label_en": "Google Ads Transparency Center",
            "source_nature": "real_ad_data",
            "video_id": f"gads_{lookup_name.replace(' ', '_').lower()}",
            "video_url": None,
            "external_url": search_url,
            "title": f"{lookup_name} | Google Ads Library",
            "advertiser_exists": exists,
            "note_zh": "点击链接查看真实付费广告（缩略图/格式/展示量）",
            "note_en": "Click to view real paid ads (thumbnails/formats/impressions)",
            "fetched_at": _now_iso(),
        })
    except Exception as e:
        print(f"[Monitor] Google Ads check failed for {app_name}: {e}")
    return ads


def _fetch_youtube_videos(app_name: str) -> list[dict]:
    """
    渠道 4: YouTube 搜索 (辅助发现)
    搜索 App 名称相关的 YouTube 视频（可能包含测评/广告/发布视频）
    性质: UGC 内容，非官方广告数据
    """
    ads = []
    try:
        import urllib.parse
        query = urllib.parse.quote_plus(f"{app_name} app")
        search_url = f"https://www.youtube.com/results?search_query={query}"

        resp = sync_requests.get(
            search_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=10,
        )

        if resp.status_code == 200:
            import re
            # 提取 YouTube 视频 ID (from ytInitialData or videoId patterns)
            video_ids = re.findall(r'"videoId":"([^"]+)"', resp.text)
            seen = set()
            count = 0
            for vid in video_ids:
                if vid in seen:
                    continue
                seen.add(vid)
                count += 1
                ads.append({
                    "source": "youtube",
                    "source_label_zh": "YouTube 相关视频",
                    "source_label_en": "YouTube Related Videos",
                    "source_nature": "ugc_content",
                    "video_id": vid,
                    "video_url": f"https://www.youtube.com/watch?v={vid}",
                    "title": f"{app_name} — YouTube 搜索结果 #{count}",
                    "fetched_at": _now_iso(),
                })
                if count >= 3:
                    break
    except Exception as e:
        print(f"[Monitor] YouTube search failed for {app_name}: {e}")
    return ads


def _fetch_app_store_metadata(app_id: str) -> list[dict]:
    """
    渠道 3: App Store 商店素材 (Store Content)
    iTunes Lookup API 获取最新截图和版本号
    性质: 商店素材变更，常伴随新广告投放
    """
    screenshots = []
    try:
        r = sync_requests.get(f"https://itunes.apple.com/lookup?id={app_id}", timeout=10)
        data = r.json()
        for result in data.get("results", []):
            version = result.get("version", "")
            for url in result.get("screenshotUrls", [])[:5]:
                screenshots.append({
                    "url": url,
                    "version": version,
                    "source": "app_store",
                    "source_label_zh": "App Store 商店截图",
                    "source_label_en": "App Store Screenshots",
                    "source_nature": "store_content",
                    "fetched_at": _now_iso(),
                })
    except Exception as e:
        print(f"[Monitor] App Store lookup failed for {app_id}: {e}")
    return screenshots


def fetch_all_ads_for_app(app: dict) -> dict:
    """为指定 App 抓取全部 4 个渠道的广告数据"""
    app_name = app.get("name", "")
    app_id = str(app.get("app_id", ""))
    platform = app.get("platform", "app_store")
    bundle_id = app.get("bundle_id", "")
    country = app.get("country", "US")

    video_ads = []
    screenshots = []

    # 渠道 1: Google Play 宣传视频 (所有平台都尝试)
    if platform == "google_play":
        bid = bundle_id or app_id
        video_ads = _fetch_gp_video(bid, app_name, country)
    else:
        try:
            video_ads = _fetch_gp_video(app_name, app_name, country)
        except:
            pass

    # 渠道 2: Google Ads 透明度中心 (所有平台)
    google_ads = _fetch_google_ads(app_name, country)
    video_ads.extend(google_ads)

    # 渠道 3: App Store 素材 (仅 App Store)
    if platform == "app_store":
        screenshots = _fetch_app_store_metadata(app_id)

    # 渠道 4: YouTube 搜索 (所有平台)
    yt_videos = _fetch_youtube_videos(app_name)
    video_ads.extend(yt_videos)

    return {
        "app_id": app_id,
        "platform": platform,
        "app_name": app_name,
        "video_ads": video_ads,
        "screenshots": screenshots,
        "fetched_at": _now_iso(),
        "total_ads": len(video_ads),
        "sources_summary": {
            "google_play_video": sum(1 for a in video_ads if a.get("source") == "google_play_video"),
            "google_ads": sum(1 for a in video_ads if a.get("source") == "google_ads"),
            "youtube": sum(1 for a in video_ads if a.get("source") == "youtube"),
            "app_store_screenshots": len(screenshots),
        },
    }


# ============ 快照管理 ============

def get_snapshot_path(app_id: str, platform: str) -> str:
    return os.path.join(SNAPSHOTS_DIR, f"{platform}_{app_id}.json")


def load_last_snapshot(app_id: str, platform: str) -> dict | None:
    """加载上次快照"""
    path = get_snapshot_path(app_id, platform)
    data = _load_json(path, None)
    return data if data else None


def save_snapshot(snapshot: dict):
    """保存快照"""
    app_id = snapshot.get("app_id", "unknown")
    platform = snapshot.get("platform", "app_store")
    path = get_snapshot_path(app_id, platform)
    _save_json(path, snapshot)


# ============ 变更检测引擎 ============

def detect_new_ads(current: dict, previous: dict | None) -> dict:
    """
    对比当前抓取结果与上次快照
    返回: {has_new: bool, new_ads: [...], total_new: int, details: [...]}
    """
    if not previous or not previous.get("video_ads"):
        return {"has_new": False, "new_ads": [], "total_new": 0, "details": [], "is_first_check": True}

    prev_video_ids = set()
    for ad in previous.get("video_ads", []):
        vid = ad.get("video_id") or ad.get("video_url", "")
        if vid:
            prev_video_ids.add(vid)

    prev_screenshot_urls = set()
    for ss in previous.get("screenshots", []):
        url = ss.get("url", "")
        if url:
            prev_screenshot_urls.add(url)

    new_ads = []
    details = []

    # 检测新视频广告
    for ad in current.get("video_ads", []):
        vid = ad.get("video_id") or ad.get("video_url", "")
        if vid and vid not in prev_video_ids:
            new_ads.append(ad)
            details.append({
                "type": "new_ad",
                "source": ad.get("source_label_zh", "Unknown"),
                "source_nature": ad.get("source_nature", "store_content"),
                "title": ad.get("title", ""),
                "video_id": vid,
                "video_url": ad.get("video_url", ""),
                "external_url": ad.get("external_url", ""),
            })

    # 检测新截图
    new_screenshots = []
    for ss in current.get("screenshots", []):
        url = ss.get("url", "")
        if url and url not in prev_screenshot_urls:
            new_screenshots.append(ss)
    if new_screenshots:
        details.append({
            "type": "new_screenshots",
            "count": len(new_screenshots),
            "note": "App Store 截图更新",
        })

    return {
        "has_new": len(new_ads) > 0 or len(new_screenshots) > 0,
        "new_ads": new_ads,
        "new_screenshots": new_screenshots,
        "total_new_ads": len(new_ads),
        "total_new_screenshots": len(new_screenshots),
        "details": details,
        "is_first_check": False,
    }


# ============ 警报日志 ============

def log_alert(alert: dict):
    """记录警报到日志文件"""
    alerts = _load_json(ALERT_LOG_FILE, [])
    if not isinstance(alerts, list):
        alerts = []
    alert["timestamp"] = _now_iso()
    alerts.insert(0, alert)  # 最新在前
    # 保留最近 200 条
    if len(alerts) > 200:
        alerts = alerts[:200]
    _save_json(ALERT_LOG_FILE, alerts)


def get_alerts(limit: int = 50) -> list[dict]:
    """获取警报历史"""
    alerts = _load_json(ALERT_LOG_FILE, [])
    if not isinstance(alerts, list):
        return []
    return alerts[:limit]


# ============ 企业微信推送 ============

def _get_webhook_url() -> Optional[str]:
    """获取企业微信 Webhook URL"""
    settings = _load_json(SETTINGS_FILE, {})
    return settings.get("wecom_webhook")


def push_wecom_notification(app_name: str, app_id: str, detections: dict, webhook_url: str = None) -> bool:
    """
    推送企业微信通知
    使用 Markdown 格式发送竞品广告变更提醒
    """
    if not webhook_url:
        webhook_url = _get_webhook_url()

    if not webhook_url:
        print("[Monitor] 未配置企业微信 Webhook，跳过推送")
        return False

    details = detections.get("details", [])
    if not details:
        return False

    # 构建 Markdown 消息
    new_ad_count = detections.get("total_new_ads", 0)
    new_ss_count = detections.get("total_new_screenshots", 0)

    lines = [
        f'## 🔔 竞品广告提醒',
        f'',
        f'**{app_name}** 检测到新动态 ({new_ad_count} 个变更)',
        f'',
    ]

    for d in details:
        if d["type"] == "new_ad":
            source = d.get("source", "Unknown")
            title = d.get("title", "")[:60]
            nature = d.get("source_nature", "store_content")
            badge = "📢 真实广告" if nature == "real_ad_data" else ("🎬 视频内容" if nature == "ugc_content" else "🏪 商店素材")
            lines.append(f'> {badge} **{source}**')
            if title:
                lines.append(f'> {title}')
            if d.get("video_url"):
                lines.append(f'> [▶ 观看]({d["video_url"]})')
            lines.append(f'')
        elif d["type"] == "new_screenshots":
            lines.append(f'> 🖼️ App Store 截图更新 ({d["count"]} 张)')
            lines.append(f'')

    lines.append(f'')
    # 添加查看链接
    site_url = os.getenv("SITE_URL", "https://gamead-insight.onrender.com")
    lines.append(f'[查看详情 →]({site_url}/appstore/{app_id})')
    lines.append(f'')
    lines.append(f'<font color="comment">{_now_iso()[:19]}</font>')

    content = "\n".join(lines)

    try:
        payload = {
            "msgtype": "markdown",
            "markdown": {
                "content": content,
            }
        }
        resp = sync_requests.post(webhook_url, json=payload, timeout=10)
        if resp.status_code == 200:
            resp_data = resp.json()
            if resp_data.get("errcode") == 0:
                print(f"[Monitor] ✅ 微信推送成功: {app_name} ({new_ad_count} 新广告)")
                return True
            else:
                print(f"[Monitor] ⚠️ 微信推送失败: {resp_data}")
                return False
        else:
            print(f"[Monitor] ⚠️ 微信推送 HTTP {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"[Monitor] ❌ 微信推送异常: {e}")
        return False


# ============ 核心监控逻辑 ============

def check_single_app(app: dict, save_snapshot_flag: bool = True) -> dict:
    """
    检查单个 App 的广告变化
    返回: {app_id, app_name, detections, snapshot, pushed}
    """
    app_id = str(app.get("app_id", ""))
    platform = app.get("platform", "app_store")
    app_name = app.get("name", "")

    # 1. 抓取当前广告数据
    current = fetch_all_ads_for_app(app)

    # 2. 加载上次快照并检测变化
    previous = load_last_snapshot(app_id, platform)
    detections = detect_new_ads(current, previous)

    # 3. 保存新快照
    if save_snapshot_flag:
        save_snapshot(current)

    # 4. 更新关注列表中的统计
    items = get_watchlist()
    updated = False
    for item in items:
        if str(item.get("app_id")) == app_id and item.get("platform") == platform:
            item["last_checked"] = _now_iso()
            item["last_ad_count"] = current.get("total_ads", 0)
            if detections.get("has_new"):
                item["total_alerts"] = item.get("total_alerts", 0) + detections.get("total_new_ads", 0)
            updated = True
            break
    if updated:
        _save_json(WATCHLIST_FILE, items)

    # 5. 如果有新广告，推送微信 + 记录警报
    pushed = False
    if detections.get("has_new"):
        webhook = _get_webhook_url()
        if webhook:
            pushed = push_wecom_notification(app_name, app_id, detections, webhook)

        # 记录警报
        log_alert({
            "app_id": app_id,
            "platform": platform,
            "app_name": app_name,
            "icon_url": app.get("icon_url", ""),
            "detections": detections,
            "pushed": pushed,
        })

    return {
        "app_id": app_id,
        "platform": platform,
        "app_name": app_name,
        "icon_url": app.get("icon_url", ""),
        "detections": detections,
        "pushed": pushed,
        "checked_at": _now_iso(),
    }


def check_all() -> list[dict]:
    """检查所有关注 App"""
    items = get_watchlist()
    results = []
    for app in items:
        try:
            result = check_single_app(app)
            results.append(result)
        except Exception as e:
            print(f"[Monitor] 检查 {app.get('name', app.get('app_id'))} 失败: {e}")
            results.append({
                "app_id": app.get("app_id"),
                "app_name": app.get("name", ""),
                "error": str(e),
                "checked_at": _now_iso(),
            })

    print(f"[Monitor] 批量检查完成: {len(items)} App, "
          f"来源=[GP视频/GoogleAds/YT/AppStore截图], "
          f"新变更 {sum(1 for r in results if r.get('detections', {}).get('has_new'))} 个")
    return results


# ============ 设置管理 ============

def get_settings() -> dict:
    """获取监控设置"""
    defaults = {
        "check_interval_hours": 1,
        "wecom_webhook": "",
        "notify_new_ads": True,
        "notify_screenshot_changes": True,
        "language": "zh",
    }
    settings = _load_json(SETTINGS_FILE, {})
    return {**defaults, **settings}


def update_settings(new_settings: dict) -> dict:
    """更新监控设置"""
    settings = get_settings()
    settings.update(new_settings)
    _save_json(SETTINGS_FILE, settings)
    return settings


# ============ 后台调度器 ============

_monitor_thread: Optional[threading.Thread] = None
_monitor_running = False


def start_background_monitor():
    """启动后台监控线程"""
    global _monitor_thread, _monitor_running

    if _monitor_running:
        print("[Monitor] 后台监控已在运行")
        return

    _monitor_running = True
    settings = get_settings()
    interval = settings.get("check_interval_hours", 6)

    def _monitor_loop():
        print(f"[Monitor] ✅ 后台监控已启动，每 {interval} 小时检查一次")
        while _monitor_running:
            try:
                check_all()
            except Exception as e:
                print(f"[Monitor] 后台检查异常: {e}")
            # 每 5 分钟检查一次时间
            for _ in range(interval * 12):  # interval hours * 12 five-minute blocks
                if not _monitor_running:
                    break
                time.sleep(300)  # 5 分钟

    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
    _monitor_thread.start()
    print(f"[Monitor] 后台监控线程已启动 (间隔={interval}小时)")


def stop_background_monitor():
    """停止后台监控"""
    global _monitor_running
    _monitor_running = False
    print("[Monitor] 后台监控已停止")


def get_monitor_status() -> dict:
    """获取监控运行状态"""
    items = get_watchlist()
    settings = get_settings()
    recent_alerts = get_alerts(20)

    checked = sum(1 for i in items if i.get("last_checked"))
    total_alerts = sum(i.get("total_alerts", 0) for i in items)

    return {
        "running": _monitor_running,
        "check_interval_hours": settings.get("check_interval_hours", 6),
        "total_watching": len(items),
        "checked_count": checked,
        "total_alerts": total_alerts,
        "recent_alerts": recent_alerts[:5],
        "wecom_configured": bool(settings.get("wecom_webhook")),
    }
