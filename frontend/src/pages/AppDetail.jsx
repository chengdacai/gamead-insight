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

      {/* ========== 视频广告素材 / Video Ad Creatives ========== */}
      <div className="card" style={{marginBottom:24, borderColor: adData?.has_real_ads ? 'rgba(0,214,143,0.3)' : 'var(--border-glass)'}}>
        <div className="card-header">
          <div>
            <div className="card-title-zh">
              🎬 视频广告素材 / Video Ad Creatives
              {adData && !adsLoading && (
                <span style={{fontSize:11, marginLeft:8, color: adData.has_real_ads ? 'var(--green)' : 'var(--orange)'}}>
                  ({adData.total_video_ads} 条 / ads)
                </span>
              )}
            </div>
            <div className="card-title-en">
              {adData?.app_name || app.name}
              {adData?.ad_sources?.length > 0 && (
                <span style={{marginLeft:8, fontSize:10}}>
                  来源: {adData.ad_sources.map(s => s.name).join(' · ')}
                </span>
              )}
            </div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            {adData?.has_real_ads && (
              <span className="card-badge" style={{background:'rgba(0,214,143,0.12)', color:'var(--green)', border:'1px solid rgba(0,214,143,0.3)'}}>
                ✅ 真实广告
              </span>
            )}
            {!adData?.has_real_ads && !adData?.meta_token_configured && !adsLoading && (
              <span className="card-badge warning" style={{maxWidth:180, textAlign:'right', lineHeight:1.4, fontSize:10}}>
                配置 Meta Token 获取FB/IG真实广告
              </span>
            )}
          </div>
        </div>

        {adsLoading ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-muted)'}}>
            <div style={{fontSize:24, marginBottom:8}}>⬡</div>
            <div>加载广告素材中... / Loading ad creatives...</div>
          </div>
        ) : !adData || (adData.total_video_ads === 0 && adData.total_screenshots === 0) ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-muted)',lineHeight:1.8}}>
            <div style={{fontSize:32, marginBottom:8}}>📭</div>
            <div style={{fontWeight:600}}>暂无广告素材 / No ad creatives found</div>
            <div style={{fontSize:12, marginTop:4}}>该 App 暂无可播放的视频广告素材</div>
            {!adData?.meta_token_configured && (
              <div style={{marginTop:16, fontSize:12, maxWidth:520, margin:'16px auto 0', textAlign:'left', background:'rgba(79,140,255,0.08)', padding:20, borderRadius:12, border:'1px solid rgba(79,140,255,0.2)'}}>
                <div style={{fontWeight:700, color:'var(--accent)', marginBottom:12, fontSize:14}}>
                  💡 如何获取多平台真实视频广告？
                </div>
                <div style={{fontSize:12, color:'var(--text-secondary)', lineHeight:2}}>
                  1️⃣ 访问 <a href="https://www.facebook.com/ads/library/api/" target="_blank" rel="noreferrer" style={{color:'var(--accent)', fontWeight:600}}>Meta Ad Library API</a> 申请免费 Token（企业/个人均可，审核约5-10天）<br/>
                  2️⃣ 在项目根目录 <code style={{background:'rgba(255,255,255,0.08)', padding:'2px 8px', borderRadius:4, fontSize:11}}>.env</code> 中配置：<code style={{background:'rgba(0,214,143,0.12)', padding:'2px 8px', borderRadius:4, fontSize:11, color:'var(--green)'}}>META_AD_API_TOKEN=你的Token</code><br/>
                  3️⃣ 重新部署后即可显示 Facebook、Instagram 等平台的真实视频广告
                </div>
                <div style={{marginTop:12, padding:'8px 12px', background:'rgba(0,214,143,0.06)', borderRadius:8, fontSize:11, color:'var(--green)', border:'1px solid rgba(0,214,143,0.15)'}}>
                  📌 当前方案：Google Play 官方宣传视频已在下方独立展示（如有），可直接点击播放
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 视频广告卡片网格 */}
            {adData.video_ads?.length > 0 && (
              <div className="ad-video-grid">
                {adData.video_ads.map((ad, i) => (
                  <div
                    key={ad.ad_id || i}
                    className="ad-video-card"
                    onClick={() => {
                      // 🔗 外部链接（Google Ads透明度中心等）— 新标签页打开
                      if (ad.external_url && !ad.is_video && !ad.video_id && !ad.snapshot_url) {
                        window.open(ad.external_url, '_blank', 'noopener,noreferrer')
                        return
                      }
                      if (ad.is_video || ad.video_id || ad.video_url) setActiveVideo(ad)
                      else if (ad.snapshot_url) setActiveVideo(ad)
                      else if (ad.external_url) window.open(ad.external_url, '_blank', 'noopener,noreferrer')
                    }}
                    style={{
                      cursor: (ad.is_video || ad.snapshot_url || ad.external_url) ? 'pointer' : 'default',
                      borderColor: ad.platform_color ? `${ad.platform_color}40` : undefined,
                    }}
                  >
                    {/* 缩略图 */}
                    <div className="ad-video-thumb">
                      {ad.thumbnail_url ? (
                        <img src={ad.thumbnail_url} alt={ad.title_zh || ad.title_en} loading="lazy" />
                      ) : (
                        <div className="app-icon-placeholder" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <span style={{fontSize:28}}>{ad.creative_type === 'LINK' ? '🔍' : '🎬'}</span>
                        </div>
                      )}
                      {/* 播放按钮 — 只有可播放的视频才显示 */}
                      {(ad.is_video || ad.video_id || ad.video_url) && (
                        <div className="ad-play-btn">
                          <svg width="40" height="40" viewBox="0 0 36 36" fill="none">
                            <circle cx="18" cy="18" r="18" fill="rgba(0,0,0,0.7)"/>
                            <path d="M14 11l10 7-10 7V11z" fill="white"/>
                          </svg>
                        </div>
                      )}
                      {/* 外部链接按钮 — Google Ads等 */}
                      {ad.creative_type === 'LINK' && ad.external_url && !ad.is_video && (
                        <div className="ad-play-btn" style={{background:'rgba(52,168,83,0.15)'}}>
                          <svg width="40" height="40" viewBox="0 0 36 36" fill="none">
                            <circle cx="18" cy="18" r="18" fill="rgba(52,168,83,0.8)"/>
                            <path d="M14 12h10v10M24 12L12 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                      {/* 类型标签 */}
                      <span className="ad-type-badge" style={{
                        background: ad.creative_type === 'LINK'
                          ? 'rgba(52,168,83,0.85)'
                          : ad.is_video ? 'rgba(255,92,114,0.85)' : 'rgba(79,140,255,0.85)',
                      }}>
                        {ad.creative_type === 'LINK' ? '🔗 查看' : ad.is_video ? '▶ VIDEO' : '📷 IMAGE'}
                      </span>
                    </div>
                    {/* 信息区 */}
                    <div className="ad-video-info">
                      {/* 平台来源标签 — 醒目显示 */}
                      <div className="ad-source-row" style={{
                        display:'flex', alignItems:'center', gap:4, marginBottom:6,
                      }}>
                        <span style={{
                          fontSize:10, padding:'2px 8px', borderRadius:4,
                          background: ad.platform_color ? `${ad.platform_color}18` : 'rgba(255,255,255,0.06)',
                          color: ad.platform_color || 'var(--text-secondary)',
                          border: `1px solid ${ad.platform_color || 'var(--border-glass)'}40`,
                          fontWeight:600,
                        }}>
                          {ad.source_icon} {ad.platform_label_zh}
                        </span>
                      </div>
                      <div className="ad-video-title" title={ad.title_zh}>{ad.title_zh || ad.title_en}</div>
                      {ad.body_zh && (
                        <div className="ad-video-body" style={{fontSize:11, color:'var(--text-muted)', marginTop:4, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>
                          {ad.body_zh.slice(0, 120)}
                        </div>
                      )}
                      {ad.first_seen && (
                        <div className="ad-video-date" style={{marginTop:6, fontSize:10, color:'var(--text-muted)'}}>
                          📅 {ad.first_seen?.slice(0, 10)} ~ {ad.last_seen || '投放中'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 无视频广告但有截图时：提示用户 */}
            {(!adData.video_ads || adData.video_ads.length === 0) && adData.total_screenshots > 0 && (
              <div style={{textAlign:'center', padding:'30px 0', color:'var(--text-muted)', lineHeight:1.8}}>
                <div style={{fontSize:24, marginBottom:8}}>📱</div>
                <div style={{fontWeight:600}}>暂无可播放视频广告</div>
                <div style={{fontSize:12}}>下方展示的是商店截图（非广告素材）</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========== 商店截图预览 / Store Screenshots ========== */}
      {adData?.store_screenshots?.length > 0 && (
        <div className="card" style={{marginBottom:24, opacity: 0.85}}>
          <div className="card-header">
            <div>
              <div className="card-title-zh">
                📱 商店截图预览 / Store Screenshots
              </div>
              <div className="card-title-en">
                App Store + Google Play — {adData.total_screenshots} 张
              </div>
            </div>
            <span className="card-badge" style={{background:'rgba(255,255,255,0.05)'}}>
              仅供预览 / Preview Only
            </span>
          </div>
          <div className="screenshots-row" style={{padding: '8px 0'}}>
            {adData.store_screenshots.map((url, i) => (
              <div
                key={i}
                className="screenshot-thumb"
                onClick={() => setActiveVideo({
                  snapshot_url: url,
                  title_zh: `${app.name} 截图 #${i+1}`,
                  title_en: `${app.name} Screenshot #${i+1}`,
                  platform_label_zh: '商店截图',
                  platform_label_en: 'Store Screenshot',
                  body_zh: '商店预览截图，非广告素材',
                })}
                style={{cursor:'pointer'}}
              >
                <img src={url} alt={`Screenshot ${i+1}`} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== 视频播放模态框 / Video Player Modal ========== */}
      {activeVideo && (
        <div className="video-modal-overlay" onClick={() => setActiveVideo(null)}>
          <div className="video-modal" onClick={e => e.stopPropagation()}>
            <div className="video-modal-header">
              <div className="video-modal-title">
                {activeVideo.is_video || activeVideo.video_id ? '🎬 ' : '📱 '}
                {activeVideo.title_zh || activeVideo.title_en || activeVideo.title || '预览'}
              </div>
              <button className="video-modal-close" onClick={() => setActiveVideo(null)}>✕</button>
            </div>
            <div className="video-modal-body">
              {activeVideo.video_id ? (
                /* YouTube 嵌入播放 */
                <div style={{position:'relative', paddingBottom:'56.25%', height:0, background:'#000'}}>
                  <iframe
                    style={{position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none'}}
                    src={`https://www.youtube.com/embed/${activeVideo.video_id}?autoplay=1&rel=0&modestbranding=1`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    title={activeVideo.title_zh || activeVideo.title}
                  />
                </div>
              ) : activeVideo.video_url && !activeVideo.video_id ? (
                /* 直接视频URL播放 */
                <video
                  controls
                  autoPlay
                  style={{width:'100%', maxHeight:'65vh', borderRadius:'0 0 8px 8px', background:'#000'}}
                  src={activeVideo.video_url}
                  poster={activeVideo.thumbnail_url}
                >
                  您的浏览器不支持视频播放 / Browser does not support video playback
                </video>
              ) : activeVideo.snapshot_url ? (
                /* 截图图片展示 */
                <div style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0a0f', padding:20}}>
                  <img
                    src={activeVideo.snapshot_url}
                    alt={activeVideo.title_zh || activeVideo.title || 'Preview'}
                    style={{maxWidth:'100%', maxHeight:'70vh', objectFit:'contain', borderRadius:4}}
                  />
                </div>
              ) : (
                <div style={{padding:60, textAlign:'center', color:'var(--text-muted)'}}>
                  <div style={{fontSize:32, marginBottom:12}}>📭</div>
                  <div>暂无预览内容 / No preview available</div>
                </div>
              )}
            </div>
            <div className="video-modal-footer">
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                {activeVideo.platform_label_zh && (
                  <span style={{
                    fontSize:10, padding:'2px 8px', borderRadius:4,
                    background: activeVideo.platform_color ? `${activeVideo.platform_color}18` : 'rgba(255,255,255,0.08)',
                    color: activeVideo.platform_color || 'var(--text-secondary)',
                    border: `1px solid ${activeVideo.platform_color || 'var(--border-glass)'}40`,
                  }}>
                    {activeVideo.platform_label_zh}
                  </span>
                )}
                {activeVideo.creative_type_zh && (
                  <span style={{fontSize:10, color:'var(--text-muted)'}}>{activeVideo.creative_type_zh}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeVideo.body_zh || activeVideo.body || activeVideo.title_en || ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {activeVideo.source_label_zh || activeVideo.platform_label_zh || ''}
                {activeVideo.first_seen && ` · ${activeVideo.first_seen?.slice(0, 10)}`}
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
