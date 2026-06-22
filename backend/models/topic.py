from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ============ 创意模板枚举 ============
CREATIVE_TEMPLATES = [
    "fail_state",        # Fail-State: 展示失败→激发挑战欲
    "ugc_real",          # UGC真人: 真人反应/体验视频
    "noob_vs_pro",       # Noob-vs-Pro对比
    "rescue_narrative",  # 救援叙事: 宠物/角色遇险
    "ip_collab",         # IP联名: 借势流行文化
    "reverse_psycho",    # 反向心理: "别下载会上瘾"
    "asmr_satisfying",   # ASMR满足感: 清洁/整理/治愈
    "interactive_gate",  # 互动门禁: Gate Game机制
]

# ============ 情绪标签枚举 ============
SENTIMENT_TAGS = [
    "funny",             # 搞笑
    "rescue_tension",    # 紧张救援
    "nostalgic",         # 怀旧情怀
    "competitive",       # 竞争挑战
    "social_currency",   # 社交货币
    "controversial",     # 争议话题
    "seasonal_festive",  # 节日氛围
    "healing_satisfying",# 满足治愈
]

# ============ 游戏类型推荐 ============
GAME_GENRES = [
    "hypercasual",       # 超休闲
    "hybrid_casual",     # 混合休闲
    "puzzle",            # 消除/解谜
    "strategy_slg",      # 策略SLG
    "rpg_action",        # RPG/动作
    "simulation",        # 模拟经营
    "casino_card",       # 博弈/卡牌
    "shooter_fps",       # 射击FPS
]

# ============ 数据源类型 ============
SOURCE_TYPES = [
    "reddit_hot",        # Reddit热帖
    "twitter_trend",     # X/Twitter热门趋势 —— NEW!
    "tiktok_trend",      # TikTok热梗/挑战
    "google_trends",     # Google Trends上升词
    "pop_culture_ip",    # 流行文化IP
    "seasonal_event",    # 节日/大事件
]

# ============ 广告角度建议 ============
class AdAngle(BaseModel):
    angle_type: str              # 创意模板类型 (对应 CREATIVE_TEMPLATES)
    title: str                   # 广告角度标题
    title_zh: str = ""          # 中文标题
    description: str             # 详细描述：怎么用在广告里
    hook_script: str             # 前3秒Hook脚本/画面描述
    hook_script_zh: str = ""    # 中文Hook脚本
    target_audience: str         # 目标玩家画像
    suggested_genre: str         # 推荐游戏类型
    example_reference: str       # 参考案例（已知成功案例）

# ============ 完整热点数据模型 ============
class HotspotTopic(BaseModel):
    id: str
    title: str                   # 热点标题（原始语言）
    title_zh: str = ""           # 中文翻译
    summary: str                 # 热点摘要
    summary_zh: str = ""         # 中文摘要
    source: str                  # 数据源类型 (SOURCE_TYPES)
    source_url: str = ""         # 原文链接
    
    # 热度指标
    heat_score: float = 0.0      # 综合热度 0-100
    trend_direction: str = ""    # rising / stable / falling
    velocity_score: float = 0.0  # 传播速度 0-100
    creative_index: float = 0.0  # 创意指数 0-100 (对标BigBigAds，综合热度+广告相关度+传播速度)
    
    # 时间
    published_at: str = ""
    fetched_at: str = ""
    
    # AI 分析输出
    ad_relevance: float = 0.0    # 广告相关度 0-10
    ad_angles: List[AdAngle] = [] # 广告角度列表(2-4条)
    sentiment_tags: List[str] = [] # 情绪标签(1-3个)
    recommended_genres: List[str] = [] # 推荐游戏类型(1-3个)
    
    # 分类标签
    category: str = ""           # 主分类
    sub_category: str = ""       # 子分类
    keywords: List[str] = []     # 关键词标签
    
    # 元数据
    region: str = "global"       # 地区: US/EU/global
    language: str = "en"         # 原始语言
    is_verified: bool = False    # 是否经过AI验证
    expires_at: str = ""         # 热点过期时间预估


# ============ API 请求/响应模型 ============
class TopicListResponse(BaseModel):
    total: int
    topics: List[HotspotTopic]
    
class FilterParams(BaseModel):
    source: str = ""
    sentiment: str = ""
    template: str = ""
    genre: str = ""
    region: str = ""
    min_relevance: float = 0
    min_heat: float = 0
    keyword: str = ""
    sort_by: str = "heat_score"  # heat_score / ad_relevance / velocity / time
    sort_order: str = "desc"
    limit: int = 50
    offset: int = 0
