"""
Google Ads Transparency Center — 免费广告数据源
无需 API Token，无需申请，完全免费

策略：
  Google Ads 透明度中心数据通过 BigQuery 公开数据集提供。
  数据集不可直接 HTTP 下载，但透明度中心网页对所有人开放。
  
  我们采用"搜索链接引导"方案：
  → 为每个 App 生成 Google Ads 透明度中心搜索 URL
  → 用户点击后在新标签页查看该广告主的所有 Google 广告
  → 页面显示：广告缩略图、格式、投放时间、展示次数区间

搜索页 URL 格式：
  https://adstransparency.google.com/?advertiser_name=Canva
"""

import time
import threading
import requests as sync_requests
from urllib.parse import quote_plus


_ad_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3600


def search_google_ads(
    advertiser_name: str,
    country: str = "US",
    limit: int = 8,
) -> list[dict]:
    """搜索 Google Ads 透明度中心 — 搜索链接引导方案"""
    cache_key = f"google_{advertiser_name}_{country}"

    with _cache_lock:
        cached = _ad_cache.get(cache_key)
        if cached and time.time() - cached["fetched_at"] < CACHE_TTL:
            return cached["ads"][:limit]

    search_url = (
        f"https://adstransparency.google.com/"
        f"?advertiser_name={quote_plus(advertiser_name)}"
    )

    # 尝试确认广告主存在（加载 Transparency Center 搜索页）
    advertiser_exists = False
    try:
        resp = sync_requests.get(
            search_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=15,
        )
        if resp.status_code == 200:
            # 粗略检测返回页面是否包含广告主信息
            if advertiser_name.lower() in resp.text.lower():
                advertiser_exists = True
                print(f"[GoogleAds] ✅ {advertiser_name} 存在于 Google Ads 透明度中心")
            else:
                print(f"[GoogleAds] ⚠️ {advertiser_name} 透明度中心页面未匹配到名称")
    except Exception as e:
        print(f"[GoogleAds] 验证失败 (仍生成链接): {e}")

    # 返回引导卡片
    ad_card = {
        "ad_id": f"google_ads_{advertiser_name.replace(' ', '_').lower()}",
        "advertiser": advertiser_name,
        "title_zh": f"{advertiser_name} — Google Ads 广告库",
        "title_en": f"{advertiser_name} — Google Ads Library",
        "body_zh": "点击查看该广告主在 Google 投放的所有广告（含图片/视频/展示次数）",
        "body_en": "View all Google Ads for this advertiser (images, videos, impressions)",
        "thumbnail_url": "",
        "video_url": None,
        "video_id": None,
        "snapshot_url": "",
        "creative_type": "LINK",
        "creative_type_zh": "Google广告库",
        "platform_label_zh": "Google Ads",
        "platform_label_en": "Google Ads",
        "platform_color": "#34A853",
        "first_seen": "",
        "last_seen": "投放中" if advertiser_exists else "",
        "is_video": False,
        "is_real_ads": True,
        "source": "google_ads",
        "source_icon": "🔍",
        "external_url": search_url,
        "times_shown": "",
        "ad_format": "搜索链接",
        "action_hint_zh": "在新标签页打开 Google Ads 透明度中心",
        "action_hint_en": "Open Google Ads Transparency Center in new tab",
    }

    ads = [ad_card]
    print(f"[GoogleAds] 返回搜索链接: {advertiser_name} ({search_url[:60]}...)")

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
                search_google_ads(name, "US", limit=1)
                time.sleep(3)
            except Exception as e:
                print(f"[GoogleAds Preload] {name} 失败: {e}")

    t = threading.Thread(target=_load, daemon=True)
    t.start()
