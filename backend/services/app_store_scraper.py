"""
App Store 工具类榜单抓取 + 变更检测服务
========================================
- iTunes RSS 获取 Top 20 工具类应用
- iTunes Lookup API 获取应用详情
- 历史快照存储 & 变更检测
- 数据对比（版本/截图/描述/评分/排名）
"""

import json
import os
import hashlib
import re
import time as _time
from datetime import datetime, UTC
from typing import Optional
import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}
PROXIES = None

# iTunes 类别 ID 映射（App Store Genre IDs）
ITUNES_GENRE_MAP = {
    "TOOLS":          {"id": 6002, "zh": "工具",     "en": "Utilities"},
    "ART_AND_DESIGN": {"id": 6004, "zh": "图形设计", "en": "Graphics & Design"},
    "PHOTOGRAPHY":    {"id": 5902, "zh": "摄影",     "en": "Photo & Video"},
    "PRODUCTIVITY":   {"id": 7013, "zh": "效率",     "en": "Productivity"},
    "BUSINESS":       {"id": 6000, "zh": "商务",     "en": "Business"},
    "EDUCATION":      {"id": 7012, "zh": "教育",     "en": "Education"},
    "ENTERTAINMENT":  {"id": 7002, "zh": "娱乐",     "en": "Entertainment"},
    "LIFESTYLE":      {"id": 7001, "zh": "生活",     "en": "Lifestyle"},
}

# 默认类别
DEFAULT_GENRE = "TOOLS"
ITUNES_TOP_RSS = f"https://itunes.apple.com/us/rss/topfreeapplications/limit=25/genre={ITUNES_GENRE_MAP[DEFAULT_GENRE]['id']}/json"
ITUNES_LOOKUP = "https://itunes.apple.com/lookup"
HISTORY_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "app_history")

# 广告创意模板（工具类APP专用）
TOOLS_AD_TEMPLATES = {
    "problem_solution": {
        "zh": "痛点解决型",
        "en": "Problem-Solution",
        "desc_zh": "展示用户日常生活中遇到的麻烦 → 工具APP优雅解决",
        "desc_en": "Show daily pain points → app elegantly solves them",
        "hook_zh": ["「你还在手动做这个吗？」", "「3秒搞定你花10分钟的事」"],
        "hook_en": ['"Still doing this manually?"', '"3 seconds vs your 10 minutes"'],
    },
    "before_after": {
        "zh": "前后对比型",
        "en": "Before-After",
        "desc_zh": "使用前的一团糟 vs 使用后的整洁高效",
        "desc_en": "Chaos before vs clean efficiency after",
        "hook_zh": ["「Before vs After 系列」", "「你敢相信这是同一个手机？」"],
        "hook_en": ['"Before vs After series"', '"Same phone, different life"'],
    },
    "productivity_hack": {
        "zh": "效率秘籍型",
        "en": "Productivity Hack",
        "desc_zh": "一条你不知道的效率技巧→原来是用了这个APP",
        "desc_en": "One productivity trick you didn't know → powered by this app",
        "hook_zh": ["「iPhone隐藏功能第99期」", "「这个技巧让你的效率翻倍」"],
        "hook_en": ['"iPhone hidden feature #99"', '"This trick doubles your productivity"'],
    },
    "visual_demo": {
        "zh": "视觉演示型",
        "en": "Visual Demo",
        "desc_zh": "精美的界面操作录屏，展示APP的质感和流畅度",
        "desc_en": "Beautiful UI screen recording showing app polish and smoothness",
        "hook_zh": ["「这UI也太好看了吧」", "「什么叫丝滑体验」"],
        "hook_en": ['"This UI is gorgeous"', '"This is what smooth feels like"'],
    },
    "comparison": {
        "zh": "对比评测型",
        "en": "Comparison Review",
        "desc_zh": "同类工具横向对比，突出本APP的独特优势",
        "desc_en": "Side-by-side comparison highlighting unique advantages",
        "hook_zh": ["「我用过20款XX工具，这款排第一」", "「别再用XX了，试试这个」"],
        "hook_en": ['"I tested 20 XX tools, this one wins"', '"Stop using XX, try this"'],
    },
    "ugc_social": {
        "zh": "UGC社交型",
        "en": "UGC Social Proof",
        "desc_zh": "用户真实好评+使用场景展示，借社交信任转化",
        "desc_en": "Real user reviews + usage scenarios, leveraging social proof",
        "hook_zh": ["「100万用户都在用的神器」", "「评论区都炸了」"],
        "hook_en": ['"1M+ users swear by this"', '"The comments are going crazy"'],
    },
}


class AppStoreScraper:
    """App Store 数据抓取 + 变更检测"""

    @staticmethod
    def _ensure_history_dir():
        os.makedirs(HISTORY_DIR, exist_ok=True)

    @staticmethod
    def _get_history_path():
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        return os.path.join(HISTORY_DIR, f"snapshot_{today}.json")

    @staticmethod
    def _get_previous_snapshot() -> Optional[list]:
        """获取最近一次历史快照"""
        AppStoreScraper._ensure_history_dir()
        files = sorted([f for f in os.listdir(HISTORY_DIR) if f.endswith('.json')], reverse=True)
        for f in files:
            path = os.path.join(HISTORY_DIR, f)
            try:
                with open(path, 'r', encoding='utf-8') as fp:
                    return json.load(fp)
            except:
                continue
        return None

    @staticmethod
    def fetch_top20(category: str = "TOOLS") -> list[dict]:
        """抓取指定类别的 Top 20 榜单（支持动态类别切换）"""
        apps = []
        # 获取类别 ID
        genre_info = ITUNES_GENRE_MAP.get(category.upper(), ITUNES_GENRE_MAP[DEFAULT_GENRE])
        genre_id = genre_info["id"]
        category_zh = genre_info["zh"]
        category_en = genre_info["en"]

        url = f"https://itunes.apple.com/us/rss/topfreeapplications/limit=25/genre={genre_id}/json"
        try:
            resp = requests.get(url, headers=HEADERS, proxies=PROXIES, timeout=20)
            if resp.status_code != 200:
                return _fallback_top20(category)

            data = resp.json()
            entries = data.get("feed", {}).get("entry", [])

            for i, entry in enumerate(entries[:20]):
                try:
                    app_id = entry.get("id", {}).get("attributes", {}).get("im:id", "")
                    name = entry.get("im:name", {}).get("label", "Unknown")
                    developer = entry.get("im:artist", {}).get("label", "Unknown")
                    release_date = entry.get("im:releaseDate", {}).get("label", "")
                    price = entry.get("im:price", {}).get("attributes", {}).get("amount", "0")
                    icon_url = ""
                    images = entry.get("im:image", [])
                    if images:
                        icon_url = images[-1].get("label", "")

                    # 获取详情
                    detail = AppStoreScraper._fetch_app_detail(app_id)

                    apps.append({
                        "rank": i + 1,
                        "app_id": app_id,
                        "name": name,
                        "developer": developer,
                        "category": category_en,
                        "category_zh": category_zh,
                        "icon_url": icon_url,
                        "price": float(price),
                        "summary": entry.get("summary", {}).get("label", "")[:200],
                        "release_date": release_date,
                        "version": detail.get("version", "N/A"),
                        "description": detail.get("description", ""),
                        "screenshots": detail.get("screenshots", []),
                        "rating": detail.get("rating", 0),
                        "rating_count": detail.get("rating_count", 0),
                        "bundle_id": detail.get("bundle_id", ""),
                        "seller_url": detail.get("seller_url", ""),
                        "size_bytes": detail.get("size_bytes", 0),
                        "store": "app_store",
                        "change_type": "none",
                        "change_label_zh": "",
                        "change_label_en": "",
                    })
                except Exception as e:
                    continue

            return apps
        except Exception:
            return _fallback_top20(category)

    @staticmethod
    def _fetch_app_detail(app_id: str) -> dict:
        """获取单个APP的详细信息"""
        try:
            url = f"{ITUNES_LOOKUP}?id={app_id}&country=us"
            resp = requests.get(url, headers=HEADERS, proxies=PROXIES, timeout=15)
            if resp.status_code != 200:
                return {}

            data = resp.json()
            results = data.get("results", [])
            if not results:
                return {}

            r = results[0]
            return {
                "version": r.get("version", "N/A"),
                "description": r.get("description", "")[:2000],
                "screenshots": r.get("screenshotUrls", [])[:5],
                "rating": float(r.get("averageUserRating", 0)),
                "rating_count": int(r.get("userRatingCount", 0)),
                "bundle_id": r.get("bundleId", ""),
                "seller_url": r.get("sellerUrl", ""),
                "size_bytes": int(r.get("fileSizeBytes", 0)),
                "release_notes": r.get("releaseNotes", ""),
            }
        except:
            return {}

    @staticmethod
    def save_snapshot(apps: list[dict]):
        """保存当前快照"""
        AppStoreScraper._ensure_history_dir()
        snapshot = {
            "timestamp": datetime.now(UTC).isoformat(),
            "total": len(apps),
            "apps": apps,
        }
        path = AppStoreScraper._get_history_path()
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)

    @staticmethod
    def detect_changes(current: list[dict], previous: list[dict]) -> list[dict]:
        """检测变更并生成报告"""
        changes = []
        prev_map = {a["app_id"]: a for a in previous} if previous else {}

        for app in current:
            app_id = app["app_id"]
            prev = prev_map.get(app_id)

            detected = {
                "app_id": app_id,
                "name": app["name"],
                "icon_url": app["icon_url"],
                "rank": app["rank"],
                "rank_previous": prev.get("rank") if prev else None,
                "changes": [],
                "has_changes": False,
                "alert_level": "none",  # none / info / warning / critical
            }

            if not prev:
                detected["changes"].append({
                    "type": "new_entry",
                    "label_zh": "新上榜",
                    "label_en": "New Entry",
                    "detail_zh": f"首次进入 Top 20，排名第 {app['rank']}",
                    "detail_en": f"First time in Top 20, ranked #{app['rank']}",
                })
                detected["has_changes"] = True
                detected["alert_level"] = "info"
            else:
                # 版本变更
                if app.get("version") != prev.get("version"):
                    detected["changes"].append({
                        "type": "version_update",
                        "label_zh": "版本更新",
                        "label_en": "Version Update",
                        "detail_zh": f"从 {prev.get('version')} 更新至 {app.get('version')}",
                        "detail_en": f"Updated from {prev.get('version')} to {app.get('version')}",
                        "old_value": prev.get("version"),
                        "new_value": app.get("version"),
                    })
                    detected["has_changes"] = True
                    detected["alert_level"] = "critical"

                # 截图变更
                prev_screens = set(prev.get("screenshots", []))
                curr_screens = set(app.get("screenshots", []))
                if prev_screens and prev_screens != curr_screens:
                    added = curr_screens - prev_screens
                    removed = prev_screens - curr_screens
                    change_desc = []
                    if added:
                        change_desc.append(f"+{len(added)} 张新截图")
                    if removed:
                        change_desc.append(f"-{len(removed)} 张截图被替换")
                    detected["changes"].append({
                        "type": "screenshot_change",
                        "label_zh": "商店截图变更",
                        "label_en": "Screenshot Update",
                        "detail_zh": "、".join(change_desc),
                        "detail_en": f"Screenshots changed: +{len(added)}, -{len(removed)}",
                        "added_count": len(added),
                        "removed_count": len(removed),
                    })
                    detected["has_changes"] = True
                    if detected["alert_level"] != "critical":
                        detected["alert_level"] = "warning"

                # 描述变更
                if prev.get("description", "") != app.get("description", ""):
                    detected["changes"].append({
                        "type": "description_change",
                        "label_zh": "描述文案变更",
                        "label_en": "Description Updated",
                        "detail_zh": "商店描述文案已更新",
                        "detail_en": "App Store description has been updated",
                    })
                    detected["has_changes"] = True
                    if detected["alert_level"] == "none":
                        detected["alert_level"] = "info"

                # 评分显著变化
                prev_rating = prev.get("rating", 0)
                curr_rating = app.get("rating", 0)
                if abs(curr_rating - prev_rating) >= 0.5:
                    direction = "上升" if curr_rating > prev_rating else "下降"
                    direction_en = "increased" if curr_rating > prev_rating else "decreased"
                    detected["changes"].append({
                        "type": "rating_change",
                        "label_zh": f"评分{direction}",
                        "label_en": f"Rating {direction_en.capitalize()}",
                        "detail_zh": f"评分从 {prev_rating} {direction}至 {curr_rating}",
                        "detail_en": f"Rating {direction_en} from {prev_rating} to {curr_rating}",
                        "old_value": prev_rating,
                        "new_value": curr_rating,
                    })
                    detected["has_changes"] = True
                    if detected["alert_level"] == "none":
                        detected["alert_level"] = "warning"

                # 排名变动
                if prev.get("rank") != app["rank"]:
                    delta = prev.get("rank", 0) - app["rank"]
                    if delta > 0:
                        rank_label = f"排名上升 {delta} 位"
                        rank_label_en = f"Rank up by {delta}"
                    else:
                        rank_label = f"排名下降 {abs(delta)} 位"
                        rank_label_en = f"Rank down by {abs(delta)}"
                    detected["changes"].append({
                        "type": "rank_change",
                        "label_zh": rank_label,
                        "label_en": rank_label_en,
                        "detail_zh": f"从第 {prev.get('rank')} 名 → 第 {app['rank']} 名",
                        "detail_en": f"From #{prev.get('rank')} → #{app['rank']}",
                        "old_value": prev.get("rank"),
                        "new_value": app["rank"],
                        "rank_delta": delta,
                    })
                    detected["has_changes"] = True
                    if abs(delta) >= 5 and detected["alert_level"] == "none":
                        detected["alert_level"] = "info"

            changes.append(detected)

        # 下榜检测
        current_ids = {a["app_id"] for a in current}
        if previous:
            for prev_app in previous:
                if prev_app["app_id"] not in current_ids:
                    changes.append({
                        "app_id": prev_app["app_id"],
                        "name": prev_app["name"],
                        "icon_url": prev_app.get("icon_url", ""),
                        "rank": None,
                        "rank_previous": prev_app.get("rank"),
                        "changes": [{
                            "type": "dropped_out",
                            "label_zh": "已下榜",
                            "label_en": "Dropped Out",
                            "detail_zh": f"从上期第 {prev_app.get('rank')} 名下榜",
                            "detail_en": f"Dropped from #{prev_app.get('rank')}",
                        }],
                        "has_changes": True,
                        "alert_level": "info",
                    })

        # 按告警等级排序
        priority = {"critical": 0, "warning": 1, "info": 2, "none": 3}
        changes.sort(key=lambda x: priority.get(x["alert_level"], 3))
        return changes

    @staticmethod
    def get_creative_ideas(app: dict) -> list[dict]:
        """为工具类APP生成广告创意思路"""
        ideas = []
        name = app.get("name", "")
        category = app.get("category", "").lower()

        for tid, tpl in TOOLS_AD_TEMPLATES.items():
            relevance = 0.9
            if "photo" in name.lower() or "camera" in name.lower():
                if tid == "visual_demo":
                    relevance = 1.0
                elif tid == "before_after":
                    relevance = 0.95
            elif "scan" in name.lower() or "pdf" in name.lower():
                if tid == "problem_solution":
                    relevance = 1.0
                elif tid == "productivity_hack":
                    relevance = 0.95
            elif "note" in name.lower() or "todo" in name.lower():
                if tid == "productivity_hack":
                    relevance = 1.0
                elif tid == "before_after":
                    relevance = 0.9

            ideas.append({
                "template_id": tid,
                "name_zh": tpl["zh"],
                "name_en": tpl["en"],
                "desc_zh": tpl["desc_zh"],
                "desc_en": tpl["desc_en"],
                "hooks_zh": tpl["hook_zh"],
                "hooks_en": tpl["hook_en"],
                "relevance_score": round(relevance, 2),
                "specific_idea_zh": _generate_specific_idea(app, tid),
                "specific_idea_en": _generate_specific_idea_en(app, tid),
            })

        ideas.sort(key=lambda x: x["relevance_score"], reverse=True)
        return ideas[:3]


def _generate_specific_idea(app: dict, template_id: str) -> str:
    """生成针对特定APP的创意描述（中文）"""
    name = app.get("name", "这款工具")
    desc = app.get("description", "")[:100]

    ideas_map = {
        "problem_solution": f"展示用户日常痛点场景（如文件太多找不到、扫描不清晰），然后{name}一键解决，强调速度对比。",
        "before_after": f"用分屏展示使用{name}前后的效率对比：杂乱→有序，耗时→秒级。视觉冲击力拉满。",
        "productivity_hack": f"以「你不知道的iPhone技巧」为标题，揭秘其实用的是{name}，吸引效率控人群。",
        "visual_demo": f"精美录屏展示{name}的UI交互细节，配上ASMR音效，突出质感和流畅体验。",
        "comparison": f"横向对比{name}与其他同类工具，用数据和场景展示其独特优势。",
        "ugc_social": f"展示{name}的真实用户好评截图+使用场景，用社交证明驱动下载。",
    }
    return ideas_map.get(template_id, f"基于{name}的核心功能，策划一支创意短视频广告。")


def _generate_specific_idea_en(app: dict, template_id: str) -> str:
    """Generate app-specific creative idea (English)"""
    name = app.get("name", "this tool")

    ideas_map = {
        "problem_solution": f"Show real daily pain points (files everywhere, blurry scans), then {name} solves it in one tap. Speed contrast is key.",
        "before_after": f"Split-screen {name} before/after: chaos → order, minutes → seconds. Maximum visual impact.",
        "productivity_hack": f"'Hidden iPhone trick' format — reveals the trick is actually {name}. Appeals to productivity enthusiasts.",
        "visual_demo": f"Premium screen recording of {name}'s UI with ASMR sounds. Showcases polish and smooth experience.",
        "comparison": f"Side-by-side comparison of {name} vs competitors. Data and real scenarios prove the advantage.",
        "ugc_social": f"Real user review screenshots + usage scenarios for {name}. Social proof drives downloads.",
    }
    return ideas_map.get(template_id, f"Create a short video ad based on {name}'s core features.")


def _fallback_top20(category: str = "TOOLS") -> list[dict]:
    """当 iTunes API 不可用时的备用数据"""
    genre_info = ITUNES_GENRE_MAP.get(category.upper(), ITUNES_GENRE_MAP[DEFAULT_GENRE])
    return [
        {"rank": i+1, "app_id": f"fallback_{category}_{i}", "name": f"{genre_info['zh']} App #{i+1}",
         "developer": "Developer", "icon_url": "", "price": 0.99, "rating": 4.5,
         "rating_count": 50000, "version": "1.0", "description": f"A useful {genre_info['en'].lower()} app.",
         "screenshots": [], "category": genre_info["en"], "category_zh": genre_info["zh"],
         "release_date": "2026-01-01", "store": "app_store",
         "change_type": "none", "change_label_zh": "", "change_label_en": ""}
        for i in range(20)
    ]
