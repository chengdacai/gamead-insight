import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts'

const API_BASE = '/api'

const PLATFORM_COLORS = {
  reddit_hot: '#FF4500', twitter_trend: '#1DA1F2', tiktok_trend: '#FF0050',
  google_trends: '#4285F4', pop_culture_ip: '#E84393', seasonal_event: '#FDCB6E'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [appstore, setAppstore] = useState(null)
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`${API_BASE}/stats`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch(`${API_BASE}/appstore/top20`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch(`${API_BASE}/appstore/changes`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
    ]).then(([s, a, c]) => {
      setStats(s)
      setAppstore(a)
      setChanges(c.changes?.filter(x => x.has_changes) || [])
    }).catch(err => setError(err.message)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  if (error) return (
    <div className="empty-state">
      <div className="empty-icon">⚠</div>
      <div className="empty-text-zh">数据加载失败</div>
      <div className="empty-text-en">Failed to load data</div>
      <div style={{fontSize:11,color:'var(--text-muted)',margin:'8px 0'}}>{error}</div>
      <button className="btn primary small" onClick={fetchData} style={{marginTop:12}}>
        重试 / Retry
      </button>
    </div>
  )

  if (loading) return <div className="empty-state"><div className="empty-icon">◆</div><div className="empty-text-zh">加载中...</div><div className="empty-text-en">Loading...</div></div>

  const srcData = stats?.by_source
    ? Object.entries(stats.by_source).filter(([k]) => k !== 'app_store').map(([k, v]) => ({ name: k, value: v, fill: PLATFORM_COLORS[k] || '#4f8cff' }))
    : []

  const topApps = appstore?.apps?.slice(0, 5).map(a => ({ name: a.name.length > 12 ? a.name.slice(0,12)+'...' : a.name, rating: a.rating, change: a.has_changes })) || []

  return (
    <div>
      {/* Alert Banner */}
      {changes.length > 0 && (
        <div className="alerts-panel" onClick={() => navigate('/appstore')} style={{cursor:'pointer'}}>
          <div className="alert-title">
            ⚠ {changes.length} 款 App 发生变化 / {changes.length} Apps Changed
            <span style={{fontSize:11,fontWeight:400,marginLeft:8}}>点击查看详情 / Click to view</span>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {changes.slice(0, 5).map((c, i) => (
              <span key={i} className="alert-item">
                <span className={`alert-dot ${c.alert_level}`}></span>
                {c.name}
              </span>
            ))}
            {changes.length > 5 && <span className="alert-item" style={{color:'var(--text-muted)'}}>+{changes.length - 5} 更多 / more</span>}
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value green">{stats?.total_topics || 0}</div>
          <div className="stat-label-zh">实时热点 / Real-time Topics</div>
          <div className="stat-label-en">hot topics tracked</div>
          <div className="stat-sub">📊 多平台聚合 / Multi-platform</div>
        </div>
        <div className="stat-card">
          <div className="stat-value blue">{appstore?.total || 0}</div>
          <div className="stat-label-zh">App Store 监控 / Monitored Apps</div>
          <div className="stat-label-en">tools category top 20</div>
          <div className="stat-sub">📱 工具类榜单 / Utilities</div>
        </div>
        <div className="stat-card" onClick={() => navigate('/appstore')} style={{cursor:'pointer'}}>
          <div className="stat-value orange">{appstore?.has_changes_count || 0}</div>
          <div className="stat-label-zh">发现变更 / Changes Detected</div>
          <div className="stat-label-en">version & screenshot updates</div>
          <div className="stat-sub">🔄 点此查看 / View details →</div>
        </div>
        <div className="stat-card">
          <div className="stat-value purple">{stats?.total_favorites || 0}</div>
          <div className="stat-label-zh">灵感收藏 / Saved Ideas</div>
          <div className="stat-label-en">creative inspirations</div>
          <div className="stat-sub">💡 广告灵感库 / Ad Library</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <div className="card-title-zh">热点来源分布 / Source Distribution</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={srcData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3}>
                {srcData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <div>
              <div className="card-title-zh">Top 5 工具类 App 评分 / Top Tools Rating</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topApps} layout="vertical" margin={{left: 80}}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[3.5, 5]} />
              <YAxis type="category" dataKey="name" width={90} tick={{fontSize:11}} />
              <Tooltip />
              <Bar dataKey="rating" fill="#4f8cff" radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Navigation */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:16}}>
        <div className="card" onClick={() => navigate('/appstore')} style={{cursor:'pointer'}}>
          <div className="card-header">
            <div>
              <div className="card-title-zh">App Store 榜单监控</div>
              <div className="card-title-en">App Store Monitor</div>
            </div>
            <span>→</span>
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>
            Top 20 工具类应用实时追踪 / 版本变更 / 截图更新 / 排名变动<br/>
            <span style={{color:'var(--accent)',fontSize:11}}>Top 20 utilities real-time tracking with change alerts</span>
          </div>
        </div>
        <div className="card" onClick={() => navigate('/trends')} style={{cursor:'pointer'}}>
          <div className="card-header">
            <div>
              <div className="card-title-zh">社媒热点 & 广告灵感</div>
              <div className="card-title-en">Social Trends & Ideas</div>
            </div>
            <span>→</span>
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>
            网络爆梗 / 节日热点 / 流行IP → 工具类APP广告创意思路<br/>
            <span style={{color:'var(--accent)',fontSize:11}}>Memes, holidays, pop culture → tools ad creative ideas</span>
          </div>
        </div>
        <div className="card" onClick={() => navigate('/creative')} style={{cursor:'pointer'}}>
          <div className="card-header">
            <div>
              <div className="card-title-zh">广告创意模板库</div>
              <div className="card-title-en">Creative Templates</div>
            </div>
            <span>→</span>
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>
            6大工具类广告模板 / 痛点解决 / 前后对比 / 效率秘籍<br/>
            <span style={{color:'var(--accent)',fontSize:11}}>6 ad templates for tools category apps</span>
          </div>
        </div>
      </div>
    </div>
  )
}
