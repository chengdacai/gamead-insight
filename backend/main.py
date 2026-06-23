"""
GameAd Insight - 游戏视频广告灵感平台 v5.0
后端 API 服务 (FastAPI)

功能：
1. App Store 工具类 Top20 榜单 + 变更检测 + 广告创意
2. 多源热点抓取（Reddit/X/TikTok/Google/IP文化/节日/游戏）
3. AI 分析引擎（热点 → 广告创意自动转化）
4. 可视化数据呈现，中英双语
5. 后台定时自动刷新
"""
import json
import os
import sys
import threading
import time as _time
from datetime import datetime, timedelta, UTC
from typing import Optional

# 加载 .env 环境变量
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

# 确保模块导入路径正确
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.data_sources import DataAggregator
from services.ai_analyzer import AIAnalyzer
from services.app_store_scraper import AppStoreScraper
from services.competitor_monitor import (
    get_watchlist, add_to_watchlist, remove_from_watchlist,
    check_single_app, check_all, get_alerts,
    get_settings as get_monitor_settings, update_settings,
    get_monitor_status, start_background_monitor,
    push_wecom_notification,
)
from models.topic import HotspotTopic, TopicListResponse


# ============ FastAPI 应用 ============
app = FastAPI(
    title="GameAd Insight API",
    description="游戏视频广告灵感平台 - 后端API",
    version="4.0.0",
)

# CORS - 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ 内存数据存储 ============
cached_topics: list[HotspotTopic] = []
last_fetch_time: str = ""
favorites: dict[str, HotspotTopic] = {}  # id -> topic
app_store_cache: list[dict] = []
app_store_last_fetch: str = ""
app_store_changes: list[dict] = []

# ============ 定时刷新配置 ============
REFRESH_INTERVAL = 1800  # 30分钟，单位秒
_auto_refresh_enabled = True
_next_refresh_time: datetime = datetime.now(UTC) + timedelta(seconds=REFRESH_INTERVAL)


# ============ 数据抓取 & 缓存 ============
def refresh_data(force: bool = False):
    """刷新数据：抓取 + 分析 + 缓存"""
    global cached_topics, last_fetch_time, _next_refresh_time

    # 如果已有数据且不超过30分钟，不重复抓取（除非强制）
    if cached_topics and not force:
        if last_fetch_time:
            try:
                last_dt = datetime.fromisoformat(last_fetch_time)
                if (datetime.now(UTC) - last_dt).total_seconds() < REFRESH_INTERVAL:
                    return cached_topics
            except:
                pass

    # 抓取所有数据源
    raw_topics = DataAggregator.fetch_all()

    # AI 分析
    analyzed_topics = AIAnalyzer.batch_analyze(raw_topics)

    # 缓存结果
    cached_topics = analyzed_topics
    last_fetch_time = datetime.now(UTC).isoformat()
    _next_refresh_time = datetime.now(UTC) + timedelta(seconds=REFRESH_INTERVAL)

    return cached_topics


def _background_refresh_loop():
    """后台线程：定时自动刷新数据"""
    global cached_topics, last_fetch_time, _next_refresh_time
    print("[后台定时任务] 已启动，每30分钟自动刷新一次")
    while _auto_refresh_enabled:
        _time.sleep(60)  # 每分钟检查一次
        try:
            now = datetime.now(UTC)
            if now >= _next_refresh_time:
                print(f"[后台定时任务] {now.isoformat()} 自动刷新数据...")
                refresh_data(force=True)
                try:
                    _refresh_app_store(force=True)
                except Exception as e:
                    print(f"[后台定时任务] App Store刷新失败: {e}")
                print(f"[后台定时任务] 刷新完成，下次刷新: {_next_refresh_time.isoformat()}")
        except Exception as e:
            print(f"[后台定时任务] 刷新失败: {e}")
            _next_refresh_time = datetime.now(UTC) + timedelta(seconds=REFRESH_INTERVAL)


# ============ 平台元数据 ============
PLATFORM_META = {
    "overall":        {"label": "综合排行 / Overview", "icon": "🏆", "color": "#00B894"},
    "app_store":      {"label": "App Store 榜单 / Rankings", "icon": "📱", "color": "#0A84FF"},
    "reddit_hot":     {"label": "Reddit 热帖 / Reddit", "icon": "🔥", "color": "#FF4500"},
    "twitter_trend":  {"label": "X/Twitter 趋势 / X Trends", "icon": "🐦", "color": "#1DA1F2"},
    "tiktok_trend":   {"label": "TikTok 趋势 / TikTok", "icon": "🎵", "color": "#FF0050"},
    "google_trends":  {"label": "Google 趋势 / Trends", "icon": "📈", "color": "#4285F4"},
    "pop_culture_ip": {"label": "流行文化IP / Pop Culture", "icon": "🎬", "color": "#E84393"},
    "seasonal_event": {"label": "节日营销 / Events", "icon": "🎉", "color": "#FDCB6E"},
}


# ============ API 路由 ============
# 注意："/" 根路由由静态文件服务处理（生产模式下返回前端页面）


@app.get("/api/status")
async def get_status():
    """系统状态：含下次自动刷新时间"""
    now = datetime.now(UTC)
    next_refresh = _next_refresh_time
    seconds_left = max(0, (next_refresh - now).total_seconds())
    return {
        "last_refresh": last_fetch_time,
        "next_refresh": next_refresh.isoformat(),
        "seconds_until_refresh": int(seconds_left),
        "auto_refresh_enabled": _auto_refresh_enabled,
        "refresh_interval": REFRESH_INTERVAL,
        "total_topics": len(cached_topics),
        "ai_mode": "规则引擎 + Google翻译" + (" + Groq增强" if os.getenv("GROQ_API_KEY", "") else ""),
        "groq_enabled": os.getenv("GROQ_API_KEY", "") != "",
        "free_mode": True,
    }


@app.get("/api/platforms")
async def get_platforms():
    """获取所有平台列表及各平台热点数量"""
    topics = refresh_data()

    platform_stats = {}
    for key, meta in PLATFORM_META.items():
        if key == "overall":
            platform_stats[key] = {**meta, "count": len(topics)}
        else:
            count = sum(1 for t in topics if t.source == key)
            platform_stats[key] = {**meta, "count": count}

    return {"platforms": platform_stats}


@app.get("/api/rankings/{platform}")
async def get_rankings(
    platform: str,
    limit: int = Query(50, ge=1, le=200),
    sort_by: str = Query("heat_score", description="排序: heat_score / creative_index / ad_relevance / velocity_score"),
):
    """
    按平台获取AI梳理后的热点排行
    platform: overall / reddit_hot / tiktok_trend / google_trends / pop_culture_ip / seasonal_event
    """
    topics = refresh_data()

    # 筛选平台
    if platform == "overall":
        filtered = list(topics)
    else:
        filtered = [t for t in topics if t.source == platform]

    # 排序
    valid_sort = ["heat_score", "creative_index", "ad_relevance", "velocity_score"]
    sort_field = sort_by if sort_by in valid_sort else "heat_score"
    filtered.sort(key=lambda x: getattr(x, sort_field, 0), reverse=True)

    # 截取
    total = len(filtered)
    paged = filtered[:limit]

    return {
        "platform": platform,
        "platform_meta": PLATFORM_META.get(platform, {}),
        "total": total,
        "rankings": paged,
    }


@app.get("/api/rankings")
async def get_overall_rankings(
    limit: int = Query(50, ge=1, le=200),
):
    """跨平台综合排行（按热度排序）"""
    return await get_rankings("overall", limit=limit, sort_by="heat_score")


@app.get("/api/topics", response_model=TopicListResponse)
async def get_topics(
    source: str = Query("", description="数据源过滤"),
    sentiment: str = Query("", description="情绪标签过滤"),
    template: str = Query("", description="创意模板过滤"),
    genre: str = Query("", description="游戏类型过滤"),
    region: str = Query("", description="地区过滤"),
    keyword: str = Query("", description="关键词搜索"),
    min_relevance: float = Query(0, ge=0, le=10),
    min_heat: float = Query(0, ge=0, le=100),
    sort_by: str = Query("heat_score", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """获取热点列表（支持多维度筛选和排序）"""
    topics = refresh_data()

    filtered = []
    for t in topics:
        if source and t.source != source:
            continue
        if sentiment and sentiment not in (t.sentiment_tags or []):
            continue
        if genre and genre not in (t.recommended_genres or []):
            continue
        if region and t.region != region.upper() and t.region != "global":
            continue
        if keyword and keyword.lower() not in t.title.lower() and keyword.lower() not in t.summary.lower():
            continue
        if t.ad_relevance < min_relevance:
            continue
        if t.heat_score < min_heat:
            continue
        if template:
            has_template = any(a.angle_type == template for a in t.ad_angles)
            if not has_template:
                continue
        filtered.append(t)

    reverse_order = sort_order == "desc"
    valid_sort_fields = ["heat_score", "creative_index", "ad_relevance", "velocity_score"]
    sort_field = sort_by if sort_by in valid_sort_fields else "heat_score"
    filtered.sort(key=lambda x: getattr(x, sort_field, 0), reverse=reverse_order)

    total = len(filtered)
    paged = filtered[offset:offset + limit]

    return TopicListResponse(total=total, topics=paged)


@app.get("/api/topics/{topic_id}")
async def get_topic_detail(topic_id: str):
    """获取单个热点详情"""
    topics = refresh_data()
    for t in topics:
        if t.id == topic_id:
            return t
    raise HTTPException(status_code=404, detail=f"Topic {topic_id} not found")


@app.post("/api/favorites/{topic_id}")
async def add_favorite(topic_id: str):
    """添加收藏"""
    topics = refresh_data()
    for t in topics:
        if t.id == topic_id:
            favorites[topic_id] = t
            return {"status": "added", "id": topic_id}
    raise HTTPException(status_code=404, detail=f"Topic {topic_id} not found")


@app.delete("/api/favorites/{topic_id}")
async def remove_favorite(topic_id: str):
    """取消收藏"""
    if topic_id in favorites:
        del favorites[topic_id]
        return {"status": "removed", "id": topic_id}
    raise HTTPException(status_code=404, detail=f"Favorite {topic_id} not found")


@app.get("/api/favorites")
async def get_favorites():
    """获取收藏列表"""
    return {"total": len(favorites), "favorites": list(favorites.values())}


@app.post("/api/refresh")
async def force_refresh():
    """强制刷新所有数据源"""
    global cached_topics, last_fetch_time, _next_refresh_time
    cached_topics = []
    last_fetch_time = ""
    topics = refresh_data(force=True)
    return {
        "status": "refreshed",
        "total": len(topics),
        "fetched_at": last_fetch_time,
        "next_auto_refresh": _next_refresh_time.isoformat(),
    }


@app.get("/api/stats")
async def get_stats():
    """平台统计概览"""
    topics = refresh_data()

    stats = {
        "total_topics": len(topics),
        "last_refresh": last_fetch_time,
        "next_refresh": _next_refresh_time.isoformat(),
        "seconds_until_refresh": max(0, int((_next_refresh_time - datetime.now(UTC)).total_seconds())),
        "auto_refresh_enabled": _auto_refresh_enabled,
        "refresh_interval": REFRESH_INTERVAL,
        "total_favorites": len(favorites),
        "groq_enabled": os.getenv("GROQ_API_KEY", "") != "",
        "ai_mode": "规则引擎 + Google翻译" + (" + Groq增强" if os.getenv("GROQ_API_KEY", "") else ""),
        "free_mode": True,
        "by_source": {},
        "by_sentiment": {},
        "by_genre": {},
        "avg_ad_relevance": 0,
        "avg_heat_score": 0,
    }

    if topics:
        stats["avg_ad_relevance"] = round(sum(t.ad_relevance for t in topics) / len(topics), 1)
        stats["avg_heat_score"] = round(sum(t.heat_score for t in topics) / len(topics), 1)

        for t in topics:
            src = t.source
            stats["by_source"][src] = stats["by_source"].get(src, 0) + 1

            for s in (t.sentiment_tags or []):
                stats["by_sentiment"][s] = stats["by_sentiment"].get(s, 0) + 1

            for g in (t.recommended_genres or []):
                stats["by_genre"][g] = stats["by_genre"].get(g, 0) + 1

    return stats


@app.get("/api/templates")
async def get_creative_templates():
    """获取可用创意模板列表"""
    from services.ai_analyzer import TEMPLATE_DEFINITIONS
    return {
        "templates": {
            tid: {
                "name": tdef["name"],
                "description": tdef["desc"],
                "hook_examples": tdef["hook_examples"],
            }
            for tid, tdef in TEMPLATE_DEFINITIONS.items()
        }
    }


# ============ App Store 榜单 & 变更检测 API ============

def _refresh_app_store(force: bool = False):
    """刷新 App Store 数据"""
    global app_store_cache, app_store_last_fetch, app_store_changes

    if app_store_cache and not force:
        if app_store_last_fetch:
            try:
                last = datetime.fromisoformat(app_store_last_fetch)
                if (datetime.now(UTC) - last).total_seconds() < 3600:
                    return app_store_cache, app_store_changes
            except:
                pass

    apps = AppStoreScraper.fetch_top20()
    previous = AppStoreScraper._get_previous_snapshot()
    prev_apps = previous.get("apps", []) if previous else []

    changes = AppStoreScraper.detect_changes(apps, prev_apps)
    AppStoreScraper.save_snapshot(apps)

    app_store_cache = apps
    app_store_last_fetch = datetime.now(UTC).isoformat()
    app_store_changes = changes

    return apps, changes


@app.get("/api/appstore/top20")
async def get_app_store_top20(
    category: str = Query("TOOLS", description="类别: TOOLS/ART_AND_DESIGN/PHOTOGRAPHY/PRODUCTIVITY/BUSINESS/GAME_ACTION/etc"),
    sort_by: str = Query("rank", description="排序: rank / rating / changes"),
    chart_type: str = Query("free", description="榜单类型: free(免费榜) / paid(付费榜)"),
    country: str = Query("US", description="国家代码: US/CN/JP/GB/DE/KR/FR/IN"),
):
    """获取指定类别的 App Store Top 20 榜单（含变更检测，支持动态类别+国家+免费/付费）"""
    print(f"[API /api/appstore/top20] 收到参数: category={category}, chart_type={chart_type}, country={country}")
    print(f"[API] 调用 AppStoreScraper.fetch_top20(category='{category.upper()}', chart_type='{chart_type}', country='{country}')")
    apps = AppStoreScraper.fetch_top20(category=category.upper(), chart_type=chart_type, country=country.upper())
    previous = AppStoreScraper._get_previous_snapshot()
    prev_apps = previous.get("apps", []) if previous else []

    changes = AppStoreScraper.detect_changes(apps, prev_apps)
    AppStoreScraper.save_snapshot(apps)

    # 合并变更信息
    change_map = {c["app_id"]: c for c in changes}
    enriched = []
    for app in apps:
        entry = dict(app)
        chg = change_map.get(app["app_id"], {})
        entry["has_changes"] = chg.get("has_changes", False)
        entry["alert_level"] = chg.get("alert_level", "none")
        entry["changes"] = chg.get("changes", [])
        entry["rank_previous"] = chg.get("rank_previous")
        # 提取排名变动数值（用于前端增长分析展示）
        for c in chg.get("changes", []):
            if c.get("type") == "rank_change":
                entry["rank_change"] = c.get("rank_delta", 0)
                break
        enriched.append(entry)

    # 排序
    if sort_by == "rating":
        enriched.sort(key=lambda x: x.get("rating", 0), reverse=True)
    elif sort_by == "changes":
        enriched.sort(key=lambda x: len(x.get("changes", [])), reverse=True)

    # 统计
    has_changes = sum(1 for e in enriched if e["has_changes"])
    critical = sum(1 for e in enriched if e["alert_level"] == "critical")
    warnings = sum(1 for e in enriched if e["alert_level"] == "warning")

    return {
        "total": len(enriched),
        "has_changes_count": has_changes,
        "critical_count": critical,
        "warning_count": warnings,
        "fetched_at": app_store_last_fetch,
        "apps": enriched,
    }


@app.get("/api/appstore/changes")
async def get_app_store_changes():
    """获取仅含变更的榜单（变更提醒）"""
    _, changes = _refresh_app_store()
    changed_only = [c for c in changes if c.get("has_changes")]
    critical = [c for c in changed_only if c.get("alert_level") == "critical"]
    warnings = [c for c in changed_only if c.get("alert_level") == "warning"]
    return {
        "total_changed": len(changed_only),
        "critical": len(critical),
        "warnings": len(warnings),
        "changes": changed_only,
    }


@app.get("/api/appstore/app/{app_id}")
async def get_app_detail(app_id: str):
    """获取单个 App 详情 + 广告创意思路（通过 iTunes Lookup 精确查找）"""
    import httpx

    # 方法1：先用 iTunes Lookup API 精确查找（最可靠，不依赖缓存）
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            lookup_url = f"https://itunes.apple.com/lookup?id={app_id}"
            resp = await client.get(lookup_url)
            result = resp.json()
            results = result.get("results", [])
            if results:
                itunes_app = results[0]
                # 转换为统一格式
                app = {
                    "app_id": str(itunes_app.get("trackId", app_id)),
                    "name": itunes_app.get("trackName", "Unknown"),
                    "developer": itunes_app.get("artistName", "Unknown"),
                    "icon_url": itunes_app.get("artworkUrl512") or itunes_app.get("artworkUrl100", ""),
                    "rating": itunes_app.get("averageUserRating", 0) or 0,
                    "rating_count": itunes_app.get("userRatingCount", 0) or 0,
                    "price": itunes_app.get("price", 0) or 0,
                    "version": itunes_app.get("version", "—"),
                    "category": itunes_app.get("primaryGenreName", "—"),
                    "description": itunes_app.get("description", "")[:500],
                    "screenshots": itunes_app.get("screenshotUrls", [])[:5],
                    "rank": 0,
                    "changes": [],
                    "alert_level": "none",
                }
                ideas = AppStoreScraper.get_creative_ideas(app)
                return {"app": app, "creative_ideas": ideas}
    except Exception as e:
        print(f"[API] iTunes Lookup 失败: {e}, 尝试从缓存中查找...")

    # 方法2：从缓存中搜索（兜底）
    apps, _ = _refresh_app_store()
    for app in apps:
        if app.get("app_id") == app_id or str(app.get("id", "")) == app_id:
            ideas = AppStoreScraper.get_creative_ideas(app)
            return {"app": app, "creative_ideas": ideas}

    raise HTTPException(status_code=404, detail=f"App {app_id} not found")


@app.get("/api/creative/tools")
async def get_tools_creative_templates():
    """获取工具类 APP 广告创意模板"""
    from services.app_store_scraper import TOOLS_AD_TEMPLATES
    return {"templates": TOOLS_AD_TEMPLATES}


# ============ Google Play 榜单 API ============

@app.get("/api/googleplay/top")
async def get_google_play_top(
    category: str = Query("ART_AND_DESIGN", description="类别"),
    country: str = Query("US", description="国家代码"),
    chart_type: str = Query("free", description="榜单类型 free/paid"),
    limit: int = Query(20, ge=1, le=100),
):
    """获取 Google Play 榜单 Top N"""
    from services.google_play_scraper import fetch_top_charts, detect_changes, load_latest_snapshot
    apps = fetch_top_charts(category=category.upper(), country=country, chart_type=chart_type, limit=limit)
    # 变更检测
    prev = load_latest_snapshot(category.upper(), country, chart_type)
    if prev:
        apps = detect_changes(apps, prev)
    # 保存快照
    from services.google_play_scraper import save_snapshot
    save_snapshot(apps, category.upper(), country, chart_type)
    has_changes = [a for a in apps if a.get("change_type") not in ("none", None, "")]
    return {
        "total": len(apps),
        "category": category,
        "category_zh": _cat_zh(category.upper()),
        "category_en": _cat_en(category.upper()),
        "country": country,
        "chart_type": chart_type,
        "has_changes_count": len(has_changes),
        "apps": apps,
    }


@app.get("/api/googleplay/app/{app_id}")
async def get_google_play_app_detail(app_id: str, country: str = Query("US")):
    """获取 Google Play 单个 App 详情"""
    from services.google_play_scraper import fetch_app_detail
    detail = fetch_app_detail(app_id, country=country)
    if not detail:
        raise HTTPException(status_code=404, detail=f"App {app_id} not found")
    return detail


# ============ Meta 广告库 API ============

# ============ App 专属广告素材 API ============

@app.get("/api/appstore/app/{app_id}/ads")
async def get_app_ads(app_id: str, country: str = Query("US")):
    """获取 App 广告素材 — 视频广告 + 截图完全分离"""
    import requests as sync_requests

    app_name = ""
    developer = ""
    icon_url = ""
    itunes_screenshots = []
    app_store_url = ""

    # ===== 1. 获取 App 基本信息 (iTunes Lookup) =====
    try:
        r = sync_requests.get(f"https://itunes.apple.com/lookup?id={app_id}", timeout=10)
        result = r.json()
        if result.get("results"):
            rr = result["results"][0]
            app_name = rr.get("trackName", "")
            developer = rr.get("artistName", "")
            icon_url = rr.get("artworkUrl512", "")
            itunes_screenshots = rr.get("screenshotUrls", [])
            app_store_url = rr.get("trackViewUrl", "")
    except Exception as e:
        print(f"[AppAds] iTunes Lookup fail: {e}")

    if not app_name:
        apps, _ = _refresh_app_store()
        for a in apps:
            if a.get("app_id") == app_id:
                app_name = a.get("name", "")
                developer = a.get("developer", "")
                icon_url = a.get("icon_url", "")
                itunes_screenshots = a.get("screenshots", [])
                break

    if not app_name:
        raise HTTPException(status_code=404, detail=f"App {app_id} not found")

    # ===== 数据结构：视频广告 与 截图 彻底分离 =====
    video_ads = []         # 真实视频广告（可播放）
    store_screenshots = []  # 商店截图（不可播放，仅供预览）
    ad_sources = []         # 广告来源标签
    fb_scraper_error = ""   # Facebook 爬虫错误信息

    # ===== 2. 🔥 来源1：Facebook Ad Library 真实广告 =====
    fb_ads = []
    try:
        from services.facebook_ad_scraper import search_facebook_ads
        fb_ads = search_facebook_ads(app_name, country=country, limit=10, media_type="all")
        print(f"[AppAds] Facebook Ad Library: {len(fb_ads)} ads for {app_name}")
    except ImportError as e:
        fb_scraper_error = f"Selenium/Chrome 环境缺失: {e}"
        print(f"[AppAds] Facebook scraper import error: {e}")
    except Exception as e:
        fb_scraper_error = str(e)
        print(f"[AppAds] Facebook scraper error: {e}")

    # 将 FB 广告格式化为统一 video_ads 格式
    for ad in fb_ads:
        video_ads.append({
            "ad_id": ad.get("ad_id", ""),
            "source": "facebook",
            "source_icon": "📘",
            "source_label_zh": "Facebook 广告库",
            "source_label_en": "Facebook Ad Library",
            "platform_label_zh": ad.get("platforms_zh", ["Facebook"])[0],
            "platform_label_en": ad.get("platforms", ["facebook"])[0].title(),
            "platform_color": "#1877F2",
            "title_zh": ad.get("title", ""),
            "title_en": ad.get("title_en", ""),
            "body_zh": ad.get("body", ""),
            "body_en": ad.get("body_en", ""),
            "thumbnail_url": ad.get("thumbnail_url", ""),
            "snapshot_url": ad.get("snapshot_url", ""),
            "video_url": ad.get("video_url"),
            "video_id": ad.get("video_id"),
            "is_video": True if ad.get("video_url") or ad.get("video_id") else False,
            "creative_type": ad.get("creative_type", "IMAGE"),
            "creative_type_zh": ad.get("creative_type_zh", "图片广告"),
            "first_seen": ad.get("first_seen", ""),
            "last_seen": ad.get("last_seen", "投放中"),
            "is_real": True,
        })

    if fb_ads:
        ad_sources.append({"name": "Facebook Ad Library", "icon": "📘", "count": len(fb_ads), "color": "#1877F2"})

    # ===== 3. 来源2：Meta API（如有 Token）=====
    meta_token = os.getenv("META_AD_API_TOKEN", "")
    if meta_token:
        try:
            from services.meta_ad_library import search_ads_by_advertiser
            meta_ads_raw = search_ads_by_advertiser(app_name, country, 10, use_api=True, api_token=meta_token)
            real_meta = [a for a in meta_ads_raw if not a.get("is_placeholder")]
            for ad in real_meta:
                video_ads.append({
                    "ad_id": ad.get("ad_id", ""),
                    "source": "meta_api",
                    "source_icon": "📘",
                    "source_label_zh": "Meta 广告库",
                    "source_label_en": "Meta Ad Library",
                    "platform_label_zh": ad.get("platforms_zh", ["Meta"])[0] if ad.get("platforms_zh") else "Meta",
                    "platform_label_en": ad.get("platforms", ["meta"])[0].title() if ad.get("platforms") else "Meta",
                    "platform_color": "#0668E1",
                    "title_zh": ad.get("title", ""),
                    "title_en": ad.get("title", ""),
                    "body_zh": ad.get("body", ""),
                    "body_en": ad.get("body", ""),
                    "thumbnail_url": ad.get("snapshot_url", ""),
                    "snapshot_url": ad.get("snapshot_url", ""),
                    "video_url": ad.get("video_url"),
                    "video_id": ad.get("video_id"),
                    "is_video": ad.get("creative_type") == "VIDEO",
                    "creative_type": ad.get("creative_type", "IMAGE"),
                    "creative_type_zh": ad.get("creative_type_zh", "广告"),
                    "first_seen": ad.get("first_seen", ""),
                    "last_seen": ad.get("last_seen", "投放中"),
                    "is_real": True,
                })
            if real_meta:
                ad_sources.append({"name": "Meta API", "icon": "📘", "count": len(real_meta), "color": "#0668E1"})
        except Exception as e:
            print(f"[AppAds] Meta API error: {e}")

    # ===== 3.5 来源3：Google Ads Transparency Center（完全免费）=====
    google_ads_count = 0
    try:
        from services.google_ads_scraper import search_google_ads
        # 简化搜索词（去掉副标题），提高匹配率
        ga_search_name = app_name.split(":")[0].split("-")[0].strip()
        google_ads = search_google_ads(ga_search_name, country=country, limit=8)
        for ad in google_ads:
            video_ads.append({
                "ad_id": ad.get("ad_id", ""),
                "source": "google_ads",
                "source_icon": "🔍",
                "source_label_zh": "Google Ads 透明度中心",
                "source_label_en": "Google Ads Transparency",
                "platform_label_zh": ad.get("platform_label_zh", "Google Ads"),
                "platform_label_en": ad.get("platform_label_en", "Google Ads"),
                "platform_color": "#34A853",
                "title_zh": ad.get("title_zh", ""),
                "title_en": ad.get("title_en", ""),
                "body_zh": ad.get("body_zh", ""),
                "body_en": ad.get("body_en", ""),
                "thumbnail_url": ad.get("thumbnail_url", ""),
                "snapshot_url": ad.get("snapshot_url", ""),
                "video_url": ad.get("video_url"),
                "video_id": ad.get("video_id"),
                "is_video": ad.get("is_video", False),
                "creative_type": ad.get("creative_type", "AD"),
                "creative_type_zh": ad.get("creative_type_zh", "Google广告"),
                "first_seen": ad.get("first_seen", ""),
                "last_seen": ad.get("last_seen", "投放中"),
                "is_real": True,
                "external_url": ad.get("external_url", ""),
                "times_shown": ad.get("times_shown", ""),
            })
        google_ads_count = len(google_ads)
        if google_ads:
            ad_sources.append({"name": "Google Ads", "icon": "🔍", "count": len(google_ads), "color": "#34A853"})
            print(f"[AppAds] Google Ads Transparency: {len(google_ads)} ads for {app_name}")
    except ImportError as e:
        print(f"[AppAds] Google Ads scraper import error: {e}")
    except Exception as e:
        print(f"[AppAds] Google Ads error: {e}")

    # ===== 4. 来源4：Google Play 宣传视频 + 截图 =====
    gp_video_url = None
    gp_video_thumb = None
    gp_video_title = ""
    gp_screenshots = []
    gp_app_found = False

    try:
        from google_play_scraper import search as gp_search
        # 尝试多种搜索词找到正确的 App
        # google-play-scraper 的 search() 结果直接包含 video/screenshots, 无需再调 app()
        search_terms = [app_name]
        # 简化名字再试
        simple_name = app_name.split(":")[0].split("-")[0].strip()
        if simple_name != app_name:
            search_terms.append(simple_name)
        if developer and developer != app_name:
            search_terms.append(f"{app_name} {developer}")
            search_terms.append(f"{simple_name} {developer}")
        
        for term in search_terms[:3]:
            if gp_app_found:
                break
            try:
                results = gp_search(term, n_hits=10, country=country.lower())
                for r in results:
                    gp_title = r.get("title", "")
                    if not gp_title:
                        continue
                    # 模糊匹配：检查是否同一个 App（忽略冒号后的副标题差异）
                    as_title_clean = app_name.lower().split(":")[0].strip()
                    gp_title_clean = gp_title.lower().split(":")[0].strip()
                    is_match = (
                        as_title_clean in gp_title_clean or 
                        gp_title_clean in as_title_clean or
                        (simple_name.lower() in gp_title.lower())
                    )
                    if not is_match:
                        continue
                    
                    # ✅ 直接从搜索结果取 video 和 screenshots（无需 app()）
                    video = r.get("video")
                    video_image = r.get("videoImage")
                    screenshots_list = r.get("screenshots", [])
                    
                    if video:
                        gp_video_url = video
                        gp_video_thumb = video_image or ""
                        gp_video_title = gp_title
                    if screenshots_list:
                        gp_screenshots = screenshots_list[:12]
                    
                    gp_app_found = True
                    print(f"[AppAds] Google Play: {gp_title} video={'✅' if video else '❌'} screenshots={len(screenshots_list)} (term='{term}')")
                    break
            except Exception as e:
                print(f"[AppAds] GP search '{term}' fail: {e}")
                continue
    except ImportError:
        print("[AppAds] google-play-scraper 未安装")
    except Exception as e:
        print(f"[AppAds] GP fail: {e}")

    # GP 视频广告卡
    gp_video_card = None
    if gp_video_url:
        yt_id = ""
        if "youtube.com/embed/" in gp_video_url:
            yt_id = gp_video_url.split("youtube.com/embed/")[1].split("?")[0].split("/")[0]
        elif "youtube.com/watch?v=" in gp_video_url:
            yt_id = gp_video_url.split("watch?v=")[1].split("&")[0]
        elif "youtu.be/" in gp_video_url:
            yt_id = gp_video_url.split("youtu.be/")[1].split("?")[0]

        gp_video_card = {
            "ad_id": f"gp_video_{app_id}",
            "source": "google_play",
            "source_icon": "▶️",
            "source_label_zh": "Google Play 宣传视频",
            "source_label_en": "Google Play Promo Video",
            "platform_label_zh": "Google Play · YouTube",
            "platform_label_en": "Google Play · YouTube",
            "platform_color": "#FF0000",
            "title_zh": f"{app_name} — 官方宣传视频",
            "title_en": f"{app_name} — Official Promo Video",
            "body_zh": "Google Play 商店官方宣传视频，展示 App 核心功能",
            "body_en": "Official Google Play promo video showcasing core features",
            "thumbnail_url": gp_video_thumb or icon_url,
            "snapshot_url": gp_video_thumb or icon_url,
            "video_url": gp_video_url,
            "video_id": yt_id,
            "is_video": True,
            "creative_type": "VIDEO",
            "creative_type_zh": "宣传视频",
            "first_seen": "",
            "last_seen": "",
            "is_real": True,
        }

    # GP 截图（单独的列表）
    for url in gp_screenshots:
        if url and url not in store_screenshots:
            store_screenshots.append(url)

    # ===== 5. App Store 截图（单独的列表）=====
    for url in itunes_screenshots:
        if url and url not in store_screenshots:
            store_screenshots.append(url)

    # ===== 6. 组装最终结果 =====
    # GP 视频排在第一位（如果存在且没有FB广告）
    if gp_video_card:
        # 不重复添加（如果FB已有同名视频）
        if not any(a.get("video_id") == gp_video_card["video_id"] for a in video_ads):
            video_ads.insert(0, gp_video_card)
        if not any(s["name"] == "Google Play Video" for s in ad_sources):
            ad_sources.append({"name": "Google Play Video", "icon": "▶️", "count": 1, "color": "#FF0000"})

    # 来源汇总
    has_real_ads = len(video_ads) > 0
    primary_source = ""
    if any(a["source"] == "facebook" for a in video_ads):
        primary_source = "facebook_ad_library"
    elif any(a["source"] == "meta_api" for a in video_ads):
        primary_source = "meta_api"
    elif any(a["source"] == "google_play" for a in video_ads):
        primary_source = "google_play"

    print(f"[AppAds] 最终结果: {len(video_ads)} 视频广告 + {len(store_screenshots)} 截图, 来源: {[s['name'] for s in ad_sources]}")

    return {
        "app_id": app_id,
        "app_name": app_name,
        "developer": developer,
        "icon_url": icon_url,
        "app_store_url": app_store_url,
        "country": country,
        # 视频广告列表（可播放）
        "video_ads": video_ads,
        "total_video_ads": len(video_ads),
        # 商店截图（仅供预览，不混入广告）
        "store_screenshots": store_screenshots,
        "total_screenshots": len(store_screenshots),
        # 元信息
        "has_real_ads": has_real_ads,
        "primary_source": primary_source,
        "ad_sources": ad_sources,
        "meta_token_configured": bool(meta_token),
        "fb_scraper_error": fb_scraper_error,
        # 兼容旧前端字段
        "ads": video_ads,   # 兼容
        "total": len(video_ads),  # 兼容
        "is_real_ads": has_real_ads,  # 兼容
        "source": primary_source,  # 兼容
        "api_configured": bool(meta_token),  # 兼容
    }


@app.get("/api/meta/ads")
async def get_meta_ads(
    advertiser: str = Query(..., description="广告主名称"),
    country: str = Query("US", description="国家代码"),
    limit: int = Query(20, ge=1, le=100),
):
    """搜索 Meta (Facebook/Instagram) 广告库"""
    from services.meta_ad_library import search_ads_by_advertiser, detect_ad_changes
    ads = search_ads_by_advertiser(advertiser, country=country, limit=limit)
    # 变更检测
    changes = detect_ad_changes(advertiser.replace(" ", "_"), ads)
    return {
        "advertiser": advertiser,
        "country": country,
        "total": len(ads),
        "has_new_ads": changes["has_new"],
        "new_count": changes["new_count"],
        "stopped_count": changes["stopped_count"],
        "alert_level": changes["alert_level"],
        "changes": changes["details"],
        "is_first_run": changes.get("is_first_run", False),
        "ads": ads,
    }


# ============ 双商店合并排名 API ============

@app.get("/api/store/combined")
async def get_combined_ranking(
    category: str = Query("TOOLS", description="类别（App Store 用）/ ART_AND_DESIGN（Google Play 用）"),
    country: str = Query("US", description="国家代码"),
    chart_type: str = Query("free", description="榜单类型 free/paid"),
    limit: int = Query(20, ge=1, le=50),
):
    """获取 App Store + Google Play 合并排名（去重，按名称匹配）"""
    from services.app_store_scraper import AppStoreScraper
    from services.google_play_scraper import fetch_top_charts
    # App Store
    as_apps = AppStoreScraper.fetch_top20()
    # Google Play（类别需映射）
    gp_category = _map_category_to_gp(category)
    gp_apps = fetch_top_charts(category=gp_category, country=country, chart_type=chart_type, limit=limit)
    # 合并去重（按名称模糊匹配）
    combined = _merge_store_apps(as_apps, gp_apps)
    return {
        "category": category,
        "country": country,
        "chart_type": chart_type,
        "total": len(combined),
        "apps": combined[:limit],
    }


def _cat_zh(cat: str) -> str:
    from services.google_play_scraper import CATEGORY_MAP
    return CATEGORY_MAP.get(cat, {}).get("zh", cat)

def _cat_en(cat: str) -> str:
    from services.google_play_scraper import CATEGORY_MAP
    return CATEGORY_MAP.get(cat, {}).get("en", cat)

def _map_category_to_gp(cat: str) -> str:
    """将 App Store 类别映射为 Google Play 类别"""
    m = {"TOOLS": "TOOLS", "Graphics & Design": "ART_AND_DESIGN", "Photography": "PHOTOGRAPHY",
           "Productivity": "PRODUCTIVITY", "Business": "BUSINESS", "Education": "EDUCATION",
           "Entertainment": "ENTERTAINMENT"}
    return m.get(cat, "TOOLS")

def _merge_store_apps(as_apps: list, gp_apps: list) -> list:
    """合并双商店应用列表，去重"""
    seen = set()
    merged = []
    for app in as_apps + gp_apps:
        name_key = app.get("name", "").lower().replace(" ", "")
        if name_key and name_key not in seen:
            seen.add(name_key)
            merged.append(app)
    # 重新排序（按原榜单排名加权）
    return merged


# ============ 竞品监控 API ============

class WatchAppRequest(BaseModel):
    app_id: str
    name: str
    developer: str = ""
    icon_url: str = ""
    platform: str = "app_store"
    bundle_id: str = ""
    country: str = "US"
    tags: list[str] = []


class MonitorSettingsRequest(BaseModel):
    wecom_webhooks: list[str] = []
    serverchan_send_keys: list[str] = []
    check_interval_hours: int = 1
    notify_new_ads: bool = True
    notify_screenshot_changes: bool = True


@app.get("/api/monitor/watchlist")
async def api_get_watchlist():
    """获取竞品关注列表"""
    items = get_watchlist()
    status = get_monitor_status()
    return {
        "total": len(items),
        "items": items,
        "monitor_running": status["running"],
        "check_interval_hours": status["check_interval_hours"],
        "wecom_configured": status["wecom_configured"],
        "serverchan_configured": status["serverchan_configured"],
        "any_notify_configured": status["any_notify_configured"],
    }


@app.post("/api/monitor/watch")
async def api_add_watch(app: WatchAppRequest):
    """添加 App 到关注列表"""
    result = add_to_watchlist(app.model_dump())
    return result


@app.delete("/api/monitor/watch/{app_id}")
async def api_remove_watch(app_id: str, platform: str = Query("app_store")):
    """从关注列表移除 App"""
    result = remove_from_watchlist(app_id, platform)
    return result


@app.post("/api/monitor/watch/bulk")
async def api_bulk_watch(apps: list[WatchAppRequest]):
    """批量添加 App 到关注列表"""
    results = []
    for app in apps:
        r = add_to_watchlist(app.model_dump())
        results.append(r)
    return {"total": len(apps), "added": sum(1 for r in results if r.get("status") == "added"), "results": results}


@app.post("/api/monitor/check")
async def api_check_all():
    """手动触发全量检查"""
    results = check_all()
    return {
        "total_checked": len(results),
        "new_ads_found": sum(1 for r in results if r.get("detections", {}).get("has_new")),
        "results": results,
        "checked_at": results[0]["checked_at"] if results else None,
    }


@app.post("/api/monitor/check/{app_id}")
async def api_check_single(app_id: str, platform: str = Query("app_store")):
    """手动检查单个 App"""
    items = get_watchlist()
    app = None
    for item in items:
        if str(item.get("app_id")) == app_id and item.get("platform") == platform:
            app = item
            break
    if not app:
        raise HTTPException(status_code=404, detail=f"App {app_id} not in watchlist")

    result = check_single_app(app)
    return result


@app.get("/api/monitor/history/{app_id}")
async def api_get_history(app_id: str, platform: str = Query("app_store")):
    """获取指定 App 的警报历史"""
    from services.competitor_monitor import get_alerts
    all_alerts = get_alerts(200)
    matched = [a for a in all_alerts if str(a.get("app_id")) == app_id and a.get("platform") == platform]
    return {"app_id": app_id, "total": len(matched), "alerts": matched}


@app.get("/api/monitor/settings")
async def api_get_settings():
    """获取监控设置"""
    return get_monitor_settings()


@app.post("/api/monitor/settings")
async def api_update_settings(settings: MonitorSettingsRequest):
    """更新监控设置"""
    updated = update_settings(settings.model_dump())
    return {"status": "updated", "settings": updated}


@app.post("/api/monitor/test-push")
async def api_test_push(channel: str = Query(None, description="渠道: wecom | serverchan | None=全部")):
    """测试推送（指定渠道或全部已配置渠道）"""
    from services.notification_service import test_push as do_test_push
    result = do_test_push(channel)
    if result.get("total_targets", 0) == 0:
        raise HTTPException(status_code=400, detail="未配置任何通知渠道。请先在设置中添加企业微信 Webhook 或 Server酱 SendKey。")

    return {
        "status": "sent" if result.get("success_targets", 0) > 0 else "failed",
        "total_channels": result.get("total_channels", 0),
        "success_channels": result.get("success_channels", 0),
        "total_targets": result.get("total_targets", 0),
        "success_targets": result.get("success_targets", 0),
        "details": result.get("details", []),
    }


@app.get("/api/monitor/search")
async def api_search_apps(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    country: str = Query("US"),
):
    """
    全局搜索 App（用于添加竞品）
    - App Store: iTunes Search API（全库搜索）
    - Google Play: google-play-scraper search()
    - 每次 1-2 次请求，不限于榜单/类别
    """
    import httpx
    results = []
    term = q.strip()

    # ===== App Store: iTunes Search API (全库，1 次请求) =====
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = f"https://itunes.apple.com/search?term={term}&entity=software&country={country}&limit=20"
            resp = await client.get(url)
            data = resp.json()
            for a in data.get("results", []):
                results.append({
                    "app_id": str(a.get("trackId", "")),
                    "name": a.get("trackName", ""),
                    "developer": a.get("artistName", ""),
                    "icon_url": a.get("artworkUrl100", ""),
                    "platform": "app_store",
                    "rating": a.get("averageUserRating", 0) or 0,
                    "category": a.get("primaryGenreName", ""),
                    "bundle_id": a.get("bundleId", ""),
                })
    except Exception as e:
        print(f"[MonitorSearch] App Store fail: {e}")

    # ===== Google Play: google-play-scraper search() =====
    try:
        from google_play_scraper import search as gp_search
        gp_results = gp_search(term, n_hits=15, country=country.lower())
        for a in gp_results:
            results.append({
                "app_id": a.get("appId", ""),
                "name": a.get("title", ""),
                "developer": a.get("developer", ""),
                "icon_url": a.get("icon", ""),
                "platform": "google_play",
                "rating": a.get("score", 0) or 0,
                "category": a.get("genre", ""),
                "bundle_id": a.get("appId", ""),
            })
    except Exception as e:
        print(f"[MonitorSearch] Google Play fail: {e}")

    # 去重
    seen = set()
    deduped = []
    for r in results:
        key = (r.get("name", "") + "|" + r.get("platform", "")).lower()
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return {"query": q, "total": len(deduped), "results": deduped[:20]}


@app.get("/api/monitor/status")
async def api_monitor_status():
    """获取监控运行状态"""
    return get_monitor_status()


# ============ 静态文件服务（生产部署） ============
# ⚠️ SPA 回调必须放在所有 API 路由之后，且只处理非 /api/ 路径
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

if os.path.exists(STATIC_DIR):
    # SPA 回退：所有非 API 路由返回 index.html（仅当路径不是 /api/ 开头）
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve SPA - all non-API routes return index.html for client-side routing"""
        # 如果是 API 路径但没匹配到，返回 404 JSON 而非 HTML
        if full_path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": f"API route not found: {full_path}"})
        file_path = os.path.join(STATIC_DIR, full_path) if full_path else ""
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    # 根路径
    @app.get("/")
    async def serve_root():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    # 挂载 assets 目录
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  GameAd Insight v5.0 - 游戏视频广告灵感平台")
    print("  后端服务启动中...")
    print("  [OK] App Store 工具类Top20榜单 + 变更检测")
    print("  [OK] 7大数据源: Reddit/X/TikTok/Google/IP/游戏/节日")
    print("  [OK] 后台定时刷新: 每30分钟自动更新")
    print("  [OK] 工具类APP广告创意模板")
    print("=" * 60)

    # 预热：启动时立即抓取一次数据
    print("\n[预热] 正在首次抓取数据...")
    refresh_data(force=True)
    print("[预热] 正在抓取 App Store 榜单...")
    _refresh_app_store(force=True)

    # 启动后台定时刷新线程
    refresh_thread = threading.Thread(target=_background_refresh_loop, daemon=True)
    refresh_thread.start()
    print(f"[后台] 定时刷新线程已启动，下次自动刷新: {_next_refresh_time.isoformat()}")

    # 启动竞品监控后台线程
    try:
        start_background_monitor()
        print("[后台] 竞品监控线程已启动")
    except Exception as e:
        print(f"[后台] 竞品监控启动失败: {e}")

    # 获取端口（Render 等平台通过 PORT 环境变量指定）
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
