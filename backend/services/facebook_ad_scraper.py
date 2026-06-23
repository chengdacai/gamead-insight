"""
Facebook Ad Library 公开页面爬虫
无需 API Token，直接使用 Selenium 爬取真实广告数据

作者: GameAd Insight Team
"""

import os
import json
import time
import threading
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

# 缓存：{advertiser_name_country: {"ads": [...], "fetched_at": timestamp}}
_ad_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3600  # 1 小时缓存


def search_facebook_ads(
    advertiser_name: str,
    country: str = "US",
    limit: int = 12,
    media_type: str = "all",
) -> list[dict]:
    """搜索 Facebook Ad Library 广告"""
    cache_key = f"{advertiser_name}_{country}_{media_type}"
    
    # 检查缓存
    with _cache_lock:
        cached = _ad_cache.get(cache_key)
        if cached and time.time() - cached["fetched_at"] < CACHE_TTL:
            return cached["ads"][:limit]
    
    try:
        from facebook_ad_library_scraper.core import build_url, ScraperConfig, scrape
        
        url = build_url(
            query=advertiser_name,
            country=country,
            media_type=media_type,
            active_status="active",
            search_type="keyword_exact_phrase",
        )
        
        output_dir = Path(__file__).parent.parent / "data" / "fb_ads"
        output_dir.mkdir(parents=True, exist_ok=True)
        
        config = ScraperConfig(
            url=url,
            output_dir=output_dir,
            max_scrolls=5,
            headless=True,
            save_json=True,
            save_csv=False,
            store_html=False,
            wait_timeout=20,
            scroll_pause=2.0,
            snapshot_every=3,
        )
        
        print(f"[FB Scraper] 正在搜索: {advertiser_name} ({country})...")
        raw_ads = scrape(config)
        print(f"[FB Scraper] 找到 {len(raw_ads)} 条广告")
        
        # 转换为统一格式
        ads = [_normalize_ad(ad) for ad in raw_ads if ad.get("body") or ad.get("image_url")]
        
        # 缓存
        with _cache_lock:
            _ad_cache[cache_key] = {
                "ads": ads,
                "fetched_at": time.time(),
            }
        
        return ads[:limit]
        
    except ImportError:
        print("[FB Scraper] facebook-ad-library-scraper 未安装，返回空")
        return []
    except Exception as e:
        print(f"[FB Scraper] 爬取失败: {e}")
        # 返回过期缓存兜底
        with _cache_lock:
            cached = _ad_cache.get(cache_key)
            if cached:
                age = time.time() - cached["fetched_at"]
                print(f"[FB Scraper] 使用过期缓存 (age={age:.0f}s)")
                return cached["ads"][:limit]
        return []


def _normalize_ad(raw_ad: dict) -> dict:
    """将原始广告数据转换为统一格式"""
    body = raw_ad.get("body", "") or ""
    page_name = raw_ad.get("page_name", "") or ""
    start_date = raw_ad.get("start_date", "") or ""
    image_url = raw_ad.get("image_url", "") or ""
    images = raw_ad.get("images", []) or []
    
    # 广告文案（中英双行）
    title = body[:80] if body else f"{page_name} 广告"
    title_en = body[:80] if body else f"{page_name} Ad"
    
    # 类型判断
    creative_type = "IMAGE"
    creative_type_zh = "图片广告"
    if len(images) > 1 or "video" in str(raw_ad).lower():
        creative_type = "VIDEO"
        creative_type_zh = "视频广告"
    
    # 日期处理
    first_seen = ""
    last_seen = "投放中"
    if start_date:
        try:
            parts = start_date.split(" ")
            if len(parts) >= 3:
                month_map = {
                    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
                    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
                    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
                }
                m = month_map.get(parts[0], "01")
                d = parts[1].replace(",", "").zfill(2)
                y = parts[2]
                first_seen = f"{y}-{m}-{d}"
        except Exception:
            pass
    
    return {
        "ad_id": raw_ad.get("library_id", ""),
        "advertiser": page_name,
        "title": title,
        "title_en": title_en,
        "body": body[:200],
        "body_en": body[:200],
        "thumbnail_url": image_url or (images[0] if images else ""),
        "video_url": None,  # Facebook 不直接提供视频 URL
        "snapshot_url": image_url or (images[0] if images else ""),
        "creative_type": creative_type,
        "creative_type_zh": creative_type_zh,
        "platforms_zh": ["Facebook Ad Library"],
        "platforms": ["facebook"],
        "first_seen": first_seen,
        "last_seen": last_seen,
        "is_preview": False,
        "is_real_ads": True,
        "source": "facebook_ad_library",
        "library_id": raw_ad.get("library_id", ""),
        "page_url": raw_ad.get("page_url", ""),
        "destination_url": raw_ad.get("destination_url", ""),
    }


# 预缓存热门 App 的广告（后台启动时调用）
def preload_popular_ads(app_names: list[str], country: str = "US"):
    """后台线程：预加载热门 App 的广告数据"""
    def _load():
        for name in app_names:
            try:
                search_facebook_ads(name, country, limit=12)
                time.sleep(5)  # 避免请求太频繁
            except Exception as e:
                print(f"[FB Preload] {name} 失败: {e}")
    
    t = threading.Thread(target=_load, daemon=True)
    t.start()
