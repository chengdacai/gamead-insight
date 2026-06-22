"""
AI 分析引擎 v3 - 将热点转化为游戏广告创意
完全免费方案：
  1. 增强版规则引擎：情绪标签 + 游戏类型匹配 + 8种创意模板生成
  2. Google Translate 免费接口：翻译标题和摘要为中文
  3. 批量翻译：一次请求翻译多条，减少网络调用
  4. 可选 Groq 增强：有Key时用，没有也不影响
"""
import os
import random
import re
import html
import time
import json
import urllib.parse
import requests
from datetime import datetime
from models.topic import (
    HotspotTopic, AdAngle,
    CREATIVE_TEMPLATES, SENTIMENT_TAGS, GAME_GENRES
)

# ======== Groq 可选（有就用，没有也行）========
def _get_groq_key():
    return os.getenv("GROQ_API_KEY", "")

def _is_groq_available():
    key = _get_groq_key()
    return key != ""

GROQ_MODEL = "llama-3.3-70b-versatile"


def _clean_text(text: str) -> str:
    """清理 HTML 实体编码和多余空白，保留纯文本内容"""
    if not text:
        return ""
    # 先用 BeautifulSoup 提取纯文本（比正则更可靠）
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(text, "html.parser")
        text = soup.get_text(separator=' ', strip=True)
    except ImportError:
        # 没有bs4就回退到正则
        text = re.sub(r'<[^>]+>', ' ', text)
    # 解码HTML实体
    text = html.unescape(text)
    # 移除 [...] 继续阅读
    text = re.sub(r'\[…\]|\[...\]|Continue reading.*', '', text, flags=re.IGNORECASE)
    # 压缩空白
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# ================================================================
# Google Translate 免费翻译（无需 API Key）
# ================================================================
_translate_cache: dict[str, str] = {}

def _google_translate_batch(texts: list[str], source_lang: str = "en", target_lang: str = "zh-CN") -> list[str]:
    """
    Google Translate 免费网页接口批量翻译
    无需 API Key，无 token 限制
    一次请求翻译多条文本
    """
    if not texts:
        return []

    results = []
    # Google Translate 免费接口每次最多约 2000 字符，分批处理
    batch_size = 15  # 每批15条，避免URL过长

    for batch_start in range(0, len(texts), batch_size):
        batch = texts[batch_start:batch_start + batch_size]
        batch_results = []

        # 尝试翻译每个文本
        for text in batch:
            if not text or not text.strip():
                batch_results.append("")
                continue

            # 检查缓存
            cache_key = f"{text[:200]}"
            if cache_key in _translate_cache:
                batch_results.append(_translate_cache[cache_key])
                continue

            # 已经是中文的跳过
            if _is_mostly_chinese(text):
                batch_results.append(text)
                _translate_cache[cache_key] = text
                continue

            try:
                translated = _google_translate_single(text, source_lang, target_lang)
                _translate_cache[cache_key] = translated
                batch_results.append(translated)
            except Exception as e:
                print(f"  [翻译失败] {text[:40]}... -> {e}")
                # 降级：返回原文
                batch_results.append(text)

            # 小延迟，避免被限流
            time.sleep(0.3)

        results.extend(batch_results)

    return results


def _google_translate_single(text: str, source_lang: str = "en", target_lang: str = "zh-CN") -> str:
    """
    Google Translate 免费网页接口翻译单条文本
    接口：https://translate.googleapis.com/translate_a/single
    """
    if not text or not text.strip():
        return ""

    # 截断过长文本
    if len(text) > 2000:
        text = text[:2000]

    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": source_lang,
        "tl": target_lang,
        "dt": "t",
        "q": text,
    }

    resp = requests.get(url, params=params, timeout=10)
    if resp.status_code != 200:
        raise Exception(f"Google Translate API returned {resp.status_code}")

    data = resp.json()
    # 返回格式: [[["翻译结果","原文",...],...],...]
    if data and data[0]:
        translated_parts = []
        for part in data[0]:
            if part and part[0]:
                translated_parts.append(part[0])
        return "".join(translated_parts)

    return text


def _is_mostly_chinese(text: str) -> bool:
    """判断文本是否已经是中文"""
    if not text:
        return False
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    return chinese_chars > len(text) * 0.3


# ================================================================
# 增强版规则引擎（全中文输出，无需任何 API）
# ================================================================
TEMPLATE_DEFINITIONS = {
    "fail_state": {
        "name": "Fail-State 失败挑战",
        "desc": "展示玩家犯明显错误/反复失败，激发'我能做得更好'的竞争心理",
        "hook_examples": [
            "画面：角色在游戏中做出明显错误操作，反复失败",
            "字幕：'Only 1% can pass this level'",
            "画面：最后一秒失败，差一点点就成功",
            "字幕：'Can YOU do better?'",
        ],
    },
    "ugc_real": {
        "name": "UGC 真人反应",
        "desc": "真实人物（素人/KOL）边玩边反应，建立信任感",
        "hook_examples": [
            "真人拿着手机玩游戏，突然惊讶大叫",
            "朋友间互相挑战：'你肯定过不了这一关'",
            "办公室摸鱼被老板发现→切到游戏画面（反转）",
            "情侣/家人一起玩，搞笑互动",
        ],
    },
    "noob_vs_pro": {
        "name": "Noob vs Pro 对比",
        "desc": "新手笨拙操作 vs 高手流畅操作对比",
        "hook_examples": [
            "左边：手忙脚乱的新手 | 右边：行云流水的老手",
            "NOOB: 0分 3次失败 → PRO: 完美通关 3星",
            "'This is how you play' (高手操作展示)",
            "'vs This is how I play' (搞笑失败)",
        ],
    },
    "rescue_narrative": {
        "name": "救援叙事",
        "desc": "可爱生物/角色遇险，玩家=英雄，情感驱动安装",
        "hook_examples": [
            "小狗被困在迷宫里，发出可怜叫声",
            "房子在下沉！一家人需要你帮忙逃脱！",
            "小猫被卡在高处，只有你能救它",
            "角色溺水/坠落，倒计时紧张感",
        ],
    },
    "ip_collab": {
        "name": "IP 联名借势",
        "desc": "直接借用流行文化IP的热度和认知度",
        "hook_examples": [
            "游戏角色的皮肤变成热门电影主角造型",
            "游戏场景复刻热门影视剧名场面",
            "BGM使用当下最火的歌曲",
            "游戏内活动主题 = 当前最火的梗",
        ],
    },
    "reverse_psycho": {
        "name": "反向心理",
        "desc": "用反向话术激发好奇心和叛逆心",
        "hook_examples": [
            "警告：此游戏极度上瘾",
            "Don't download this game. You'll lose your job.",
            "99% 的人卸载了。剩下1%停不下来。",
            "医生说我不应该推荐这个游戏...",
        ],
    },
    "asmr_satisfying": {
        "name": "ASMR 满足感",
        "desc": "清洁/整理/治愈系内容带来的满足感",
        "hook_examples": [
            "高压水枪清洗脏兮兮的表面→瞬间变干净",
            "杂乱物品按颜色/形状完美归位",
            "泡沫覆盖→一按全部消除（解压音效）",
            "混乱的房间→3秒后井井有条",
        ],
    },
    "interactive_gate": {
        "name": "互动门禁 Gate Game",
        "desc": "角色跑向带数字的门，选择正确答案获得奖励",
        "hook_examples": [
            "角色冲刺！左门 x2 右门 +10 巨大奖金门",
            "选错门 → 失败特效 | 选对门 → 彩带+金币雨",
            "速度越来越快！你能撑过10道门吗？",
            "门上的数字是热点相关的梗/知识问答",
        ],
    },
}

# ============ 游戏类型映射 ============
GENRE_MAP = {
    "puzzle": ["puzzle", "match", "word", "bubble", "candy", "tile", "block", "merge", "消除", "解谜", "合成"],
    "hypercasual": ["run", "jump", "stack", "flip", "dodge", "race", "idle", "click", "休闲", "跑酷"],
    "hybrid_casual": ["merge", "build", "decorate", "cook", "farm", "manage", "collect", "合成", "经营", "装饰"],
    "strategy_slg": ["war", "battle", "empire", "kingdom", "clan", "alliance", "conquer", "策略", "战争", "帝国"],
    "rpg_action": ["hero", "quest", "dungeon", "dragon", "magic", "fantasy", "fight", "RPG", "动作", "冒险"],
    "simulation": ["life", "city", "business", "pet", "doctor", "tycoon", "模拟", "经营", "城市"],
    "casino_card": ["card", "slot", "poker", "blackjack", "roulette", "spin", "卡牌", "赌场"],
    "shooter_fps": ["shoot", "gun", "sniper", "tactical", "fps", "battle royale", "射击", "枪战"],
}

SENTIMENT_MAP = {
    "funny": ["funny", "lol", "hilarious", "meme", "joke", "comedy", "laugh", "fail", "facepalm", "lmao", "rofl", "搞笑", "梗", "笑话"],
    "rescue_tension": ["save", "rescue", "trapped", "help", "emergency", "danger", "drown", "stuck", "救援", "紧张", "危险"],
    "nostalgic": ["nostalgia", "retro", "vintage", "classic", "remember", "childhood", "90s", "00s", "throwback", "怀旧", "复古", "回忆"],
    "competitive": ["challenge", "impossible", "only 1%", "beat this", "hardcore", "pro", "noob", "boss fight", "挑战", "竞争", "硬核"],
    "social_currency": ["viral", "trending", "everyone", "fyp", "must see", "share this", "tag friend", "社交", "病毒", "分享"],
    "controversial": ["shocking", "outrage", "debate", "cancel", "scandal", "unbelievable", "wtf", "争议", "震惊", "丑闻"],
    "seasonal_festive": ["christmas", "halloween", "holiday", "festival", "celebration", "new year", "thanksgiving", "节日", "庆典", "圣诞"],
    "healing_satisfying": ["satisfying", "asmr", "cleaning", "organizing", "perfect fit", "oddly satisfying", "therapeutic", "治愈", "满足", "整理"],
}

# ============ 广告角度模板（按数据源分类，全中文）============
ANGLE_TEMPLATES_BY_SOURCE = {
    "reddit_hot": [
        ("ugc_real", "Reddit用户热议话题", "将「{topic}」作为UGC广告的核心讨论点，让真实用户围绕它创作反应视频。Reddit社区的真实讨论最容易引发共鸣，可以截图热评作为广告素材。", "画面：手机屏幕录屏，用户正在看关于「{topic}」的Reddit帖子，表情从困惑到大笑。字幕弹出：'Reddit上都在说这个...'"),
        ("ip_collab", "社区热梗借势", "「{topic}」已成为社区meme，将其做成游戏内的彩蛋或道具。Reddit诞生的梗传播速度极快，48小时内借势效果最佳。", "画面：游戏角色做出「{topic}」的经典动作/meme姿势，弹幕飘过热评截图。BGM切换为相关梗音乐。"),
        ("reverse_psycho", "逆向营销", "'为什么所有人都在讨论「{topic}」？'——用好奇心驱动点击。Reddit用户反感硬广，逆向话术反而能降低防御心理。", "黑底白字：'别滑了。「{topic}」改变了一切。' 3秒后切入游戏画面，角色做出震惊表情。"),
        ("fail_state", "挑战型广告", "'你以为你懂「{topic}」？'——设置相关问答关卡，激发'我比他们强'的心理。", "画面：角色在游戏中对「{topic}」做出明显错误反应 → 反复失败 → 字幕：'你能做得更好吗？'"),
    ],
    "twitter_trend": [
        ("ip_collab", "X热搜借势广告", "「{topic}」正在X平台热搜！第一时间制作关联广告素材，在24-48小时内投放效果最佳。X平台话题生命周期短，速度是关键。", "画面：X平台热搜榜动画 → 「{topic}」大字弹入屏幕 → '现在你的游戏也可以...' → 游戏画面闪现。"),
        ("ugc_real", "话题讨论类UGC", "围绕「{topic}」制作'X用户怎么说'系列UGC广告。截取真实X讨论截图+游戏内相关内容，增加可信度。", "画面：手机屏幕，X平台上关于「{topic}」的讨论滚动 → 镜头拉远 → 真人玩家说'让我在游戏里试试' → 切入游戏。"),
        ("reverse_psycho", "热搜逆向营销", "X上「{topic}」引发争议？反向操作：'别信X上说的，进游戏看真相'。争议话题在游戏中安全地'玩'出来。", "画面：黑底白字逐渐浮现 → 'X上关于「{topic}」的说法全错了' → '游戏里见真章' → CTA按钮。"),
        ("interactive_gate", "Gate Game问答", "在Gate Game中植入「{topic}」相关的趣味问答题目。X热搜话题做成选择题，用户边玩游戏边了解热点。", "画面：角色冲刺，门上显示「{topic}」的选择题选项 → 选对进入奖励门 → 选错搞笑失败 → 速度越来越快。"),
    ],
    "tiktok_trend": [
        ("ip_collab", "TikTok趋势借势", "使用当前TikTok #{topic} 的BGM和视觉风格制作游戏广告。前2秒必须复刻TikTok原视频的转场和滤镜，第3秒切入游戏。", "画面：前2秒使用「{topic}」同款滤镜/转场 → 第3秒切入游戏画面，保持同款BGM。节奏必须同步。"),
        ("ugc_real", "TikTok原生风格", "完全模仿TikTok热门视频的开头风格（绿屏自拍/对嘴型/手势舞），自然过渡到游戏。用户以为在看TikTok内容，不会划走。", "画面：TikTok经典绿屏自拍开场 → '等等，你还没玩过这个？' → 游戏画面。竖屏拍摄，9:16比例。"),
        ("interactive_gate", "Gate Game趋势版", "在Gate Game机制中使用「{topic}」相关的选项。Gate Game是2024-2025年TikTok上最火的广告形式之一。", "画面：角色冲刺！门上写的是「{topic}」相关的选择题 → 选对得金币 → 选错角色摔倒。速度越来越快。"),
        ("asmr_satisfying", "节奏同步", "如果「{topic}」有特定音乐/节奏，做成ASMR类玩法的节拍匹配。TikTok用户对音画同步内容完播率极高。", "画面：游戏操作与「{topic}」的BGM完美同步 → 每一下都踩在节拍上 → 视觉特效：清脆的消除音效 + 满屏粒子。"),
    ],
    "google_trends": [
        ("ip_collab", "搜索趋势借势", "「{topic}」正在快速上升搜索量，第一时间借势制作相关素材。Google Trends上升词代表大众好奇心，48小时窗口期。", "画面：「{topic}」大字标题打在屏幕中央 → '现已登陆[游戏名]' → 游戏画面闪现 → CTA按钮。"),
        ("reverse_psycho", "好奇心驱动", "Google显示「{topic}」搜索暴增500%，为什么？用数据制造紧迫感。", "画面：Google Trends折线图飙升动画 → 「{topic}」大字 → 你的游戏logo出现 → '答案在游戏里'。"),
        ("rescue_narrative", "新闻叙事", "利用「{topic}」的新闻属性构建叙事框架。搜索趋势往往关联热点事件，可以用新闻播报风格制造真实感。", "画面：新闻播报风格的开场 → '突发：「{topic}」' → 切入游戏相关剧情 → 角色面对危机。"),
    ],
    "pop_culture_ip": [
        ("ip_collab", "IP联名核心方案", "与「{topic}」进行深度联动：限定皮肤/场景/玩法。这是最高ROI的借势方式，但需要IP授权或巧妙擦边。", "画面：「{topic}」标志性画面 → 游戏角色穿上「{topic}」主题服装/进入主题地图 → '限时联动活动'弹窗。"),
        ("nostalgic", "情怀杀", "「{topic}」唤醒集体回忆，针对80后/90后/00后玩家群体。情怀是最强的情绪触发器，CTR通常比常规高40-60%。", "画面：像素风复古画面 → 「{topic}」回来了 → 现代画质游戏画面无缝过渡 → '你童年的回忆，现在可以玩了'。"),
        ("social_currency", "社交货币", "'玩了「{topic}」主题的游戏，快去发朋友圈'。利用IP粉丝的分享欲做裂变。", "画面：游戏内「{topic}」联动内容 → 社交分享界面 → '你的朋友需要看到这个' → 分享按钮高亮。"),
        ("ugc_real", "粉丝共创", "邀请「{topic}」的粉丝群体参与UGC广告创作。粉丝自制内容的信任度是品牌广告的3倍。", "画面：多个不同国家的粉丝各自用方言表达对「{topic}」x游戏联动的期待 → 拼接剪辑 → 游戏画面收尾。"),
    ],
    "seasonal_event": [
        ("seasonal_festive", "节日限定", "「{topic}」节日限定活动/皮肤/玩法上线。节日广告CPI比平时低20-30%，是投放黄金期。", "画面：节日氛围满满的加载界面 → 限定角色皮肤展示 → '限时上线！' → 倒计时特效。"),
        ("rescue_narrative", "节日叙事", "围绕「{topic}」构建温馨/有趣的节日故事线。节日情感广告完播率比功能展示高70%。", "画面：「{topic}」前夕，角色们在准备庆祝 → 遇到小插曲 → 玩家帮助解决 → 温馨结局。"),
        ("asmr_satisfying", "节日装饰", "「{topic}」主题的装饰/布置/整理玩法。节日ASMR内容在TikTok和Instagram上传播力极强。", "画面：空荡荡的场景 → 一点点添加「{topic}」装饰物 → 最终呈现完美的节日氛围 → 满足感音效。"),
    ],
}


def _rule_based_analyze(topic: HotspotTopic) -> HotspotTopic:
    """增强版规则引擎分析（无需 API Key），全中文输出"""
    # 清理文本
    topic.title = _clean_text(topic.title)
    topic.summary = _clean_text(topic.summary)

    # 也清理已翻译的摘要中的HTML标签
    if topic.title_zh:
        topic.title_zh = _clean_text(topic.title_zh)
    if topic.summary_zh:
        topic.summary_zh = _clean_text(topic.summary_zh)

    title_lower = topic.title.lower()
    summary_lower = (topic.summary or "").lower()
    combined = f"{title_lower} {summary_lower}"

    # 1. 匹配情绪标签
    sentiments = []
    for sent, keywords in SENTIMENT_MAP.items():
        if any(kw in combined for kw in keywords):
            sentiments.append(sent)
    if not sentiments:
        sentiments = ["competitive"]
    topic.sentiment_tags = sentiments[:3]

    # 2. 匹配推荐游戏类型
    genres = []
    for genre, keywords in GENRE_MAP.items():
        if any(kw in combined for kw in keywords):
            genres.append(genre)
    if not genres:
        default_map = {
            "tiktok_trend": ["hypercasual", "hybrid_casual"],
            "twitter_trend": ["hypercasual", "hybrid_casual", "strategy_slg"],
            "reddit_hot": ["hypercasual", "puzzle"],
            "google_trends": ["hybrid_casual", "strategy_slg"],
            "pop_culture_ip": ["rpg_action", "hypercasual"],
            "seasonal_event": ["simulation", "hybrid_casual"],
        }
        genres = default_map.get(topic.source, ["hypercasual"])
    topic.recommended_genres = genres[:3]

    # 3. 生成广告角度建议（全中文）
    ad_angles = []
    templates_for_source = ANGLE_TEMPLATES_BY_SOURCE.get(
        topic.source, ANGLE_TEMPLATES_BY_SOURCE["reddit_hot"]
    )
    selected_angles = random.sample(templates_for_source, min(len(templates_for_source), 4))

    for template_type, angle_title, angle_desc, hook_script_template in selected_angles:
        # 优先用中文标题，没有则用英文
        display_title = topic.title_zh if topic.title_zh else topic.title[:60]
        angle = AdAngle(
            angle_type=template_type,
            title=angle_title.format(topic=display_title),
            title_zh=angle_title.format(topic=display_title),
            description=angle_desc.format(topic=display_title),
            hook_script=hook_script_template.format(topic=display_title),
            hook_script_zh=hook_script_template.format(topic=display_title),
            target_audience=_infer_target_audience(topic, template_type),
            suggested_genre=random.choice(topic.recommended_genres) if topic.recommended_genres else "hypercasual",
            example_reference=_get_example_reference(template_type),
        )
        ad_angles.append(angle)

    topic.ad_angles = ad_angles

    # 4. 计算广告相关度
    relevance_factors = [
        len(sentiments) * 1.5,
        len(genres) * 1.2,
        len(ad_angles) * 2,
        10 if topic.source in ["tiktok_trend", "pop_culture_ip"] else 0,
        8 if any(s in combined for s in ['viral', 'trending', 'meme', 'challenge']) else 0,
    ]
    topic.ad_relevance = round(min(10, sum(relevance_factors) / 4 + random.uniform(-0.5, 1.5)), 1)

    # 5. 计算创意指数 (对标BigBigAds，0-100)
    # 综合: 热度(40%) + 广告相关度(35%) + 传播速度(25%)
    topic.creative_index = round(
        topic.heat_score * 0.4 +
        topic.ad_relevance * 10 * 0.35 +  # ad_relevance是0-10，转换到0-100
        topic.velocity_score * 0.25,
        1
    )

    topic.is_verified = True
    return topic


# ================================================================
# Groq 增强分析（可选，有Key时用，没有跳过）
# ================================================================
def _groq_batch_analyze(topics: list[HotspotTopic]) -> list[HotspotTopic]:
    """
    使用 Groq 批量分析热点（一次请求分析多条，大幅节省token）
    只在有 Groq Key 且额度充足时使用
    """
    if not _is_groq_available():
        return topics  # 没有Key，直接返回

    try:
        import groq
        client = groq.Groq(api_key=_get_groq_key())

        # 每批5条，一次请求
        batch_size = 5
        enhanced_count = 0

        for batch_start in range(0, len(topics), batch_size):
            batch = topics[batch_start:batch_start + batch_size]

            # 构建批量prompt
            items_text = []
            for i, t in enumerate(batch):
                clean_title = _clean_text(t.title)
                items_text.append(f"{i+1}. 标题：{clean_title}\n   来源：{t.source}\n   摘要：{_clean_text(t.summary)[:200]}")

            prompt = f"""你是游戏广告创意策略师。分析以下{len(batch)}条热点，为每条生成1个最佳广告创意角度。

热点列表：
{chr(10).join(items_text)}

输出JSON数组，每个元素：
{{
  "index": 1,
  "best_angle": "fail_state/ugc_real/noob_vs_pro/rescue_narrative/ip_collab/reverse_psycho/asmr_satisfying/interactive_gate",
  "hook_script_zh": "前3秒视频脚本（中文，有画面感，30-50字）",
  "target_audience": "目标玩家画像（中文）"
}}

只输出JSON数组，不要解释。"""

            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                    max_tokens=1500,
                    response_format={"type": "json_object"},
                )

                raw = response.choices[0].message.content.strip()
                result = json.loads(raw)

                # 如果返回的是数组
                if isinstance(result, list):
                    for item in result:
                        idx = item.get("index", 0) - 1
                        if 0 <= idx < len(batch):
                            topic = batch[idx]
                            # 找到匹配的广告角度，替换hook_script_zh
                            best_angle = item.get("best_angle", "")
                            hook_zh = item.get("hook_script_zh", "")
                            audience = item.get("target_audience", "")

                            for angle in topic.ad_angles:
                                if angle.angle_type == best_angle:
                                    angle.hook_script_zh = hook_zh
                                    angle.target_audience = audience
                                    break

                    enhanced_count += len(batch)
                    print(f"  [Groq增强] 已增强 {enhanced_count}/{len(topics)}")

            except Exception as e:
                print(f"  [Groq增强失败，跳过此批] {e}")
                # 不降级，规则引擎已经生成了内容

            # Groq 速率限制
            time.sleep(1)

        return topics

    except ImportError:
        print("[Groq] groq包未安装，使用规则引擎模式")
        return topics
    except Exception as e:
        print(f"[Groq] 批量增强失败: {e}")
        return topics


# ================================================================
# 翻译引擎（Google Translate 免费接口）
# ================================================================
def _translate_topics(topics: list[HotspotTopic]) -> list[HotspotTopic]:
    """批量翻译所有热点的标题和摘要为中文"""
    # 先清理所有原始文本的HTML标签
    for topic in topics:
        topic.title = _clean_text(topic.title)
        topic.summary = _clean_text(topic.summary)

    # 收集需要翻译的文本
    to_translate = []
    translate_map = []  # (topic_index, field_name)

    for i, topic in enumerate(topics):
        # 跳过已经是中文的（如节日事件）
        if _is_mostly_chinese(topic.title):
            topic.title_zh = topic.title
        else:
            to_translate.append(topic.title)
            translate_map.append((i, "title"))

        if topic.summary and not _is_mostly_chinese(topic.summary):
            to_translate.append(topic.summary[:300])  # 截断摘要
            translate_map.append((i, "summary"))
        elif topic.summary:
            topic.summary_zh = topic.summary

    if not to_translate:
        print("[翻译] 无需翻译（所有内容已是中文）")
        return topics

    print(f"[翻译] 正在翻译 {len(to_translate)} 条文本（Google Translate 免费接口）...")

    try:
        translated_texts = _google_translate_batch(to_translate)

        # 回填翻译结果
        for (topic_idx, field), translated in zip(translate_map, translated_texts):
            # 清理翻译结果中可能残留的HTML标签
            translated = _clean_text(translated)
            if field == "title":
                topics[topic_idx].title_zh = translated
            elif field == "summary":
                topics[topic_idx].summary_zh = translated

        translated_count = sum(1 for t in topics if t.title_zh)
        print(f"[翻译完成] 成功翻译 {translated_count}/{len(topics)} 条热点")

    except Exception as e:
        print(f"[翻译失败] {e}")
        # 降级：标题用原文，摘要留空
        for topic in topics:
            if not topic.title_zh:
                topic.title_zh = topic.title

    return topics


# ================================================================
# 主分析器
# ================================================================
class AIAnalyzer:
    """AI 分析引擎 - 将热点转化为可执行的游戏广告创意
    完全免费方案：规则引擎 + Google Translate
    可选增强：Groq（有Key时自动启用，没有也不影响）
    """

    @staticmethod
    def analyze(topic: HotspotTopic) -> HotspotTopic:
        """单条分析（规则引擎）"""
        return _rule_based_analyze(topic)

    @staticmethod
    def batch_analyze(topics: list[HotspotTopic]) -> list[HotspotTopic]:
        """批量分析所有热点
        1. 规则引擎生成广告角度（全中文模板）
        2. Google Translate 翻译标题和摘要
        3. 可选：Groq 增强 hook_script（有Key时）
        """
        print(f"[AI分析] 开始分析 {len(topics)} 个热点...")

        # Step 1: Google Translate 翻译标题和摘要（先翻译，这样规则引擎能用中文标题）
        print("[AI分析] Step 1: Google Translate 翻译中英文...")
        topics = _translate_topics(topics)

        # Step 2: 规则引擎分析（生成广告角度，全中文模板，使用已翻译的标题）
        print("[AI分析] Step 2: 规则引擎生成广告创意角度...")
        analyzed = []
        for i, topic in enumerate(topics):
            try:
                analyzed_topic = _rule_based_analyze(topic)
                analyzed.append(analyzed_topic)
            except Exception as e:
                print(f"  分析失败: {topic.title[:40]} -> {e}")
                analyzed.append(topic)

            if (i + 1) % 10 == 0:
                print(f"  规则引擎进度: {i+1}/{len(topics)}")

        print(f"[AI分析] Step 2 完成: {len(analyzed)} 条热点已生成广告角度")

        # Step 3: Groq 增强（可选，有Key时才用，且只增强hook_script）
        if _is_groq_available():
            print("[AI分析] Step 3: Groq 增强 hook_script（可选）...")
            analyzed = _groq_batch_analyze(analyzed)
        else:
            print("[AI分析] Step 3: 跳过（无 Groq Key，规则引擎已足够）")

        print(f"[AI分析] 全部完成! 成功分析 {len(analyzed)} 个热点")
        return analyzed


# ============ 辅助函数 ============
def _infer_target_audience(topic: HotspotTopic, template_type: str) -> str:
    audience_templates = {
        "fail_state": "18-34岁男性为主，好胜心强，喜欢挑战，休闲时段游玩",
        "ugc_real": "18-29岁男女均衡，重度社交媒体用户，容易被真实感打动",
        "noob_vs_pro": "18-25岁男性偏多，竞技爱好者，喜欢炫耀技术",
        "rescue_narrative": "25-44岁女性偏多，情感驱动型玩家，喜欢养成/模拟类",
        "ip_collab": "该IP的粉丝群体 + 重度游戏玩家，18-35岁",
        "reverse_psycho": "18-30岁好奇心强，叛逆心理，喜欢尝鲜",
        "asmr_satisfying": "25-44岁女性偏多，压力大的职场人群，寻求放松",
        "interactive_gate": "全年龄段，轻度玩家，碎片时间游玩",
    }
    base = audience_templates.get(template_type, "18-35岁移动游戏玩家")
    if topic.region and topic.region != "global":
        base += f" | {topic.region}市场"
    return base


def _get_example_reference(template_type: str) -> str:
    references = {
        "fail_state": "Royal Match / Project Makeover / Candy Crush — 展示明显错误操作，CTR比常规高40%",
        "ugc_real": "Supercell x TikTok校园创作者 — CTR提升20%, CPI降低15% (Liftoff 2025报告)",
        "noob_vs_pro": "大量Hypercasual游戏标配 — 新手滑稽操作 vs 高手流畅通关对比",
        "rescue_narrative": "Tap Shift(Arrow Escape)/Tap Hexa(Family Story Puzzle) — 救援叙事使 engagement 提升60%",
        "ip_collab": "Fortnite x 各大IP联名模式 — Travis Scott演唱会、漫威联动等，单活动收入破亿美金",
        "reverse_psycho": "MotiveMinds等益智游戏 — '99%的人过不了第3关' 类文案",
        "asmr_satisfying": "Block Blast / 清洁整理类游戏 — ASMR音效+视觉效果，完播率极高",
        "interactive_gate": "Saygames / Rollic 等发行商 — Gate Game机制CPI降低30%",
    }
    return references.get(template_type, "同类创意在2024-2025年头部UA素材中广泛验证")
