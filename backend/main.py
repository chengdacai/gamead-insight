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
from models.topic import HotspotTopic, FilterParams, TopicListResponse


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
    sort_by: str = Query("rank", description="排序: rank / rating / changes"),
):
    """获取工具类 App Store Top 20 榜单（含变更检测）"""
    apps, changes = _refresh_app_store()

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
    """获取单个 App 详情 + 广告创意思路"""
    apps, _ = _refresh_app_store()
    for app in apps:
        if app.get("app_id") == app_id:
            ideas = AppStoreScraper.get_creative_ideas(app)
            return {
                "app": app,
                "creative_ideas": ideas,
            }
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


# ============ 静态文件服务（生产部署） ============
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

if os.path.exists(STATIC_DIR):
    # SPA 回退：所有非 API 路由返回 index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve SPA - all non-API routes return index.html for client-side routing"""
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

    # 获取端口（Render 等平台通过 PORT 环境变量指定）
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
