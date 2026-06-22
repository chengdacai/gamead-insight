"""
Google Play 榜单抓取服务
使用 google-play-scraper Python 包（支持按类别获取真实榜单数据）
"""
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional

try:
    from google_play_scraper import app as gp_app, search, Sort
    HAS_GP_SCRAPER = True
except ImportError:
    print("[GooglePlay] google-play-scraper 未安装，运行: pip install google-play-scraper")
    HAS_GP_SCRAPER = False

# 类别映射（用于 google-play-scraper 的 application 参数）
CATEGORY_MAP = {
    "TOOLS":        {"zh": "工具",     "en": "Tools",        "gp_cat": "TOOLS",         "keywords": ["tools", "utility", "file manager"]},
    "ART_AND_DESIGN": {"zh": "图形设计", "en": "Art & Design", "gp_cat": "ART_AND_DESIGN","keywords": ["art", "design", "drawing", "photo editor", "canva"]},
    "PHOTOGRAPHY":  {"zh": "摄影",     "en": "Photography",  "gp_cat": "PHOTOGRAPHY",  "keywords": ["camera", "photo", "video editor", "filter", "snapchat"]},
    "PRODUCTIVITY":  {"zh": "效率",     "en": "Productivity", "gp_cat": "PRODUCTIVITY",  "keywords": ["productivity", "calendar", "notes", "todo", "notion"]},
    "BUSINESS":      {"zh": "商务",     "en": "Business",     "gp_cat": "BUSINESS",      "keywords": ["business", "finance", "office", "linkedin", "slack"]},
    "EDUCATION":     {"zh": "教育",     "en": "Education",    "gp_cat": "EDUCATION",     "keywords": ["education", "learning", "language", "duolingo"]},
    "ENTERTAINMENT": {"zh": "娱乐",     "en": "Entertainment","gp_cat": "ENTERTAINMENT","keywords": ["entertainment", "streaming", "netflix"]},
}

# 榜单类型映射
CHART_TYPE_MAP = {
    "free": "topselling_free",
    "paid": "topselling_paid",
    "top_grossing": "topgrossing",
}


def fetch_top_charts(
    category: str = "ART_AND_DESIGN",
    country: str = "US",
    chart_type: str = "free",
    limit: int = 20,
) -> list[dict]:
    """
    获取 Google Play 榜单 Top N
    使用 google-play-scraper 的 search 功能按类别关键词搜索 + 评分排序模拟榜单
    """
    if not HAS_GP_SCRAPER:
        print("[GooglePlay] google-play-scraper 未安装，返回空列表")
        return []

    cat_info = CATEGORY_MAP.get(category, CATEGORY_MAP["TOOLS"])
    keywords = cat_info.get("keywords", [cat_info["en"].lower()])

    print(f"[GooglePlay] 搜索类别: {cat_info['en']} ({country}) - 关键词: {keywords}")

    apps = []
    seen_ids = set()

    # 用多个关键词搜索，去重合并
    for kw in keywords[:2]:  # 最多用2个关键词
        try:
            results = search(
                kw,
                country=country.lower(),
                n_hits=limit * 2,  # 多取一些以便去重
            )
            for r in results:
                app_id = r.get("appId", "")
                if not app_id or app_id in seen_ids:
                    continue
                if len(apps) >= limit:
                    break
                seen_ids.add(app_id)

                # 获取详情（评分等）
                score = r.get("score", 0)
                installs = r.get("installs", "")

                apps.append({
                    "rank": len(apps) + 1,
                    "id": app_id,
                    "app_id": app_id,
                    "store": "google_play",
                    "name": r.get("title", app_id),
                    "developer": r.get("developer", ""),
                    "category": cat_info["zh"],
                    "category_en": cat_info["en"],
                    "price": 0.0 if chart_type == "free" else (r.get("price", 0) or 0),
                    "rating": float(score) if score else 0.0,
                    "rating_count": r.get("reviews", 0),
                    "installs": installs,
                    "icon": r.get("icon", ""),
                    "url": f"https://play.google.com/store/apps/details?id={app_id}",
                    "country": country,
                    "chart_type": chart_type,
                    "version": r.get("version", ""),
                    "updated": r.get("updated", ""),
                    "screenshots": r.get("screenshots", []),
                    "change_type": "none",
                    "change_label_zh": "",
                    "change_label_en": "",
                })
            if len(apps) >= limit:
                break
        except Exception as e:
            print(f"[GooglePlay] 搜索关键词 '{kw}' 失败: {e}")
            continue

    # 按评分排序（模拟榜单排名）
    apps.sort(key=lambda x: (x["rating"], x["rating_count"]), reverse=True)
    for i, app in enumerate(apps):
        app["rank"] = i + 1

    print(f"[GooglePlay] 解析到 {len(apps)} 个应用")
    return apps


def fetch_app_detail(app_id: str, country: str = "US") -> Optional[dict]:
    """获取单个 App 的详细信息（通过 google-play-scraper 包）"""
    if not HAS_GP_SCRAPER:
        return None
    try:
        detail = gp_app(app_id, country=country, lang="en")
        return {
            "id": app_id,
            "name": detail.get("title", ""),
            "developer": detail.get("developer", ""),
            "category": detail.get("genre", ""),
            "price": detail.get("price", 0),
            "rating": float(detail.get("score", 0)),
            "rating_count": int(detail.get("reviews", 0)),
            "installs": detail.get("installs", ""),
            "version": detail.get("version", ""),
            "updated": detail.get("updated", ""),
            "description": detail.get("description", "")[:2000],
            "icon": detail.get("icon", ""),
            "screenshots": detail.get("screenshots", [])[:5],
            "url": f"https://play.google.com/store/apps/details?id={app_id}",
            "store": "google_play",
        }
    except Exception as e:
        print(f"[GooglePlay] 获取详情失败 {app_id}: {e}")
        return None


def detect_changes(current: list[dict], previous: list[dict]) -> list[dict]:
    """对比两次榜单快照，检测变化"""
    if not previous:
        for app in current:
            app["change_type"] = "none"
            app["change_label_zh"] = ""
            app["change_label_en"] = ""
        return current

    prev_map = {a["id"]: a for a in previous}
    results = []

    for app in current:
        app_id = app["id"]
        entry = dict(app)

        if app_id not in prev_map:
            entry["change_type"] = "new_entry"
            entry["change_label_zh"] = "🆕 新上榜"
            entry["change_label_en"] = "🆕 New Entry"
            entry["alert_level"] = "warning"
        else:
            prev = prev_map[app_id]
            prev_rank = prev.get("rank")
            curr_rank = app.get("rank")

            if prev_rank and curr_rank:
                if curr_rank < prev_rank:
                    entry["change_type"] = "rank_up"
                    entry["change_label_zh"] = f"📈 上升 #{prev_rank}→#{curr_rank}"
                    entry["change_label_en"] = f"📈 Up #{prev_rank}→#{curr_rank}"
                    entry["alert_level"] = "info"
                elif curr_rank > prev_rank:
                    entry["change_type"] = "rank_down"
                    entry["change_label_zh"] = f"📉 下降 #{prev_rank}→#{curr_rank}"
                    entry["change_label_en"] = f"📉 Down #{prev_rank}→#{curr_rank}"
                    entry["alert_level"] = "info"
                else:
                    entry["change_type"] = "unchanged"
                    entry["change_label_zh"] = ""
                    entry["change_label_en"] = ""
                    entry["alert_level"] = "info"
            else:
                entry["change_type"] = "none"
                entry["change_label_zh"] = ""
                entry["change_label_en"] = ""

        results.append(entry)

    # 检测下榜
    curr_ids = {a["id"] for a in current}
    for prev_app in previous:
        if prev_app["id"] not in curr_ids:
            dropped = dict(prev_app)
            dropped["change_type"] = "dropped"
            dropped["change_label_zh"] = "📉 跌出榜单"
            dropped["change_label_en"] = "📉 Dropped from chart"
            dropped["alert_level"] = "warning"
            results.append(dropped)

    return results


# 快照存储路径
SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "gp_history")


def save_snapshot(apps: list[dict], category: str, country: str, chart_type: str):
    """保存当前榜单快照"""
    os.makedirs(SNAPSHOT_DIR, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"{category}_{country}_{chart_type}_{today}.json"
    path = os.path.join(SNAPSHOT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"date": today, "apps": apps}, f, ensure_ascii=False, indent=2)
    return path


def load_latest_snapshot(category: str, country: str, chart_type: str) -> Optional[list[dict]]:
    """加载最近一次快照"""
    if not os.path.exists(SNAPSHOT_DIR):
        return None
    files = [
        f for f in os.listdir(SNAPSHOT_DIR)
        if f.startswith(f"{category}_{country}_{chart_type}_") and f.endswith(".json")
    ]
    if not files:
        return None
    latest = sorted(files)[-1]
    path = os.path.join(SNAPSHOT_DIR, latest)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("apps", data) if isinstance(data, dict) else data
