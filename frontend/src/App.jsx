import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import axios from 'axios'

// ============ 常量 ============
const API_BASE = window.__API_BASE__ || '/api'

const SOURCE_META = {
  reddit_hot:      { label: 'Reddit',       color: '#FF4500', icon: 'R' },
  twitter_trend:   { label: 'X/Twitter',    color: '#1DA1F2', icon: 'X' },
  tiktok_trend:    { label: 'TikTok',       color: '#FF0050', icon: 'T' },
  google_trends:   { label: 'Google',       color: '#4285F4', icon: 'G' },
  pop_culture_ip:  { label: 'PopCulture',   color: '#E84393', icon: 'P' },
  seasonal_event:  { label: 'Events',       color: '#FDCB6E', icon: 'E' },
}

const PLATFORM_TABS = [
  { key: 'overall',        label: '综合排行',     icon: '🏆', color: '#00B894' },
  { key: 'reddit_hot',     label: 'Reddit 热帖',  icon: '🔥', color: '#FF4500' },
  { key: 'twitter_trend',  label: 'X/Twitter',    icon: '🐦', color: '#1DA1F2' },
  { key: 'tiktok_trend',   label: 'TikTok 趋势',  icon: '🎵', color: '#FF0050' },
  { key: 'google_trends',  label: 'Google Trends',icon: '📈', color: '#4285F4' },
  { key: 'pop_culture_ip', label: '流行文化IP',   icon: '🎬', color: '#E84393' },
  { key: 'seasonal_event', label: '节日营销',     icon: '🎉', color: '#FDCB6E' },
]

const SENTIMENT_META = {
  funny:              { label: '搞笑',       color: '#FECA57' },
  rescue_tension:     { label: '紧张救援',    color: '#FF6B6B' },
  nostalgic:          { label: '怀旧',       color: '#A29BFE' },
  competitive:        { label: '竞争挑战',    color: '#4ECDC4' },
  social_currency:    { label: '社交货币',    color: '#00B894' },
  controversial:      { label: '争议',       color: '#E17055' },
  seasonal_festive:   { label: '节日',       color: '#FDCB6E' },
  healing_satisfying: { label: '满足治愈',    color: '#74B9FF' },
}

const TEMPLATE_META = {
  fail_state:       { label: 'Fail-State',  short: 'Fail' },
  ugc_real:         { label: 'UGC真人',     short: 'UGC' },
  noob_vs_pro:      { label: 'Noob vs Pro', short: 'NvP' },
  rescue_narrative: { label: '救援叙事',     short: '救援' },
  ip_collab:        { label: 'IP联名',      short: 'IP' },
  reverse_psycho:   { label: '反向心理',     short: '反向' },
  asmr_satisfying:  { label: 'ASMR满足',    short: 'ASMR' },
  interactive_gate: { label: '互动门禁',     short: '门禁' },
}

const GENRE_META = {
  hypercasual: '超休闲', hybrid_casual: '混合休闲', puzzle: '解谜消除',
  strategy_slg: '策略SLG', rpg_action: 'RPG/动作', simulation: '模拟经营',
  casino_card: '博弈卡牌', shooter_fps: '射击FPS',
}

const REGION_META = {
  us: '美国', eu: '欧洲', global: '全球', uk: '英国',
  ca: '加拿大', au: '澳洲', de: '德国', fr: '法国',
}

const TREND_META = {
  rising:  { label: '上升', icon: '▲', color: '#00B894' },
  stable:  { label: '稳定', icon: '—', color: '#636E72' },
  falling: { label: '下降', icon: '▼', color: '#FF6B6B' },
}

// ============ 工具 ============
const dt = t => t?.title_zh || t?.title || ''
const ds = t => t?.summary_zh || t?.summary || ''
const da = a => a?.title_zh || a?.title || ''
const dh = a => a?.hook_script_zh || a?.hook_script || ''

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  return `${Math.floor(hr / 24)}天前`
}

function countdownFmt(seconds) {
  if (seconds <= 0) return '即将刷新'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}分${s.toString().padStart(2, '0')}秒`
}

function heatColor(score) {
  if (score >= 75) return '#FF6B6B'
  if (score >= 50) return '#FECA57'
  if (score >= 25) return '#74B9FF'
  return '#636E72'
}

function rankBg(rank) {
  if (rank === 1) return 'linear-gradient(135deg, #FFD700, #FFA500)'
  if (rank === 2) return 'linear-gradient(135deg, #C0C0C0, #A0A0A0)'
  if (rank === 3) return 'linear-gradient(135deg, #CD7F32, #B87333)'
  return 'var(--bg-3)'
}

function rankFg(rank) {
  if (rank <= 3) return '#0a0e14'
  return 'var(--text-1)'
}

// ============ 来源徽章 ============
function SourcePill({ source }) {
  const meta = SOURCE_META[source] || { label: source, color: '#636E72', icon: '?' }
  return (
    <span className="source-pill" style={{ '--sc': meta.color }}>
      <span className="source-pill-icon">{meta.icon}</span>
      {meta.label}
    </span>
  )
}

// ============ 热度条 ============
function HeatBar({ score }) {
  return (
    <div className="heat-bar">
      <div
        className="heat-bar-fill"
        style={{ width: `${Math.min(score, 100)}%`, background: heatColor(score) }}
      />
    </div>
  )
}

// ============ 排行榜行卡片 ============
function RankCard({ topic, rank, onClick, platform }) {
  const [hovered, setHovered] = useState(false)
  const sm = SOURCE_META[topic.source] || { color: '#636E72' }
  const isOverall = platform === 'overall'

  return (
    <div
      className={`rank-card ${hovered ? 'hovered' : ''}`}
      onClick={() => onClick(topic)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 排名编号 */}
      <div className="rank-number" style={{ background: rankBg(rank), color: rankFg(rank) }}>
        {rank}
      </div>

      {/* 来源色条 */}
      <div className="rank-accent" style={{ background: sm.color }} />

      {/* 内容区 */}
      <div className="rank-content">
        <div className="rank-top">
          {isOverall && <SourcePill source={topic.source} />}
          <div className="rank-tags">
            {(topic.sentiment_tags || []).slice(0, 2).map(s => {
              const m = SENTIMENT_META[s]
              if (!m) return null
              return <span key={s} className="chip chip-sentiment" style={{ '--cc': m.color }}>{m.label}</span>
            })}
            {(topic.recommended_genres || []).slice(0, 1).map(g => (
              <span key={g} className="chip chip-genre">{GENRE_META[g] || g}</span>
            ))}
          </div>
          <div className="rank-heat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2s4 4 4 8a4 4 0 01-8 0c0-2 1-3 1-3s-3 2-3 6a6 6 0 0012 0c0-6-6-11-6-11z" fill={heatColor(topic.heat_score || 0)}/>
            </svg>
            <span className="heat-num" style={{ color: heatColor(topic.heat_score || 0) }}>
              {(topic.heat_score || 0).toFixed(0)}
            </span>
            <span className={`trend-arrow trend-${topic.trend_direction}`}>
              {TREND_META[topic.trend_direction]?.icon}
            </span>
          </div>
        </div>

        <h3 className="rank-title">{dt(topic)}</h3>

        {ds(topic) && (
          <p className="rank-desc">{ds(topic).slice(0, 120)}{ds(topic).length > 120 ? '…' : ''}</p>
        )}

        <div className="rank-bottom">
          {topic.ad_angles?.[0] && (
            <div className="rank-angle-hint">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6L12 2z" fill="#A29BFE"/>
              </svg>
              <span>{TEMPLATE_META[topic.ad_angles[0].angle_type]?.label || topic.ad_angles[0].angle_type}</span>
              {topic.ad_angles.length > 1 && <span className="angle-count">+{topic.ad_angles.length - 1}</span>}
            </div>
          )}
          <div className="rank-meta">
            <span className="relevance-pill" title="创意指数（对标BigBigAds，综合热度+相关度+传播力）">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6L12 2z" fill="#A29BFE"/>
              </svg>
              创意{(topic.creative_index || 0).toFixed(0)}
            </span>
            <span className="relevance-pill" title="广告相关度">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#00B894" strokeWidth="2"/>
                <circle cx="12" cy="12" r="5" fill="#00B894"/>
              </svg>
              {(topic.ad_relevance || 0).toFixed(1)}
            </span>
            {topic.region && topic.region !== 'global' && (
              <span className="region-pill">{REGION_META[topic.region] || topic.region}</span>
            )}
            <span className="card-time">{timeAgo(topic.fetched_at || topic.published_at)}</span>
          </div>
        </div>

        <HeatBar score={topic.heat_score || 0} />
      </div>
    </div>
  )
}

// ============ 详情弹窗 ============
function DetailModal({ topic, onClose }) {
  if (!topic) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="modal-header" style={{ '--hc': SOURCE_META[topic.source]?.color }}>
          <div className="modal-header-top">
            <SourcePill source={topic.source} />
            <span className={`trend-pill trend-${topic.trend_direction}`}>
              {TREND_META[topic.trend_direction]?.icon} {TREND_META[topic.trend_direction]?.label}
            </span>
          </div>
          <h2 className="modal-title">{dt(topic)}</h2>

          <div className="modal-scores">
            <div className="score-block">
              <div className="score-val" style={{ color: '#A29BFE' }}>
                {(topic.creative_index || 0).toFixed(0)}
              </div>
              <div className="score-label">创意指数</div>
            </div>
            <div className="score-divider" />
            <div className="score-block">
              <div className="score-val" style={{ color: heatColor(topic.heat_score || 0) }}>
                {(topic.heat_score || 0).toFixed(1)}
              </div>
              <div className="score-label">热度</div>
            </div>
            <div className="score-divider" />
            <div className="score-block">
              <div className="score-val" style={{ color: '#00B894' }}>
                {(topic.ad_relevance || 0).toFixed(1)}
              </div>
              <div className="score-label">广告相关度</div>
            </div>
            <div className="score-divider" />
            <div className="score-block">
              <div className="score-val" style={{ color: '#74B9FF' }}>
                {(topic.velocity_score || 0).toFixed(0)}
              </div>
              <div className="score-label">传播速度</div>
            </div>
          </div>
        </div>

        {ds(topic) && (
          <div className="modal-section">
            <div className="section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              热点摘要
            </div>
            <p className="modal-summary">{ds(topic)}</p>
            {topic.summary_zh && topic.summary && topic.summary_zh !== topic.summary && (
              <details className="original-text">
                <summary>查看英文原文</summary>
                <p>{topic.summary}</p>
              </details>
            )}
          </div>
        )}

        <div className="modal-tags-row">
          {topic.sentiment_tags?.length > 0 && (
            <div className="tag-group">
              <span className="tag-group-label">情绪</span>
              <div className="tag-group-items">
                {topic.sentiment_tags.map(s => {
                  const m = SENTIMENT_META[s]
                  if (!m) return null
                  return <span key={s} className="chip chip-sentiment lg" style={{ '--cc': m.color }}>{m.label}</span>
                })}
              </div>
            </div>
          )}
          {topic.recommended_genres?.length > 0 && (
            <div className="tag-group">
              <span className="tag-group-label">推荐类型</span>
              <div className="tag-group-items">
                {topic.recommended_genres.map(g => (
                  <span key={g} className="chip chip-genre lg">{GENRE_META[g] || g}</span>
                ))}
              </div>
            </div>
          )}
          {topic.keywords?.length > 0 && (
            <div className="tag-group">
              <span className="tag-group-label">关键词</span>
              <div className="tag-group-items">
                {topic.keywords.slice(0, 8).map((k, i) => (
                  <span key={i} className="chip chip-keyword">{k}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {topic.ad_angles?.length > 0 && (
          <div className="modal-section">
            <div className="section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6L12 2z" fill="currentColor"/>
              </svg>
              广告创意角度
              <span className="section-count">{topic.ad_angles.length}</span>
            </div>

            {topic.ad_angles.map((a, i) => (
              <div key={i} className="angle-card">
                <div className="angle-top">
                  <span className="angle-template">
                    {TEMPLATE_META[a.angle_type]?.label || a.angle_type}
                  </span>
                  {a.suggested_genre && (
                    <span className="angle-genre">{GENRE_META[a.suggested_genre] || a.suggested_genre}</span>
                  )}
                </div>
                <h5 className="angle-title">{da(a)}</h5>
                {a.description && <p className="angle-desc">{a.description}</p>}

                {dh(a) && (
                  <div className="hook-box">
                    <div className="hook-label">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M8 5v14l11-7z" fill="currentColor"/>
                      </svg>
                      前3秒 Hook 脚本
                    </div>
                    <p className="hook-text">{dh(a)}</p>
                  </div>
                )}

                <div className="angle-meta">
                  {a.target_audience && (
                    <div className="angle-meta-item">
                      <span className="meta-label">目标玩家</span>
                      <span className="meta-val">{a.target_audience}</span>
                    </div>
                  )}
                  {a.example_reference && (
                    <div className="angle-meta-item">
                      <span className="meta-label">参考案例</span>
                      <span className="meta-val">{a.example_reference}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {topic.source_url && (
          <a href={topic.source_url} target="_blank" rel="noreferrer" className="modal-source-link">
            查看原文
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M7 17L17 7M17 7H8M17 7v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

// ============ 统计卡片 ============
function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card" style={{ '--sc': color }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-value" style={{ color }}>{value}</div>
        <div className="stat-name">{label}</div>
      </div>
    </div>
  )
}

// ============ 主组件 ============
function App() {
  const [activeTab, setActiveTab] = useState('overall')
  const [rankings, setRankings] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [stats, setStats] = useState(null)
  const [status, setStatus] = useState(null)
  const [platformCounts, setPlatformCounts] = useState({})
  const [sortBy, setSortBy] = useState('heat_score')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)
  const statusTimerRef = useRef(null)

  // 加载排行数据
  const loadRankings = useCallback(async (tab = activeTab, showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/rankings/${tab}`, {
        params: { limit: 100, sort_by: sortBy }
      })
      setRankings(res.data.rankings || [])
      setPlatformCounts(prev => ({
        ...prev,
        [tab]: res.data.total || 0
      }))
    } catch (e) { console.error('加载排行失败', e) }
    setLoading(false)
  }, [activeTab, sortBy])

  // 加载状态和统计
  const loadStatus = useCallback(async () => {
    try {
      const [statsRes, statusRes] = await Promise.all([
        axios.get(`${API_BASE}/stats`),
        axios.get(`${API_BASE}/status`),
      ])
      setStats(statsRes.data)
      setStatus(statusRes.data)
    } catch (e) { console.error('加载状态失败', e) }
  }, [])

  // 初始加载
  useEffect(() => {
    loadRankings('overall', true)
    loadStatus()
  }, [])

  // 定时刷新状态（倒计时）
  useEffect(() => {
    statusTimerRef.current = setInterval(() => {
      loadStatus()
    }, 5000)
    return () => clearInterval(statusTimerRef.current)
  }, [loadStatus])

  // 切换Tab
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setSortBy('heat_score')
    loadRankings(tab, true)
  }

  // 手动刷新
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await axios.post(`${API_BASE}/refresh`)
      await Promise.all([loadRankings(activeTab, false), loadStatus()])
    } catch (e) { console.error(e) }
    setRefreshing(false)
  }

  // 排序变化
  const handleSortChange = (val) => {
    setSortBy(val)
    loadRankings(activeTab, true)
  }

  // 搜索过滤
  const filteredRankings = useMemo(() => {
    if (!searchKeyword) return rankings
    const kw = searchKeyword.toLowerCase()
    return rankings.filter(t => {
      const hay = [t.title, t.summary, t.title_zh, t.summary_zh, ...(t.keywords || [])].join(' ').toLowerCase()
      return hay.includes(kw)
    })
  }, [rankings, searchKeyword])

  const activeTabMeta = PLATFORM_TABS.find(t => t.key === activeTab) || PLATFORM_TABS[0]

  return (
    <div className="app">
      {/* ===== 左侧平台导航 ===== */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M6 9h12v6H6z" fill="#00B894"/>
              <circle cx="8" cy="12" r="1.5" fill="#0a0e14"/>
              <circle cx="16" cy="12" r="1.5" fill="#0a0e14"/>
              <path d="M11 12h2" stroke="#0a0e14" strokeWidth="1.5"/>
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-name">GameAd</div>
            <div className="brand-sub">Insight</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {PLATFORM_TABS.map(tab => (
            <button
              key={tab.key}
              className={`nav-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
              style={activeTab === tab.key ? { '--nav-color': tab.color } : {}}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
              {platformCounts[tab.key] > 0 && (
                <span className="nav-badge">{platformCounts[tab.key]}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            {status?.groq_enabled ? (
              <span className="status-dot ok" title="AI分析已启用">AI</span>
            ) : (
              <span className="status-dot warn" title="使用规则引擎">规则</span>
            )}
            <div className="ss-dots">
              {Object.entries(SOURCE_META).map(([k, v]) => (
                <span key={k} className="ss-dot" style={{ background: v.color }} title={v.label} />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ===== 主区域 ===== */}
      <main className="main-area">
        {/* 顶栏 */}
        <header className="topbar">
          <div className="topbar-left">
            <span className="tab-icon-lg">{activeTabMeta.icon}</span>
            <div>
              <h1 className="page-title">{activeTabMeta.label}</h1>
              <span className="page-sub">
                {filteredRankings.length} 条热点
                {activeTab === 'overall' && ' · 跨平台综合'}
              </span>
            </div>
          </div>

          <div className="topbar-right">
            {/* 实时状态 */}
            {status && (
              <div className="live-status">
                <span className={`live-dot ${status.seconds_until_refresh < 60 ? 'urgent' : ''}`} />
                <span className="live-text">
                  {status.seconds_until_refresh < 60 ? '即将刷新' : `${countdownFmt(status.seconds_until_refresh)}后自动更新`}
                </span>
              </div>
            )}

            <div className={`search-box ${searchOpen ? 'open' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="search-icon">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="搜索热点..."
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => !searchKeyword && setSearchOpen(false)}
              />
            </div>

            <select className="sort-select" value={sortBy} onChange={e => handleSortChange(e.target.value)}>
              <option value="heat_score">按热度</option>
              <option value="creative_index">按创意指数</option>
              <option value="ad_relevance">按广告相关度</option>
              <option value="velocity_score">按传播速度</option>
            </select>

            <button className="refresh-button" onClick={handleRefresh} disabled={refreshing}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={refreshing ? 'spin' : ''}>
                <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>{refreshing ? '刷新中' : '刷新'}</span>
            </button>
          </div>
        </header>

        {/* 统计卡片 */}
        {stats && (
          <div className="stat-row">
            <StatCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#00B894" strokeWidth="2"/></svg>}
              value={stats.total_topics || 0}
              label="总热点数"
              color="#00B894"
            />
            <StatCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" stroke="#FECA57" strokeWidth="2"/></svg>}
              value={stats.avg_ad_relevance?.toFixed(1) || '-'}
              label="平均广告相关度"
              color="#FECA57"
            />
            <StatCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#74B9FF" strokeWidth="2"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" stroke="#74B9FF" strokeWidth="2"/></svg>}
              value={Object.values(stats.by_source || {}).reduce((a, b) => a + b, 0) || 0}
              label="已抓取来源"
              color="#74B9FF"
            />
            <StatCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#A29BFE" strokeWidth="2"/></svg>}
              value={status?.seconds_until_refresh != null ? countdownFmt(status.seconds_until_refresh) : '—'}
              label="距下次自动刷新"
              color="#A29BFE"
            />
          </div>
        )}

        {/* 排行榜列表 */}
        <div className="content-area">
          {loading && (
            <div className="state-loading">
              <div className="loader-ring" />
              <p>正在加载 {activeTabMeta.label} 热点排行...</p>
            </div>
          )}

          {!loading && filteredRankings.length === 0 && (
            <div className="state-empty">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" opacity="0.3">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <p>暂无热点数据</p>
              <span>点击右上角"刷新"重新抓取</span>
            </div>
          )}

          {!loading && filteredRankings.length > 0 && (
            <div className="rankings-list">
              {filteredRankings.map((t, i) => (
                <RankCard
                  key={t.id}
                  topic={t}
                  rank={i + 1}
                  onClick={setSelectedTopic}
                  platform={activeTab}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 详情弹窗 */}
      <DetailModal topic={selectedTopic} onClose={() => setSelectedTopic(null)} />
    </div>
  )
}

export default App
