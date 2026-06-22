"""
Meta (Facebook/Instagram) 广告库爬虫
免费方案：爬取 Meta Ad Library 公开网页（无需 API Key）
官方网页：https://www.facebook.com/ads/library/

注意：大规模爬取违反 Meta ToS，本代码仅用于合规的少量查询。
建议：申请 Meta Ad Library API（免费，需审核5-10天）
"""
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Optional

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("[MetaAds] 缺少依赖，请运行: pip install requests beautifulsoup4")
    raise


# Meta Ad Library 公开搜索接口（无需登录，有限制）
# 官方文档：https://www.facebook.com/ads/library/api/v1/
# 免费 API 需要申请，这里先实现网页爬取作为备选方案

META_AD_LIBRARY_SEARCH_URL = "https://www.facebook.com/ads/library/"

# 广告类型映射
AD_TYPE_MAP = {
    "VIDEO": "视频广告",
    "IMAGE": "图片广告",
    "CAROUSEL": "轮播广告",
    "PLAYABLE": "试玩广告",
}


def _build_search_url(advertiser_name: str, country: str = "US") -> str:
    """构建 Meta Ad Library 搜索 URL"""
    from urllib.parse import quote
    return f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country={country}&q={quote(advertiser_name)}&sort_data[direction]=desc&sort_data[mode]=relevancy_monthly_grouped"


def search_ads_by_advertiser(
    advertiser_name: str,
    country: str = "US",
    limit: int = 20,
    use_api: bool = False,
    api_token: Optional[str] = None,
) -> list[dict]:
    """
    按广告主名称搜索 Meta 广告
    返回广告素材列表，每条包含：标题、文案、视频URL、投放日期等

    Args:
        advertiser_name: 广告主名称（如 "Canva", "PicsArt"）
        country: 国家代码（US/CN/GB等）
        limit: 最多返回条数
        use_api: 是否使用官方 API（需 api_token）
        api_token: Meta Ad Library API Token
    """
    if use_api and api_token:
        return _search_via_api(advertiser_name, country, limit, api_token)
    else:
        return _search_via_web(advertiser_name, country, limit)


def _search_via_api(
    advertiser_name: str,
    country: str,
    limit: int,
    api_token: str,
) -> list[dict]:
    """
    使用 Meta Ad Library 官方 API（免费，需申请）
    文档：https://www.facebook.com/ads/library/api/v1/
    """
    ads = []
    try:
        # 先搜索广告主页面 ID
        search_url = "https://graph.facebook.com/v19.0/search"
        params = {
            "type": "adpage",
            "q": advertiser_name,
            "access_token": api_token,
        }
        resp = requests.get(search_url, params=params, timeout=15)
        if resp.status_code != 200:
            print(f"[MetaAPI] 搜索广告主失败: {resp.status_code}")
            return []

        pages = resp.json().get("data", [])
        if not pages:
            return []

        # 对每个页面 ID 查询广告
        for page in pages[:3]:  # 最多查 3 个匹配页面
            page_id = page.get("id")
            ads_url = "https://graph.facebook.com/v19.0/ads_archive"
            params2 = {
                "ad_page_id": page_id,
                "ad_reached_countries": country,
                "fields": ",".join([
                    "id", "ad_creative_bodies", "ad_creative_link_captions",
                    "ad_creative_link_titles", "ad_creative_link_descriptions",
                    "ad_creative_type", "ad_delivery_start_time", "ad_delivery_stop_time",
                    "ad_snapshot_url", "page_name", "publisher_platforms",
                ]),
                "access_token": api_token,
                "limit": min(limit, 100),
            }
            r2 = requests.get(ads_url, params=params2, timeout=15)
            if r2.status_code != 200:
                continue
            for ad in r2.json().get("data", []):
                ads.append(_parse_meta_api_ad(ad))

            if len(ads) >= limit:
                break

        return ads[:limit]

    except Exception as e:
        print(f"[MetaAPI] 查询失败: {e}")
        return []


def _parse_meta_api_ad(raw: dict) -> dict:
    """解析 Meta API 返回的单条广告"""
    bodies = raw.get("ad_creative_bodies", [])
    return {
        "ad_id": raw.get("id", ""),
        "advertiser": raw.get("page_name", ""),
        "title": (bodies[0][:60] + "...") if bodies and len(bodies[0]) > 60 else (bodies[0] if bodies else ""),
        "body": bodies[0] if bodies else "",
        "caption": raw.get("ad_creative_link_captions", [""])[0] if raw.get("ad_creative_link_captions") else "",
        "creative_type": raw.get("ad_creative_type", ""),
        "creative_type_zh": AD_TYPE_MAP.get(raw.get("ad_creative_type", ""), "其他"),
        "start_date": raw.get("ad_delivery_start_time", ""),
        "end_date": raw.get("ad_delivery_stop_time", ""),
        "snapshot_url": raw.get("ad_snapshot_url", ""),
        "platforms": raw.get("publisher_platforms", []),
        "platforms_zh": [_platform_zh(p) for p in raw.get("publisher_platforms", [])],
        "first_seen": raw.get("ad_delivery_start_time", ""),
        "last_seen": raw.get("ad_delivery_stop_time", "") or "投放中",
    }


def _platform_zh(platform: str) -> str:
    return {"facebook": "Facebook", "instagram": "Instagram", "audience_network": "Audience Network", "messenger": "Messenger"}.get(platform, platform)


def _search_via_web(
    advertiser_name: str,
    country: str = "US",
    limit: int = 10,
) -> list[dict]:
    """
    爬取 Meta Ad Library 网页（备选方案，稳定性较差）
    注意：Meta 有反爬机制，建议仅用于少量查询
    """
    print(f"[MetaWeb] 正在网页搜索: {advertiser_name} ({country})")
    print("[MetaWeb] 提示：网页爬取不稳定，建议申请官方 API")
    # 由于 Meta 有严格的反爬机制（登录要求、JS 渲染等），
    # 纯 requests 爬取成功率很低。这里返回一个提示信息。
    return [{
        "ad_id": "web_scrape_not_supported",
        "advertiser": advertiser_name,
        "title": "网页爬取暂不支持",
        "title_en": "Web scraping not supported",
        "body": "Meta Ad Library 需要 JavaScript 渲染且有反爬机制。请申请官方 API（免费）。",
        "body_en": "Meta Ad Library requires JS rendering and has anti-scrape measures. Please apply for the official API (free).",
        "snapshot_url": f"https://www.facebook.com/ads/library/?q={advertiser_name}&country={country}",
        "platforms_zh": ["Facebook", "Instagram"],
        "first_seen": "",
        "last_seen": "",
        "creative_type_zh": "视频/图片",
        "is_placeholder": True,  # 标记这是占位数据
    }]


# ============ Google Ads Transparency Center 爬取 ============

def search_google_ads(advertiser_domain: str, limit: int = 20) -> list[dict]:
    """
    查询 Google Ads 透明度中心
    公开网址：https://transparencycenter.google.com/
    按广告主域名搜索（如 canva.com）

    注意：Google 透明度中心也有反爬机制，
    建议使用开源工具：https://github.com/google-transparency-center-scraper
    """
    print(f"[GoogleAds] 查询广告主: {advertiser_domain}")
    # 返回引导链接，实际爬取需要浏览器自动化
    return [{
        "ad_id": "google_ads_placeholder",
        "advertiser": advertiser_domain,
        "title": "请访问 Google 广告透明度中心查看",
        "title_en": "Visit Google Ads Transparency Center",
        "snapshot_url": f"https://transparencycenter.google.com/?hl=en&type=ADS&query={advertiser_domain}",
        "platforms_zh": ["Google Search", "YouTube"],
        "is_placeholder": True,
    }]


# ============ 广告变化检测（本地快照对比）============

META_SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "meta_ads_history")


def save_meta_snapshot(app_id: str, ads: list[dict]):
    """保存某 App 的 Meta 广告快照"""
    os.makedirs(META_SNAPSHOT_DIR, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = os.path.join(META_SNAPSHOT_DIR, f"{app_id}_{today}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"date": today, "app_id": app_id, "ads": ads}, f, ensure_ascii=False, indent=2)


def detect_ad_changes(app_id: str, current_ads: list[dict]) -> dict:
    """
    对比上次快照，检测广告变化
    返回：{has_new: bool, new_count: int, stopped_count: int, details: [...]}
    """
    prev_ads = _load_latest_meta_snapshot(app_id)
    if not prev_ads:
        save_meta_snapshot(app_id, current_ads)
        return {"has_new": False, "new_count": 0, "stopped_count": 0, "details": [], "is_first_run": True}

    prev_ids = {ad.get("ad_id") for ad in prev_ads}
    curr_ids = {ad.get("ad_id") for ad in current_ads}

    new_ids = curr_ids - prev_ids
    stopped_ids = prev_ids - curr_ids

    details = []
    for ad in current_ads:
        if ad.get("ad_id") in new_ids:
            details.append({
                "type": "new_ad",
                "label_zh": "🆕 新增广告",
                "label_en": "🆕 New Ad",
                "ad_id": ad["ad_id"],
                "title": ad.get("title", ""),
            })
    for ad_id in stopped_ids:
        details.append({
            "type": "stopped_ad",
            "label_zh": "⛔ 广告停止投放",
            "label_en": "⛔ Ad Stopped",
            "ad_id": ad_id,
        })

    save_meta_snapshot(app_id, current_ads)

    return {
        "has_new": len(new_ids) > 0,
        "new_count": len(new_ids),
        "stopped_count": len(stopped_ids),
        "is_first_run": False,
        "details": details,
        "alert_level": "critical" if len(new_ids) >= 5 else ("warning" if len(new_ids) > 0 else "info"),
    }


def _load_latest_meta_snapshot(app_id: str) -> Optional[list[dict]]:
    if not os.path.exists(META_SNAPSHOT_DIR):
        return None
    files = [f for f in os.listdir(META_SNAPSHOT_DIR) if f.startswith(f"{app_id}_") and f.endswith(".json")]
    if not files:
        return None
    latest = sorted(files)[-1]
    with open(os.path.join(META_SNAPSHOT_DIR, latest), encoding="utf-8") as f:
        data = json.load(f)
    return data.get("ads", [])
