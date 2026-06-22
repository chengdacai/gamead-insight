import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const API_BASE = window.location.hostname === 'localhost' ? '/api' : '/api'

const ALERT_COLORS = { critical: '#ff5c72', warning: '#ff9f43', info: '#4f8cff', none: '#556076' }

export default function AppDetail() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/appstore/app/${appId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => navigate('/appstore'))
      .finally(() => setLoading(false))
  }, [appId])

  if (loading) return <div className="empty-state"><div className="empty-icon">⬡</div><div className="empty-text-zh">加载中...</div><div className="empty-text-en">Loading...</div></div>
  if (!data) return null

  const { app, creative_ideas } = data

  // Previous rank
  let rankChange = null
  const rankChg = app.changes?.find(c => c.type === 'rank_change')
  if (rankChg) {
    const delta = rankChg.rank_delta
    rankChange = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '—'
  }

  return (
    <div>
      {/* Back button */}
      <button className="btn small" onClick={() => navigate('/appstore')} style={{marginBottom:20}}>
        ← 返回榜单 / Back to Rankings
      </button>

      {/* App Header */}
      <div className="detail-header">
        <div className="detail-icon">
          {app.icon_url
            ? <img src={app.icon_url} alt={app.name} />
            : <div className="app-icon-placeholder" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32}}>📱</div>
          }
        </div>
        <div className="detail-info">
          <div className="detail-name">{app.name} <span style={{fontSize:14,color:'var(--text-muted)',fontFamily:'var(--font-en)'}}>#{app.rank}</span></div>
          <div className="detail-dev">{app.developer} · v{app.version} · {app.category || 'Utilities'}</div>
          <div className="detail-stats">
            <div className="detail-stat">
              <div className="detail-stat-val" style={{color: app.rating >= 4.5 ? 'var(--green)' : app.rating >= 4.0 ? 'var(--accent)' : 'var(--orange)'}}>{app.rating.toFixed(1)}</div>
              <div className="detail-stat-label">评分 / Rating</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-val">{(app.rating_count / 1000).toFixed(0)}k</div>
              <div className="detail-stat-label">评价数 / Reviews</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-val" style={{color: rankChange?.startsWith('↑') ? 'var(--green)' : rankChange?.startsWith('↓') ? 'var(--red)' : 'var(--text-muted)'}}>{rankChange || '—'}</div>
              <div className="detail-stat-label">排名变动 / Rank Δ</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-val">${app.price?.toFixed(2) || '0'}</div>
              <div className="detail-stat-label">价格 / Price</div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts / Changes */}
      {app.changes?.length > 0 && (
        <div className="card" style={{marginBottom:24, borderColor: ALERT_COLORS[app.alert_level] || 'var(--border-glass)'}}>
          <div className="card-header">
            <div>
              <div className="card-title-zh">变更提醒 / Change Alerts</div>
            </div>
            <span className={`card-badge ${app.alert_level}`}>{app.alert_level.toUpperCase()}</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {app.changes.map((chg, i) => (
              <div key={i} style={{padding:'12px 16px',background:'rgba(255,255,255,0.02)',borderRadius:10,border:'1px solid var(--border-glass)'}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>
                  <span className={`change-tag ${chg.type === 'version_update' ? 'critical' : chg.type === 'screenshot_change' ? 'warning' : chg.type === 'new_entry' ? 'new' : 'info'}`} style={{marginRight:8}}>{chg.label_zh}</span>
                  <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-en)'}}>{chg.label_en}</span>
                </div>
                <div style={{fontSize:12,color:'var(--text-secondary)'}}>{chg.detail_zh}</div>
                <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-en)'}}>{chg.detail_en}</div>
                {(chg.old_value !== undefined && chg.new_value !== undefined) && (
                  <div style={{display:'flex',gap:16,marginTop:8}}>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(255,92,114,0.1)',color:'var(--red)'}}>旧 / Old: {chg.old_value}</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'rgba(0,214,143,0.1)',color:'var(--green)'}}>新 / New: {chg.new_value}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Screenshots */}
      {app.screenshots?.length > 0 && (
        <div className="card" style={{marginBottom:24}}>
          <div className="card-header">
            <div>
              <div className="card-title-zh">商店截图 / Store Screenshots</div>
            </div>
            <span className="card-badge info">{app.screenshots.length} 张</span>
          </div>
          <div className="screenshots-row">
            {app.screenshots.map((url, i) => (
              <div key={i} className="screenshot-thumb">
                <img src={url} alt={`Screenshot ${i+1}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creative Ideas */}
      {creative_ideas?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title-zh">广告创意思路 / Creative Ideas</div>
              <div className="card-title-en">AI-generated for this app</div>
            </div>
          </div>
          <div className="creative-grid" style={{gridTemplateColumns:'1fr'}}>
            {creative_ideas.map((idea, i) => (
              <div key={i} className="creative-card">
                <div className="creative-header">
                  <div>
                    <div className="creative-name-zh">{idea.name_zh}</div>
                    <div className="creative-name-en">{idea.name_en}</div>
                  </div>
                  <div className="creative-score">{Math.round(idea.relevance_score * 100)}%</div>
                </div>
                <div className="creative-desc" style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{color:'var(--accent)',fontSize:13,fontWeight:600}}>{idea.specific_idea_zh}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-en)'}}>{idea.specific_idea_en}</div>
                </div>
                <div className="creative-hooks">
                  {idea.hooks_zh.map((h, j) => (
                    <span key={j} className="hook-chip">{h}</span>
                  ))}
                  {idea.hooks_en.slice(0, 1).map((h, j) => (
                    <span key={`en${j}`} className="hook-chip" style={{fontSize:10,opacity:0.7}}>{h}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
