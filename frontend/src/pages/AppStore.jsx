import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API_BASE = window.location.hostname === 'localhost' ? '/api' : '/api'

export default function AppStore() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [sortBy, setSortBy] = useState('rank')
  const [filter, setFilter] = useState('all') // all / changed / critical
  const [loading, setLoading] = useState(true)

  const fetchData = (sort) => {
    setLoading(true)
    fetch(`${API_BASE}/appstore/top20?sort_by=${sort}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData(sortBy) }, [sortBy])

  const filteredApps = data?.apps?.filter(a => {
    if (filter === 'changed') return a.has_changes
    if (filter === 'critical') return a.alert_level === 'critical'
    return true
  }) || []

  // Chart data
  const chartData = filteredApps.map(a => ({
    name: a.name.length > 15 ? a.name.slice(0, 14) + '…' : a.name,
    rating: a.rating,
    rank: a.rank,
    fill: a.has_changes ? (a.alert_level === 'critical' ? '#ff5c72' : '#ff9f43') : '#4f8cff'
  }))

  return (
    <div>
      {/* Stats Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value blue">{data?.total || 0}</div>
          <div className="stat-label-zh">榜单监控 / Monitored</div>
          <div className="stat-label-en">Top 20 utilities</div>
        </div>
        <div className="stat-card">
          <div className="stat-value red">{data?.critical_count || 0}</div>
          <div className="stat-label-zh">重要变更 / Critical</div>
          <div className="stat-label-en">Version updates</div>
        </div>
        <div className="stat-card">
          <div className="stat-value orange">{data?.warning_count || 0}</div>
          <div className="stat-label-zh">关注变更 / Warnings</div>
          <div className="stat-label-en">Screenshot/rating changes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value green">{data?.has_changes_count || 0}</div>
          <div className="stat-label-zh">总变更 / Total Changes</div>
          <div className="stat-label-en">All detected changes</div>
        </div>
      </div>

      {/* Rating Chart */}
      <div className="card chart-card" style={{marginBottom:24}}>
        <div className="card-header">
          <div>
            <div className="card-title-zh">评分概览 / Rating Overview</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{fontSize:10}} angle={-30} textAnchor="end" height={60} />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Bar dataKey="rating" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, i) => (
                <rect key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filter & Sort */}
      <div className="filter-row">
        <div className="filter-left">
          <span className="filter-label">筛选 / Filter:</span>
          <div className="tab-bar" style={{marginBottom:0}}>
            {[['all', '全部 / All'], ['changed', '有变更 / Changed'], ['critical', '重要 / Critical']].map(([k, v]) => (
              <button key={k} className={`tab-btn ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="filter-left">
          <span className="filter-label">排序 / Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-glass)',
              background: 'var(--bg-glass)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer'
            }}
          >
            <option value="rank">按排名 / By Rank</option>
            <option value="rating">按评分 / By Rating</option>
            <option value="changes">按变更数 / By Changes</option>
          </select>
        </div>
      </div>

      {/* App Cards Grid */}
      {loading ? (
        <div className="empty-state"><div className="empty-icon">⬡</div><div className="empty-text-zh">加载中...</div><div className="empty-text-en">Loading...</div></div>
      ) : (
        <div className="app-grid">
          {filteredApps.map(app => (
            <div
              key={app.app_id}
              className={`app-card ${app.alert_level === 'critical' ? 'alert-critical' : ''} ${app.alert_level === 'warning' ? 'alert-warning' : ''}`}
              onClick={() => navigate(`/appstore/${app.app_id}`)}
            >
              <div className="app-rank">#{app.rank}</div>
              <div className="app-card-row">
                <div className="app-icon">
                  {app.icon_url
                    ? <img src={app.icon_url} alt={app.name} />
                    : <div className="app-icon-placeholder">📱</div>
                  }
                </div>
                <div className="app-info">
                  <div className="app-name">{app.name}</div>
                  <div className="app-dev">{app.developer}</div>
                </div>
                <div className="score-ring" style={{
                  borderColor: app.rating >= 4.5 ? '#00d68f' : app.rating >= 4.0 ? '#4f8cff' : '#ff9f43',
                  color: app.rating >= 4.5 ? '#00d68f' : app.rating >= 4.0 ? '#4f8cff' : '#ff9f43'
                }}>
                  {app.rating.toFixed(1)}
                </div>
              </div>
              <div className="app-meta">
                <span>v{app.version}</span>
                <span>{(app.rating_count / 1000).toFixed(0)}k 评/reviews</span>
                {app.rank_previous !== app.rank && app.rank_previous && (
                  <span style={{color: app.rank < app.rank_previous ? 'var(--green)' : 'var(--red)'}}>
                    {app.rank < app.rank_previous ? '↑' : '↓'}{Math.abs(app.rank - app.rank_previous)}
                  </span>
                )}
              </div>
              {/* Change Tags */}
              {app.changes?.length > 0 && (
                <div className="app-change-bar">
                  {app.changes.map((chg, i) => (
                    <span key={i} className={`change-tag ${chg.type === 'version_update' ? 'critical' : chg.type === 'screenshot_change' ? 'warning' : chg.type === 'new_entry' ? 'new' : 'info'}`}>
                      {chg.label_zh}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
