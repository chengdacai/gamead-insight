"""
Google Play 榜单抓取服务（网页爬取版）
爬取 Google Play Store 公开页面，无需 API Key
支持：免费榜 / 付费榜，多国家，多类别
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
    print("[GooglePlay] 缺少依赖，请运行: pip install requests beautifulsoup4")
    raise

# 类别映射（Google Play 内部代号）
CATEGORY_MAP = {
    "TOOLS":        {"zh": "工具",     "en": "Tools",        "gp_cat": "TOOLS"},
    "ART_AND_DESIGN": {"zh": "图形设计", "en": "Art & Design", "gp_cat": "ART_AND_DESIGN"},
    "PHOTOGRAPHY":  {"zh": "摄影",     "en": "Photography",  "gp_cat": "PHOTOGRAPHY"},
    "PRODUCTIVITY":  {"zh": "效率",     "en": "Productivity", "gp_cat": "PRODUCTIVITY"},
    "BUSINESS":      {"zh": "商务",     "en": "Business",     "gp_cat": "BUSINESS"},
    "EDUCATION":     {"zh": "教育",     "en": "Education",    "gp_cat": "EDUCATION"},
    "ENTERTAINMENT": {"zh": "娱乐", "en": "Entertainment", "gp_cat": "ENTERTAINMENT"},
    "GAME_ACTION":   {"zh": "动作游戏", "en": "Action",       "gp_cat": "GAME_ACTION"},
    "GAME_PUZZLE":  {"zh": "益智游戏", "en": "Puzzle",       "gp_cat": "GAME_PUZZLE"},
}

# 榜单类型映射
CHART_TYPE_MAP = {
    "free": "topselling_free",
    "paid": "topselling_paid",
    "top_grossing": "topgrossing",
}

# 国家代码映射
COUNTRY_MAP = {
    "US": "美国", "CN": "中国", "JP": "日本", "GB": "英国",
    "DE": "德国", "FR": "法国", "KR": "韩国", "IN": "印度",
}

# 请求头（模拟浏览器）
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def _fetch_page(url: str, max_retry: int = 2) -> Optional[str]:
    """获取页面 HTML"""
    for attempt in range(max_retry):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            if resp.status_code == 200:
                return resp.text
            print(f"[GooglePlay] HTTP {resp.status_code}, retry {attempt+1}")
        except Exception as e:
            print(f"[GooglePlay] 请求失败: {e}, retry {attempt+1}")
        time.sleep(2)
    return None


def fetch_top_charts(
    category: str = "ART_AND_DESIGN",
    country: str = "US",
    chart_type: str = "free",
    limit: int = 20,
) -> list[dict]:
    """
    获取 Google Play 榜单 Top N
    通过爬取 Google Play Store 网页实现（直接 HTTP 请求，无需浏览器）
    """
    cat_info = CATEGORY_MAP.get(category, CATEGORY_MAP["TOOLS"])
    gp_cat = cat_info["gp_cat"]
    collection = CHART_TYPE_MAP.get(chart_type, "topselling_free")

    url = (
        f"https://play.google.com/store/apps/top"
        f"?category={gp_cat}&collection={collection}&gl={country.lower()}&hl=en"
    )

    print(f"[GooglePlay] 爬取: {cat_info['en']} ({country}) {chart_type}榜")
    html = _fetch_page(url)
    if not html:
        print("[GooglePlay] 页面获取失败，返回空列表")
        return []

    apps = _parse_google_play_html(html, cat_info, country, chart_type, limit)
    print(f"[GooglePlay] 解析到 {len(apps)} 个应用")
    return apps


def _parse_google_play_html(
    html: str, cat_info: dict, country: str, chart_type: str, limit: int
) -> list[dict]:
    """解析 Google Play 榜单页面 HTML，提取应用列表"""
    soup = BeautifulSoup(html, "lxml")
    apps = []
    seen_ids = set()

    # 查找所有包含应用链接的 <a> 标签
    # Google Play 页面的应用卡片链接格式：/store/apps/details?id=xxx
    links = soup.find_all("a", href=re.compile(r"/store/apps/details\?id="))

    for link in links:
        if len(apps) >= limit:
            break

        href = link.get("href", "")
        match = re.search(r"id=([^&]+)", href)
        if not match:
            continue
        app_id = match.group(1)
        if app_id in seen_ids:
            continue
        seen_ids.add(app_id)

        # 尝试从链接或父元素中提取应用名称
        name = ""
        # 方法1：从 link 的 title 属性
        name = link.get("title", "")
        # 方法2：从 link 内的文本
        if not name:
            txt = link.get_text(strip=True)
            if txt and len(txt) < 100:
                name = txt
        # 方法3：从父级元素查找
        if not name:
            parent = link.parent
            if parent:
                # 查找附近的有 aria-label 或 title 的元素
                for el in parent.find_all(attrs={"aria-label": True}):
                    name = el.get("aria-label", "")
                    if name:
                        break

        # 提取图标 URL
        icon = ""
        img = link.find("img")
        if not img:
            # 向上查找
            for ancestor in [link, link.parent, link.parent.parent if link.parent else None]:
                if not ancestor:
                    continue
                imgs = ancestor.find_all("img")
                if imgs:
                    img = imgs[0]
                    break
        if img:
            icon = img.get("src", "") or img.get("data-src", "")
            # Google 图标 URL 有时是 // 开头
            if icon.startswith("//"):
                icon = "https:" + icon

        apps.append({
            "rank": len(apps) + 1,
            "id": app_id,
            "app_id": app_id,
            "store": "google_play",
            "name": name,
            "developer": "",
            "category": cat_info["zh"],
            "category_en": cat_info["en"],
            "price": 0.0 if chart_type == "free" else 0.99,
            "rating": 0.0,
            "rating_count": 0,
            "installs": "",
            "icon": icon,
            "url": f"https://play.google.com/store/apps/details?id={app_id}",
            "country": country,
            "chart_type": chart_type,
            "version": "",
            "updated": "",
            "screenshots": [],
            "change_type": "none",
            "change_label_zh": "",
            "change_label_en": "",
        })

    # 如果名称大多为空，尝试用 google-play-scraper 包补充详情
    if apps and sum(1 for a in apps if a["name"]) < len(apps) // 2:
        print("[GooglePlay] 名称信息不足，尝试补充应用详情...")
        _enrich_apps_details(apps, country)

    return apps


def _enrich_apps_details(apps: list[dict], country: str):
    """用 google-play-scraper 包补充应用名称、评分等信息"""
    try:
        from google_play_scraper import app as gp_app
        for app in apps:
            if app.get("name"):
                continue
            try:
                detail = gp_app(app["id"], country=country, lang="en")
                app["name"] = detail.get("title", app["id"])
                app["developer"] = detail.get("developer", "")
                app["rating"] = detail.get("score", 0.0)
                app["rating_count"] = detail.get("reviews", 0)
                app["version"] = detail.get("version", "")
                app["icon"] = detail.get("icon", app["icon"])
            except Exception:
                app["name"] = app["id"]  # 兜底：用 ID 作为名称
    except Exception as e:
        print(f"[GooglePlay] 补充详情失败: {e}")
        for app in apps:
            if not app.get("name"):
                app["name"] = app["id"]


def fetch_app_detail(app_id: str, country: str = "US") -> Optional[dict]:
    """获取单个 App 的详细信息（通过 google-play-scraper 包）"""
    try:
        from google_play_scraper import app as gp_app
        detail = gp_app(app_id, country=country, lang="en")
        return {
            "id": app_id,
            "name": detail.get("title", ""),
            "developer": detail.get("developer", ""),
            "category": detail.get("genre", ""),
            "price": detail.get("price", 0),
            "rating": detail.get("score", 0.0),
            "rating_count": detail.get("reviews", 0),
            "installs": detail.get("installs", ""),
            "version": detail.get("version", ""),
            "updated": detail.get("updated", ""),
            "description": detail.get("description", ""),
            "icon": detail.get("icon", ""),
            "screenshots": detail.get("screenshots", []),
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
