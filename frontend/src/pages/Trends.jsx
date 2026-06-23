import { useState, useEffect } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

const API_BASE = '/api'

const PLATFORM_COLORS = {
  reddit_hot: '#FF4500', twitter_trend: '#1DA1F2', tiktok_trend: '#FF0050',
  google_trends: '#4285F4', pop_culture_ip: '#E84393', seasonal_event: '#FDCB6E'
}
const PLATFORM_LABELS = {
  reddit_hot: { zh: 'Reddit 热帖', en: 'Reddit Hot' },
  twitter_trend: { zh: 'X/Twitter 趋势', en: 'X Trends' },
  tiktok_trend: { zh: 'TikTok 趋势', en: 'TikTok Trends' },
  google_trends: { zh: 'Google 趋势', en: 'Google Trends' },
  pop_culture_ip: { zh: '流行文化IP', en: 'Pop Culture' },
  seasonal_event: { zh: '节日营销', en: 'Seasonal Events' },
}

export default function Trends() {
  const [topics, setTopics] = useState([])
  const [platform, setPlatform] = useState('overall')
  const [sortBy, setSortBy] = useState('heat_score')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [platforms, setPlatforms] = useState({})

  const fetchData = () => {
    setLoading(true)
    setError(null)
    const url = platform === 'overall'
      ? `${API_BASE}/rankings?limit=50&sort_by=${sortBy}`
      : `${API_BASE}/rankings/${platform}?limit=50&sort_by=${sortBy}`
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => setTopics(d.rankings || d.topics || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetch(`${API_BASE}/platforms`)
      .then(r => r.json())
      .then(d => setPlatforms(d.platforms || {}))
      .catch(() => {})
  }, [])

  useEffect(() => { fetchData() }, [platform, sortBy])

  // Radar chart data for source distribution
  const radarData = Object.entries(platforms)
    .filter(([k]) => k !== 'overall' && k !== 'app_store')
    .map(([k, v]) => ({
      platform: PLATFORM_LABELS[k]?.zh || k,
      count: v.count || 0,
      full: 100
    }))

  // Top topics bar chart
  const topTopicData = topics.slice(0, 10).map(t => ({
    name: (t.title?.length > 18 ? t.title.slice(0,17)+'…' : t.title) || 'N/A',
    heat: t.heat_score || 0,
    creative: t.creative_index || 0,
    fill: PLATFORM_COLORS[t.source] || '#4f8cff'
  }))

  return (
    <div>
      {/* Platform Distribution Chart */}
      <div className="charts-row">
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <div className="card-title-zh">平台热点分布 / Platform Distribution</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="platform" tick={{fontSize:11}} />
              <PolarRadiusAxis tick={false} axisLine={false} />
              <Radar dataKey="count" stroke="#4f8cff" fill="#4f8cff" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <div>
              <div className="card-title-zh">Top 10 热点排行 / Hot Topics</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topTopicData} layout="vertical" margin={{left: 120}}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={110} tick={{fontSize:10}} />
              <Tooltip />
              <Bar dataKey="heat" radius={[0, 6, 6, 0]} barSize={14}>
                {topTopicData.map((entry, i) => (
                  <rect key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter & Sort */}
      <div className="filter-row">
        <div className="filter-left">
          <span className="filter-label">平台 / Platform:</span>
          <div className="tab-bar" style={{marginBottom:0}}>
            {Object.entries(platforms).filter(([k]) => k !== 'app_store').map(([k, v]) => (
              <button key={k} className={`tab-btn ${platform === k ? 'active' : ''}`} onClick={() => setPlatform(k)}>
                <span style={{marginRight:6}}>{v.icon || ''}</span>
                {k === 'overall' ? '全部 / All' : PLATFORM_LABELS[k]?.zh || k}
                <span style={{fontSize:9,marginLeft:4,opacity:0.6}}>({v.count})</span>
              </button>
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
            <option value="heat_score">按热度 / By Heat</option>
            <option value="creative_index">按创意指数 / By Creative</option>
            <option value="ad_relevance">按广告相关度 / By Relevance</option>
            <option value="velocity_score">按传播速度 / By Velocity</option>
          </select>
        </div>
      </div>

      {/* Topics Grid */}
      {error ? (
        <div className="empty-state">
          <div className="empty-icon">⚠</div>
          <div className="empty-text-zh">数据加载失败</div>
          <div className="empty-text-en">Failed to load data</div>
          <div style={{fontSize:11,color:'var(--text-muted)',margin:'8px 0'}}>{error}</div>
          <button className="btn primary small" onClick={fetchData} style={{marginTop:12}}>
            重试 / Retry
          </button>
        </div>
      ) : loading ? (
        <div className="empty-state"><div className="empty-icon">✦</div><div className="empty-text-zh">加载中...</div><div className="empty-text-en">Loading...</div></div>
      ) : topics.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">✦</div><div className="empty-text-zh">暂无数据</div><div className="empty-text-en">No data available</div></div>
      ) : (
        <div className="trends-grid">
          {topics.slice(0, 30).map(topic => (
            <div key={topic.id} className="trend-card">
              <span className={`trend-platform ${topic.source?.replace('_hot','').replace('_trend','').replace('_ip','').replace('_event','')}`}>
                {PLATFORM_LABELS[topic.source]?.zh || topic.source}
              </span>
              <div className="trend-title">{topic.title}</div>
              {topic.summary && <div className="trend-summary">{topic.summary.slice(0, 120)}{topic.summary.length > 120 ? '...' : ''}</div>}
              <div className="trend-heat">
                <div className="heat-bar">
                  <div className="heat-fill" style={{
                    width: `${topic.heat_score || 0}%`,
                    background: `linear-gradient(90deg, ${PLATFORM_COLORS[topic.source] || '#4f8cff'}, ${PLATFORM_COLORS[topic.source] || '#4f8cff'}88)`
                  }}></div>
                </div>
                <span style={{fontSize:11,fontWeight:700,fontFamily:'var(--font-en)',color: PLATFORM_COLORS[topic.source] || 'var(--accent)'}}>
                  {topic.heat_score?.toFixed(0) || 0}°
                </span>
              </div>
              {/* Ad Angles */}
              {topic.ad_angles?.length > 0 && (
                <div className="trend-ideas">
                  {topic.ad_angles.slice(0, 3).map((angle, i) => (
                    <div key={i} className="trend-idea-item">
                      <span>
                        <strong>{angle.headline || angle.angle_type || '创意'}</strong>
                        <span style={{fontSize:10,color:'var(--text-muted)',marginLeft:6}}>
                          {angle.suggested_format || ''}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Metrics */}
              <div style={{display:'flex',gap:16,marginTop:10}}>
                <span style={{fontSize:10,color:'var(--text-muted)'}}>
                  创意/Creative: <strong style={{color:'var(--accent)'}}>{topic.creative_index?.toFixed(0) || 'N/A'}</strong>
                </span>
                <span style={{fontSize:10,color:'var(--text-muted)'}}>
                  相关/Rel: <strong style={{color:'var(--green)'}}>{topic.ad_relevance?.toFixed(1) || 'N/A'}</strong>
                </span>
                {topic.region && topic.region !== 'global' && (
                  <span style={{fontSize:10,color:'var(--text-muted)'}}>
                    地区: {topic.region}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
