import { useState, useEffect, useRef } from 'react'

const API_BASE = '/api'

export default function CompetitorWatch() {
  const [watchlist, setWatchlist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [monitorStatus, setMonitorStatus] = useState({})
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ wecom_corpid: '', wecom_agentid: 0, wecom_secret: '', wecom_webhooks: [], check_interval_hours: 1 })
  const [savingSettings, setSavingSettings] = useState(false)
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkResult, setCheckResult] = useState(null)
  const [testPushResult, setTestPushResult] = useState(null)
  const [addedMsg, setAddedMsg] = useState(null)  // 添加后的即时反馈
  const [expandedAlerts, setExpandedAlerts] = useState({})  // 展开的App新动态
  const [detailModal, setDetailModal] = useState(null)  // 详情弹窗（替代alert）
  const [actionError, setActionError] = useState(null)  // 操作错误反馈
  const addedMsgTimer = useRef(null)

  // 搜索
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchPlatform, setSearchPlatform] = useState('all')  // 'all' | 'app_store' | 'google_play'
  const [searchingDev, setSearchingDev] = useState(null)  // 当前正在搜哪个开发者（显示标签）
  const [webhookUrl, setWebhookUrl] = useState('')  // Webhook URL 输入框

  // ============ 数据加载 ============

  const loadWatchlist = async () => {
    try {
      setLoading(true)
      setError(null)
      const r = await fetch(`${API_BASE}/monitor/watchlist`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setWatchlist(data.items || [])
      setMonitorStatus({
        running: data.monitor_running,
        interval: data.check_interval_hours,
        wecom_app: data.wecom_app_configured,
        wecom: data.wecom_configured,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadWatchlist() }, [])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => { if (addedMsgTimer.current) clearTimeout(addedMsgTimer.current) }
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/monitor/settings`)
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {})
  }, [])

  // ============ 搜索竞品（后端统一搜索，全库不限于榜单）============

  const doSearch = async (query, platform, developer) => {
    if (!query.trim()) return
    setSearching(true)
    setSearchResults([])
    const term = encodeURIComponent(query.trim())
    let url = `${API_BASE}/monitor/search?q=${term}&country=US&platform=${platform || 'all'}`
    if (developer) url += `&developer=${encodeURIComponent(developer)}`

    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setSearchResults(data.results || [])
    } catch (e) {
      console.error('Search failed:', e)
      setActionError(`搜索失败: ${e.message}`)
      setTimeout(() => setActionError(null), 5000)
    }
    setSearching(false)
  }

  const handleSearch = () => {
    doSearch(searchQuery, searchPlatform, null)
  }

  // 点击开发者名称 → 搜索同作者所有App（尊重当前平台筛选）
  const handleSearchByDeveloper = (developerName) => {
    setSearchingDev(developerName)
    setSearchQuery('')
    // 使用当前选择的平台，而非强制 'all'
    doSearch(developerName, searchPlatform || 'all', developerName)
  }

  // 清除开发者搜索模式
  const clearDevSearch = () => {
    setSearchingDev(null)
    setSearchResults([])
    setSearchQuery('')
  }

  // ============ 添加竞品 ============

  const handleAddWatch = async (app) => {
    const appId = app.app_id || app.id
    if (!appId) {
      setError('搜索结果的 App ID 无效，无法添加到关注列表')
      setTimeout(() => setError(null), 4000)
      return
    }
    try {
      const r = await fetch(`${API_BASE}/monitor/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          platform: app.platform,
          name: app.name,
          developer: app.developer,
          icon_url: app.icon || app.icon_url,
          bundle_id: app.bundle_id || '',
          country: 'US',
        }),
      })
      const data = await r.json()
      if (r.ok) {
        loadWatchlist()
        // 显示初始检查结果
        const ic = data.initial_check
        if (ic && ic.detections) {
          setAddedMsg({
            name: app.name,
            total_ads: ic.detections.is_first_check ? (data.app?.last_ad_count || 0) : 0,
            sources: data.app?.ad_stats || {},
            isFirst: true,
          })
          if (addedMsgTimer.current) clearTimeout(addedMsgTimer.current)
          addedMsgTimer.current = setTimeout(() => setAddedMsg(null), 8000)
        }
        setSearchResults(prev => prev.filter(s => (s.app_id || s.id) !== (app.app_id || app.id)))
      }
    } catch (e) {
      console.error('Add watch failed:', e)
      setActionError(`添加失败: ${e.message}`)
      setTimeout(() => setActionError(null), 5000)
    }
  }

  // ============ 操作函数 ============

  const handleRemoveWatch = async (appId, platform) => {
    try {
      const r = await fetch(`${API_BASE}/monitor/watch/${appId}?platform=${platform}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      loadWatchlist()
    } catch (e) {
      console.error('Remove failed:', e)
      setActionError(`移除失败: ${e.message}`)
      setTimeout(() => setActionError(null), 5000)
    }
  }

  const handleCheckAll = async () => {
    setCheckingAll(true)
    setCheckResult(null)
    try {
      const r = await fetch(`${API_BASE}/monitor/check`, { method: 'POST' })
      const data = await r.json()
      setCheckResult(data)
      loadWatchlist()
    } catch (e) {
      setCheckResult({ error: e.message })
    } finally {
      setCheckingAll(false)
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      // 合并 webhookUrl 到 settings
      const payload = { ...settings }
      if (webhookUrl.trim()) {
        payload.wecom_webhooks = [webhookUrl.trim()]
      }
      await fetch(`${API_BASE}/monitor/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setShowSettings(false)
      loadWatchlist()
    } catch (e) {
      console.error('Save settings failed:', e)
      setActionError(`保存失败: ${e.message}`)
      setTimeout(() => setActionError(null), 5000)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleTestPush = async () => {
    setTestPushResult(null)
    try {
      // 优先使用当前输入的 webhook URL (未保存也能测试)
      const body = webhookUrl.trim() ? JSON.stringify({ webhook_url: webhookUrl.trim() }) : undefined
      const r = await fetch(`${API_BASE}/monitor/test-push`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      const data = await r.json()
      setTestPushResult(data)
    } catch (e) {
      setTestPushResult({ status: 'error', message: e.message })
    }
  }

  // ============ 渲染 ============

  return (
    <div className="competitor-watch">
      {/* 状态栏 */}
      <div className="watch-status-bar">
        <div className="status-item">
          <span className={`status-dot ${monitorStatus.running ? 'live' : 'off'}`}></span>
          <span className="status-label-zh">
            {monitorStatus.running ? '后台监控运行中' : '监控未启动'}
          </span>
          <span className="status-label-en">
            {monitorStatus.running ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="status-item">
          <span className="status-num">{watchlist.length}</span>
          <span className="status-label-zh">个竞品</span>
        </div>
        <div className="status-item">
          <span>{monitorStatus.wecom ? '✅' : '⚠️'}</span>
          <span className="status-label-zh">消息推送</span>
          <span className="status-label-en">
            {monitorStatus.wecom ? 'Webhook ✓' : '未配置'}
          </span>
        </div>
        <div className="status-item">
          <span>⏱ 每 {monitorStatus.interval || 1}h</span>
        </div>
        <button className="btn btn-settings" onClick={() => setShowSettings(!showSettings)}>
          ⚙️ 设置
        </button>
      </div>

      {/* 搜索添加竞品 */}
      <div className="watch-search-bar">
        {searchingDev ? (
          /* 开发者搜索模式 */
          <div className="search-dev-mode" style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
            <span style={{fontSize:13,color:'var(--accent)',whiteSpace:'nowrap'}}>👤 同作者: </span>
            <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{searchingDev}</span>
            <button onClick={clearDevSearch} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:14,padding:'2px 6px'}} title="清除开发者筛选">✕</button>
          </div>
        ) : (
          <input
            type="text"
            className="search-input"
            placeholder="搜索竞品 App 名称或开发者..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        )}
        {/* 平台筛选 */}
        <div className="search-platform-btns" style={{display:'flex',gap:4,flexShrink:0}}>
          {[
            { value: 'all', label: '全部', emoji: '🌐' },
            { value: 'app_store', label: 'App Store', emoji: '🍎' },
            { value: 'google_play', label: 'Google Play', emoji: '📱' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`platform-btn ${searchPlatform === opt.value ? 'active' : ''}`}
              onClick={() => {
                const newPlatform = opt.value
                setSearchPlatform(newPlatform)
                // 开发者搜索模式下，切换平台自动重新搜索
                if (searchingDev) {
                  doSearch(searchingDev, newPlatform, searchingDev)
                }
              }}
              title={opt.label}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                border: `1px solid ${searchPlatform === opt.value ? 'var(--accent)' : 'var(--border-glass)'}`,
                background: searchPlatform === opt.value ? 'var(--accent-glow)' : 'transparent',
                color: searchPlatform === opt.value ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
        <button className="btn btn-search" onClick={() => searchingDev ? doSearch(searchingDev, searchPlatform, searchingDev) : handleSearch()} disabled={searching}>
          {searching ? '搜索中...' : '🔍 搜索'}
        </button>
      </div>

      {/* 搜索结果 */}
      {searchResults.length > 0 && (
        <div className="watch-search-results">
          <div className="section-title" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>
              {searchingDev
                ? <><span style={{color:'var(--accent)'}}>👤 同作者「{searchingDev}」</span> 的 App ({searchResults.length}个)</>
                : <>搜索结果 / Search Results ({searchResults.length})</>
              }
            </span>
            <span style={{fontSize:11,color:'var(--text-muted)'}}>
              平台: {searchPlatform === 'all' ? '全部' : searchPlatform === 'app_store' ? '🍎 App Store' : '📱 Google Play'}
            </span>
          </div>
          <div className="watch-search-grid">
            {searchResults.map((app) => (
              <div className="watch-search-card" key={app.app_id || app.id || app.name}>
                <div className="watch-search-card-icon">
                  {(app.icon_url || app.icon) ? (
                    <img src={app.icon_url || app.icon} alt="" onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="watch-search-icon-placeholder">{app.name?.[0] || '?'}</div>
                  )}
                </div>
                <div className="watch-search-card-info">
                  <div className="watch-search-card-name">{app.name}</div>
                  <div className="watch-search-card-dev">{app.developer}</div>
                  <div className="watch-search-card-platform">
                    {app.platform === 'google_play' ? '📱 Google Play' : '🍎 App Store'}
                  </div>
                </div>
                <button className="btn btn-add-watch" onClick={() => handleAddWatch(app)}>
                  + 关注
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 添加成功反馈 */}
      {addedMsg && (
        <div className="watch-added-msg">
          <span className="added-icon">✅</span>
          <span className="added-text"><strong>{addedMsg.name}</strong> 已加入监控</span>
          <span className="added-detail">
            {addedMsg.isFirst
              ? `基线已建立 (GP视频 ${addedMsg.sources?.gp_video || 0} · GoogleAds ${addedMsg.sources?.google_ads || 0} · YouTube广告 ${addedMsg.sources?.youtube_ad || 0})`
              : `当前 ${addedMsg.total_ads} 条广告素材`}
          </span>
        </div>
      )}

      {/* 操作错误反馈 */}
      {actionError && (
        <div style={{padding:'10px 16px',background:'rgba(255,92,114,0.1)',border:'1px solid rgba(255,92,114,0.2)',borderRadius:8,marginBottom:12,fontSize:13,color:'var(--red)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span>❌ {actionError}</span>
          <button onClick={() => setActionError(null)} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:16}}>✕</button>
        </div>
      )}

      {/* 操作栏 */}
      <div className="watch-actions-bar">
        <button className="btn btn-check-all" onClick={handleCheckAll} disabled={checkingAll}>
          {checkingAll ? '检查中...' : '🔄 立即检查所有竞品'}
        </button>
        <span className="watch-source-hint">
          📡 数据源：Google Play 视频 · Google Ads 透明度中心 · YouTube广告 · App Store 截图
        </span>
      </div>

      {/* 数据来源说明 */}
      <div className="watch-sources-banner">
        <details>
          <summary>📡 广告数据来源说明 / Ad Data Sources</summary>
          <div className="sources-detail">
            <div className="source-row real-ads">
              <span className="source-badge">📢 真实广告</span>
              <span className="source-name">Google Ads 透明度中心</span>
              <span className="source-desc">官方付费广告库，含图片/视频/展示量（需手动打开链接查看）</span>
            </div>
            <div className="source-row store-content">
              <span className="source-badge">🏪 商店素材</span>
              <span className="source-name">Google Play 宣传视频</span>
              <span className="source-desc">商店页展示视频，竞品更换视频常伴随新投放</span>
            </div>
            <div className="source-row store-content">
              <span className="source-badge">🏪 商店素材</span>
              <span className="source-name">App Store 截图/版本</span>
              <span className="source-desc">截图变更常与广告投放同步</span>
            </div>
            <div className="source-row real-ad">
              <span className="source-badge">📢 真实广告</span>
              <span className="source-name">YouTube 广告验证</span>
              <span className="source-desc">通过Google Ads透明度中心验证YouTube投放</span>
            </div>
          </div>
        </details>
      </div>

      {/* 关注列表 */}
      {loading ? (
        <div className="watch-loading">
          <div className="spinner"></div>
          <span>加载中...</span>
        </div>
      ) : error ? (
        <div className="watch-error">
          <span>❌ {error}</span>
          <button className="btn btn-retry" onClick={loadWatchlist}>重试</button>
        </div>
      ) : watchlist.length === 0 ? (
        <div className="watch-empty">
          <div className="empty-icon">🎯</div>
          <div className="empty-title-zh">还没有关注任何竞品</div>
          <div className="empty-desc-zh">
            在"排行榜"页面点击 App 详情 → "加入竞品监控"，系统每 {settings.check_interval_hours} 小时自动检查，
            发现新素材后通过企业微信推送通知。
          </div>
        </div>
      ) : (
        <>
          <div className="watch-grid-header">
            <h3 className="section-title">关注列表 / Watchlist ({watchlist.length})</h3>
            <span style={{fontSize:11,color:'var(--text-muted)'}}>💡 点击开发者名称可搜索同作者所有App</span>
          </div>
          <div className="watch-grid">
            {watchlist.map((app) => (
              <div className={`watch-card ${app.total_alerts > 0 ? 'has-alert' : ''}`} key={`${app.app_id}_${app.platform}`}>
                <div className="watch-card-icon">
                  {app.icon_url ? (
                    <img src={app.icon_url} alt={app.name} onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="watch-card-icon-placeholder">{app.name?.[0] || '?'}</div>
                  )}
                </div>
                <div className="watch-card-info">
                  <div className="watch-card-name" title={app.name}>{app.name}</div>
                  <div className="watch-card-dev" style={{cursor:'pointer',color:'var(--accent)',textDecoration:'underline',textUnderlineOffset:3}}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (app.developer) handleSearchByDeveloper(app.developer)
                    }}
                    title={`点击搜索 "${app.developer}" 的所有App`}
                  >{app.developer}</div>
                  <div className="watch-card-platform">
                    {app.platform === 'google_play' ? '📱 Google Play' : '🍎 App Store'}
                  </div>
                  <div className="watch-card-stats">
                    <span title="GP视频/GoogleAds/YouTube广告/截图">📊 {app.last_ad_count || 0} 条素材</span>
                    <span>📅 {app.last_checked ? new Date(app.last_checked).toLocaleDateString('zh-CN') : '未检查'}</span>
                  </div>
                  {app.ad_stats && (app.ad_stats.gp_video > 0 || app.ad_stats.google_ads > 0 || app.ad_stats.youtube_ad > 0) && (
                    <div className="watch-card-ad-breakdown">
                      {app.ad_stats.gp_video > 0 && <span title="Google Play 商店宣传视频 / GP Store Video">▶{app.ad_stats.gp_video}</span>}
                      {app.ad_stats.google_ads > 0 && <span title="Google Ads 真实广告 / Google Ads Real Ads">📢{app.ad_stats.google_ads}</span>}
                      {app.ad_stats.youtube_ad > 0 && <span title="YouTube 广告投放验证 / YouTube Ad Verification">🎬{app.ad_stats.youtube_ad}</span>}
                      {app.ad_stats.app_store_ss > 0 && <span title="App Store 商店截图 / App Store Screenshots">🖼{app.ad_stats.app_store_ss}</span>}
                    </div>
                  )}
                  {app.total_alerts > 0 && (
                    <div
                      className="watch-card-alert-badge"
                      onClick={async (e) => {
                        e.stopPropagation()
                        const key = `${app.app_id}_${app.platform}`
                        if (expandedAlerts[key]) {
                          setExpandedAlerts(prev => { const n = {...prev}; delete n[key]; return n })
                          return
                        }
                        // 获取警报历史
                        try {
                          const r = await fetch(`${API_BASE}/monitor/history/${app.app_id}?platform=${app.platform}`)
                          const d = await r.json()
                          setExpandedAlerts(prev => ({ ...prev, [key]: d }))
                        } catch (e) {
                          console.error('Fetch alerts failed:', e)
                        }
                      }}
                      style={{cursor:'pointer'}}
                    >
                      🔔 {app.total_alerts} 条新动态 {expandedAlerts[`${app.app_id}_${app.platform}`] ? '▲' : '▼'}
                    </div>
                  )}
                  {/* 展开的新动态详情 */}
                  {expandedAlerts[`${app.app_id}_${app.platform}`] && (
                    <div className="watch-alert-detail" style={{marginTop:8, padding:12, background:'rgba(255,255,255,0.03)', borderRadius:8, fontSize:12, maxHeight:200, overflow:'auto'}}>
                      {(Array.isArray(expandedAlerts[`${app.app_id}_${app.platform}`].alerts) 
                        ? expandedAlerts[`${app.app_id}_${app.platform}`].alerts 
                        : [expandedAlerts[`${app.app_id}_${app.platform}`]]
                      ).map((alert, ai) => (
                        <div key={ai} style={{marginBottom:6, padding:'6px 8px', background:'rgba(255,255,255,0.04)', borderRadius:4, borderLeft:'3px solid var(--accent)'}}>
                          <div style={{fontWeight:600, color:'var(--accent)', marginBottom:2}}>
                            {alert.type_zh || alert.type || '变更'}
                            <span style={{float:'right', fontSize:10, color:'var(--text-muted)'}}>
                              {alert.detected_at ? new Date(alert.detected_at).toLocaleString('zh-CN') : ''}
                            </span>
                          </div>
                          {alert.detail_zh && <div style={{color:'var(--text-secondary)'}}>{alert.detail_zh}</div>}
                          {alert.detail_en && <div style={{fontSize:10, color:'var(--text-muted)'}}>{alert.detail_en}</div>}
                          {alert.new_ads_count > 0 && <div style={{color:'var(--green)', fontSize:11, marginTop:2}}>🆕 +{alert.new_ads_count} 新广告</div>}
                          {alert.new_ss_count > 0 && <div style={{color:'var(--green)', fontSize:11, marginTop:2}}>🖼 +{alert.new_ss_count} 新截图</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-remove"
                  onClick={() => handleRemoveWatch(app.app_id, app.platform)}
                  title="移除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 检查结果 */}
      {checkResult && (
        <div className="watch-check-result">
          <h3>检查结果 / Check Results</h3>
          {checkResult.error ? (
            <div className="check-error">❌ {checkResult.error}</div>
          ) : (
            <>
              <div className="check-summary">
                检查 {checkResult.total_checked} App，发现 {checkResult.new_ads_found} 个有变更
                <div className="check-sources">
                  📡 来源: GP视频 · Google Ads · YouTube广告 · App Store
                </div>
              </div>
              <div className="check-details">
                {checkResult.results?.map((r, i) => {
                  const hasNew = r.detections?.has_new
                  return (
                  <div key={r.app_id || i} className={`check-item ${hasNew ? 'has-new' : ''}`}
                    onClick={hasNew ? () => {
                      setDetailModal({
                        title: r.app_name,
                        icon: r.icon_url,
                        content: r.detections,
                        pushed: r.pushed,
                      })
                    } : undefined}
                    style={hasNew ? {cursor:'pointer'} : {}}
                  >
                    <div className="check-item-name">
                      {r.icon_url && <img src={r.icon_url} alt="" width="20" height="20" style={{borderRadius:4}} />}
                      <strong>{r.app_name}</strong>
                      {hasNew && <span style={{fontSize:10, color:'var(--text-muted)', marginLeft:6}}>(点击查看详情)</span>}
                    </div>
                    <div className="check-item-result">
                      {r.error ? `❌ ${r.error}` :
                       hasNew ?
                        `🆕 ${r.detections.total_new_ads} 个新内容, ${r.detections.total_new_screenshots} 张新截图` :
                       r.detections?.is_first_check ?
                        '📸 首次检查，已建立基线快照' :
                        '✓ 无变化'}
                      {r.pushed && ' 📨 已推送微信'}
                    </div>
                  </div>
                )})}
              </div>
            </>
          )}
          <button className="btn" onClick={() => setCheckResult(null)}>关闭</button>
        </div>
      )}

      {/* 设置面板 */}
      {showSettings && (
        <div className="watch-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="watch-settings-panel" onClick={e => e.stopPropagation()}>
            <h3>⚙️ 监控设置 / Monitor Settings</h3>

            <div className="settings-field">
              <label>
                <span className="label-zh">检查间隔（小时）</span>
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={settings.check_interval_hours}
                onChange={e => setSettings({...settings, check_interval_hours: parseInt(e.target.value) || 1})}
              />
              <span className="field-hint">默认 1 小时，最多 24 小时</span>
            </div>

            <div className="settings-field">
              <label>
                <span className="label-zh">💬 消息推送 Webhook (推荐·不受IP限制)</span>
                <span className="label-en">WeCom Webhook (No IP restriction)</span>
              </label>
              <div className="wecom-app-form">
                <div className="settings-row">
                  <span className="settings-label">Webhook URL</span>
                  <input
                    type="text"
                    value={webhookUrl || (settings.wecom_webhooks && settings.wecom_webhooks[0]) || ''}
                    onChange={e => setWebhookUrl(e.target.value)}
                    style={{fontSize: '12px', fontFamily: 'monospace'}}
                    placeholder="粘贴企业微信群机器人 Webhook URL..."
                  />
                </div>
              </div>
              <div className="wecom-app-status">
                {settings.wecom_webhooks && settings.wecom_webhooks[0]
                  ? '✅ 已配置 · 消息推送到企业微信群聊「毛白满的大公司」'
                  : '⚠️ 未配置 · 需要在企业微信群中创建消息推送'}
              </div>
              <div className="field-hint">
                <details>
                  <summary>如何创建消息推送 Webhook？</summary>
                  <div className="hint-detail">
                    <p><strong>①</strong> 管理后台 → 应用管理 → 消息推送 → 添加可创建成员</p>
                    <p><strong>②</strong> 进入企业微信内部群 → 右上角 "..." → 消息推送 → 新建</p>
                    <p><strong>③</strong> 复制 Webhook 地址粘贴到上方</p>
                    <p style={{color: 'var(--green)', marginTop: 8}}>💡 <strong>不需要域名！不需要IP白名单！完全免费！</strong></p>
                  </div>
                </details>
              </div>
            </div>

            <div className="settings-field">
              <label>
                <span className="label-zh">📱 企业微信应用消息 (备用·需IP白名单)</span>
                <span className="label-en">WeCom App (Backup·needs IP whitelist)</span>
              </label>
              <div className="wecom-app-form">
                <div className="settings-row">
                  <span className="settings-label">企业ID / CorpID</span>
                  <input
                    type="text"
                    placeholder="ww..."
                    value={settings.wecom_corpid || ''}
                    onChange={e => setSettings({...settings, wecom_corpid: e.target.value})}
                  />
                </div>
                <div className="settings-row">
                  <span className="settings-label">AgentId</span>
                  <input
                    type="number"
                    placeholder="1000002"
                    value={settings.wecom_agentid || ''}
                    onChange={e => setSettings({...settings, wecom_agentid: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div className="settings-row">
                  <span className="settings-label">Secret</span>
                  <input
                    type="password"
                    placeholder="..."
                    value={settings.wecom_secret || ''}
                    onChange={e => setSettings({...settings, wecom_secret: e.target.value})}
                  />
                </div>
              </div>
              <div className="wecom-app-status">
                {(settings.wecom_corpid && settings.wecom_agentid && settings.wecom_secret)
                  ? '✅ 已配置 · 备用推送渠道'
                  : '⚠️ 未完整配置 (需企业ID + AgentId + Secret)'}
              </div>
            </div>

            <div className="settings-actions">
              <button
                className="btn btn-test-push"
                onClick={handleTestPush}
                disabled={!(webhookUrl || (settings.wecom_webhooks && settings.wecom_webhooks[0]) || (settings.wecom_corpid && settings.wecom_agentid && settings.wecom_secret))}
              >
                📨 测试推送
              </button>
              {testPushResult && (
                <span className={`test-result ${testPushResult.status === 'sent' ? 'success' : 'fail'}`}>
                  {testPushResult.status === 'sent'
                    ? `✅ 推送成功！${testPushResult.success_targets}/${testPushResult.total_targets} 个目标已收到`
                    : `❌ 推送失败: ${testPushResult.detail || '请检查通知渠道配置'}`}
                </span>
              )}
              <div className="settings-buttons-right">
                <button className="btn" onClick={() => setShowSettings(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 检查结果详情弹窗（替代 alert） */}
      {detailModal && (
        <div className="watch-settings-overlay" onClick={() => setDetailModal(null)}>
          <div className="watch-settings-panel" onClick={e => e.stopPropagation()} style={{maxWidth: 600}}>
            <h3 style={{display:'flex',alignItems:'center',gap:10,margin:'0 0 16px 0'}}>
              {detailModal.icon && <img src={detailModal.icon} alt="" width="28" height="28" style={{borderRadius:6}} />}
              <span>{detailModal.title} — 新内容详情</span>
            </h3>
            {detailModal.content?.new_ads?.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontWeight:600,color:'var(--accent)',marginBottom:8}}>
                  🆕 新广告 ({detailModal.content.total_new_ads}条)
                </div>
                {detailModal.content.new_ads.map((a, ai) => (
                  <div key={ai} style={{padding:'6px 10px',background:'rgba(255,255,255,0.04)',borderRadius:6,marginBottom:4,fontSize:13}}>
                    <span style={{color:'var(--text-secondary)'}}>{a.source || a.source_label_zh || '广告'}</span>
                    {a.title && <span style={{marginLeft:8,color:'var(--text-primary)'}}>{a.title}</span>}
                    {a.video_url && <a href={a.video_url} target="_blank" rel="noreferrer" style={{marginLeft:8,color:'var(--accent)',fontSize:11}}>▶ 观看</a>}
                  </div>
                ))}
              </div>
            )}
            {detailModal.content?.new_screenshots?.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontWeight:600,color:'var(--accent)',marginBottom:8}}>
                  🖼 新截图 ({detailModal.content.total_new_screenshots}张)
                </div>
                <div style={{display:'flex',gap:8,overflowX:'auto'}}>
                  {detailModal.content.new_screenshots.map((s, si) => (
                    <img key={si} src={s.url || s} alt={`Screenshot ${si+1}`} style={{width:120,borderRadius:8,border:'1px solid var(--border-glass)'}} />
                  ))}
                </div>
              </div>
            )}
            {detailModal.content?.version_changed && (
              <div style={{padding:'8px 12px',background:'rgba(79,140,255,0.08)',borderRadius:8,marginBottom:12,fontSize:13}}>
                📱 版本变更: {detailModal.content.old_version || '?'} → {detailModal.content.new_version || '?'}
              </div>
            )}
            {detailModal.pushed && (
              <div style={{padding:'8px 12px',background:'rgba(0,200,83,0.08)',borderRadius:8,marginBottom:12,fontSize:13,color:'var(--green)'}}>
                📨 已推送到企业微信
              </div>
            )}
            {(!detailModal.content?.new_ads?.length && !detailModal.content?.new_screenshots?.length) && (
              <div style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>暂无详细内容</div>
            )}
            <button className="btn btn-primary" onClick={() => setDetailModal(null)} style={{marginTop:4}}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
