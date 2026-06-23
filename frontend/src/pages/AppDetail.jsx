import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const API_BASE = window.location.hostname === 'localhost' ? '/api' : '/api'

const ALERT_COLORS = { critical: '#ff5c72', warning: '#ff9f43', info: '#4f8cff', none: '#556076' }

export default function AppDetail() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 广告素材相关状态
  const [adData, setAdData] = useState(null)
  const [adsLoading, setAdsLoading] = useState(true)
  const [activeVideo, setActiveVideo] = useState(null) // 当前播放的视频广告

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`${API_BASE}/appstore/app/${appId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        if (!d || !d.app) throw new Error('App 数据为空')
        setData(d)
      })
      .catch(err => {
        console.error('[AppDetail] 加载失败:', err)
        setError(err.message || '加载失败')
      })
      .finally(() => setLoading(false))

    // 同时加载广告素材
    setAdsLoading(true)
    setAdData(null)
    fetch(`${API_BASE}/appstore/app/${appId}/ads`)
      .then(r => r.json())
      .then(d => setAdData(d))
      .catch(err => console.error('[AppDetail] 广告加载失败:', err))
      .finally(() => setAdsLoading(false))
  }, [appId])

  if (loading) return <div className="empty-state"><div className="empty-icon">⬡</div><div className="empty-text-zh">加载中...</div><div className="empty-text-en">Loading app details...</div></div>
  if (error || !data) return (
    <div className="empty-state" style={{padding: '60px 20px'}}>
      <div className="empty-icon" style={{fontSize:48}}>⚠️</div>
      <div className="empty-text-zh" style={{marginTop:16}}>无法加载 App 详情</div>
      <div className="empty-text-en">{error || '未知错误'} · ID: {appId}</div>
      <button className="btn small" onClick={() => navigate('/appstore')} style={{marginTop:20}}>
        ← 返回榜单 / Back to Rankings
      </button>
    </div>
  )

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

      {/* Ad Video Materials - 视频广告素材 */}
      <div className="card" style={{marginBottom:24}}>
        <div className="card-header">
          <div>
            <div className="card-title-zh">
              视频广告素材 / Ad Creative Videos
              {adData && !adsLoading && (
                <span style={{fontSize:11, marginLeft:8, color: adData.is_real_ads ? 'var(--green)' : 'var(--orange)'}}>
                  {adData.is_real_ads ? '(真实数据 / Real Data)' : '(截图预览 / Screenshot Preview)'}
                </span>
              )}
            </div>
            <div className="card-title-en">
              {adData?.app_name || app.name} — {adData?.total || 0} 条广告
            </div>
          </div>
          {!adData?.is_real_ads && !adData?.api_configured && !adsLoading && (
            <div className="card-badge warning" style={{maxWidth:200, textAlign:'right', lineHeight:1.4}}>
              申请 Meta API Token 获取真实视频广告
            </div>
          )}
        </div>

        {adsLoading ? (
          <div style={{textAlign:'center',padding:'30px 0',color:'var(--text-muted)'}}>
            ⬡ 加载广告素材中... / Loading ads...
          </div>
        ) : !adData || adData.total === 0 ? (
          <div style={{textAlign:'center',padding:'30px 0',color:'var(--text-muted)',lineHeight:1.8}}>
            <div>暂无广告素材 / No ad creatives available</div>
            {!adData?.api_configured && (
              <div style={{marginTop:12, fontSize:12, maxWidth:500, margin:'12px auto 0', textAlign:'left', background:'rgba(255,159,67,0.08)', padding:16, borderRadius:12, border:'1px solid rgba(255,159,67,0.2)'}}>
                <div style={{fontWeight:700, color:'var(--orange)', marginBottom:8}}>
                  💡 如何获取真实视频广告？
                </div>
                <div style={{fontSize:11, color:'var(--text-secondary)'}}>
                  1. 访问 <a href="https://www.facebook.com/ads/library/api/" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>Meta Ad Library API</a> 申请免费 Token（审核约5-10天）<br/>
                  2. 在项目 <code style={{background:'rgba(255,255,255,0.1)', padding:'2px 6px', borderRadius:4}}>.env</code> 中配置：<code style={{background:'rgba(255,255,255,0.1)', padding:'2px 6px', borderRadius:4}}>META_AD_API_TOKEN=你的Token</code><br/>
                  3. 重新部署后即可显示真实广告视频
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="ad-video-grid">
            {adData.ads.map((ad, i) => (
              <div
                key={ad.ad_id || i}
                className="ad-video-card"
                onClick={() => {
                  if (ad.video_url || ad.snapshot_url) {
                    setActiveVideo(ad)
                  }
                }}
                style={{cursor: (ad.video_url || ad.snapshot_url) ? 'pointer' : 'default'}}
              >
                {/* 缩略图 */}
                <div className="ad-video-thumb">
                  {ad.thumbnail_url ? (
                    <img src={ad.thumbnail_url} alt={ad.title} />
                  ) : (
                    <div className="app-icon-placeholder">🎬</div>
                  )}
                  <div className="ad-play-btn">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="16" fill="rgba(0,0,0,0.6)"/>
                      <path d="M12 10l10 6-10 6V10z" fill="white"/>
                    </svg>
                  </div>
                  {ad.creative_type === 'VIDEO' && (
                    <span className="ad-type-badge">VIDEO</span>
                  )}
                </div>
                {/* 信息 */}
                <div className="ad-video-info">
                  <div className="ad-video-title" title={ad.title}>{ad.title}</div>
                  <div className="ad-video-platforms">
                    {ad.platforms_zh?.map((p, j) => (
                      <span key={j} className="platform-chip">{p}</span>
                    ))}
                    {(!ad.platforms_zh || ad.platforms_zh.length === 0) && (
                      <span className="platform-chip">App Store</span>
                    )}
                  </div>
                  {ad.first_seen && (
                    <div className="ad-video-date">
                      {ad.first_seen?.slice(0, 10)} ~ {ad.last_seen === '投放中' ? '投放中' : ad.last_seen?.slice(0, 10)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      {activeVideo && (
        <div className="video-modal-overlay" onClick={() => setActiveVideo(null)}>
          <div className="video-modal" onClick={e => e.stopPropagation()}>
            <div className="video-modal-header">
              <div className="video-modal-title">{activeVideo.title}</div>
              <button className="video-modal-close" onClick={() => setActiveVideo(null)}>✕</button>
            </div>
            <div className="video-modal-body">
              {activeVideo.video_url ? (
                <video
                  controls
                  autoPlay
                  style={{width:'100%', maxHeight:'60vh', borderRadius:8, background:'#000'}}
                  src={activeVideo.video_url}
                  poster={activeVideo.thumbnail_url}
                >
                  您的浏览器不支持视频播放 / Your browser does not support video playback
                </video>
              ) : activeVideo.snapshot_url ? (
                <img
                  src={activeVideo.snapshot_url}
                  alt={activeVideo.title}
                  style={{width:'100%', maxHeight:'60vh', objectFit:'contain', borderRadius:8}}
                />
              ) : null}
            </div>
            <div className="video-modal-footer">
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeVideo.body_en || activeVideo.title_en || ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {activeVideo.platforms_zh?.join(' · ') || 'App Store'} · {activeVideo.first_seen?.slice(0, 10) || ''}
              </div>
            </div>
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
