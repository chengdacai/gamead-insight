"""
Google Ads Transparency Center — 免费广告数据源
无需 API Token，无需申请，完全免费

方案：
  Google Ads 透明度中心是 JS Web App，无法直接 HTTP 爬取。
  本模块采用「多格式链接引导 + 透明度中心内嵌」方案：
  → 为每个 App 生成多个广告格式的透明度中心搜索链接
  → 用户可直接在页面内通过 iframe 查看所有 Google Ads
  → 每种广告格式（搜索/展示/YouTube/购物/Gmail）都有独立卡片

搜索页 URL 格式：
  https://adstransparency.google.com/?advertiser_name=Canva
  
公开数据集（BigQuery）:
  bigquery-public-data.google_ads_transparency_center.creative_stats
"""

import time
import threading
from urllib.parse import quote_plus

# 常见广告格式 — 每个生成独立卡片
AD_FORMATS = [
    {
        "id_suffix": "search",
        "format_zh": "搜索广告",
        "format_en": "Search Ads",
        "desc_zh": "Google 搜索结果中的文字/图片广告",
        "desc_en": "Text & image ads in Google Search results",
        "icon": "🔎",
    },
    {
        "id_suffix": "display",
        "format_zh": "展示广告",
        "format_en": "Display Ads",
        "desc_zh": "Google 展示网络中的横幅/视频广告",
        "desc_en": "Banner & video ads on Google Display Network",
        "icon": "🖼",
    },
    {
        "id_suffix": "youtube",
        "format_zh": "YouTube 视频广告",
        "format_en": "YouTube Video Ads",
        "desc_zh": "YouTube 视频前/中/后贴片广告",
        "desc_en": "Pre-roll, mid-roll & post-roll YouTube ads",
        "icon": "🎬",
    },
    {
        "id_suffix": "all",
        "format_zh": "全部广告",
        "format_en": "All Ad Formats",
        "desc_zh": "查看该广告主所有格式的广告素材",
        "desc_en": "View all ad formats for this advertiser",
        "icon": "📢",
    },
]


_ad_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3600


def search_google_ads(
    advertiser_name: str,
    country: str = "US",
    limit: int = 8,
) -> list[dict]:
    """
    搜索 Google Ads 透明度中心 — 多格式链接引导方案
    每个广告主返回 4 类广告格式的独立卡片，均可点击查看
    """
    cache_key = f"google_{advertiser_name}_{country}"

    with _cache_lock:
        cached = _ad_cache.get(cache_key)
        if cached and time.time() - cached["fetched_at"] < CACHE_TTL:
            return cached["ads"][:limit]

    base_url = (
        f"https://adstransparency.google.com/"
        f"?advertiser_name={quote_plus(advertiser_name)}"
    )

    ads = []
    for fmt in AD_FORMATS:
        ad_card = {
            "ad_id": f"google_ads_{advertiser_name.replace(' ', '_').lower()}_{fmt['id_suffix']}",
            "advertiser": advertiser_name,
            "title_zh": f"{advertiser_name} — {fmt['format_zh']}",
            "title_en": f"{advertiser_name} — {fmt['format_en']}",
            "body_zh": fmt["desc_zh"],
            "body_en": fmt["desc_en"],
            "thumbnail_url": "",
            "video_url": None,
            "video_id": None,
            "snapshot_url": "",
            "creative_type": "LINK",
            "creative_type_zh": fmt["format_zh"],
            "platform_label_zh": "Google Ads",
            "platform_label_en": "Google Ads",
            "platform_color": "#34A853",
            "first_seen": "",
            "last_seen": "投放中",
            "is_video": False,
            "is_real_ads": True,
            "source": "google_ads",
            "source_icon": fmt["icon"],
            "external_url": base_url + f"&ad_format={fmt['id_suffix']}",
            "times_shown": "",
            "ad_format": fmt["format_zh"],
            "action_hint_zh": f"点击查看 {advertiser_name} 的{fmt['format_zh']}",
            "action_hint_en": f"View {advertiser_name}'s {fmt['format_en']}",
        }
        ads.append(ad_card)

    print(f"[GoogleAds] 返回 {len(ads)} 个广告格式卡片: {advertiser_name}")

    # 缓存
    with _cache_lock:
        _ad_cache[cache_key] = {
            "ads": ads,
            "fetched_at": time.time(),
        }

    return ads[:limit]


def preload_popular_google_ads(app_names: list[str]):
    """后台预加载热门 App 的 Google Ads 搜索链接"""

    def _load():
        for name in app_names:
            try:
                search_google_ads(name, "US", limit=4)
                time.sleep(3)
            except Exception as e:
                print(f"[GoogleAds Preload] {name} 失败: {e}")

    t = threading.Thread(target=_load, daemon=True)
    t.start()
