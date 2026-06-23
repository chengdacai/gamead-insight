import { useState, useEffect } from 'react'

const API_BASE = '/api'

export default function CompetitorWatch() {
  const [watchlist, setWatchlist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [monitorStatus, setMonitorStatus] = useState({})
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ wecom_webhook: '', check_interval_hours: 1 })
  const [savingSettings, setSavingSettings] = useState(false)
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkResult, setCheckResult] = useState(null)
  const [testPushResult, setTestPushResult] = useState(null)

  // 搜索
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])

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
        wecom: data.wecom_configured,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadWatchlist() }, [])

  useEffect(() => {
    fetch(`${API_BASE}/monitor/settings`)
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {})
  }, [])

  // ============ 搜索竞品（直接用 iTunes Search API，1 次请求搞定） ============

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    const term = encodeURIComponent(searchQuery.trim())
    const hits = []

    try {
      // App Store: 直接用 iTunes Search API（全库搜索，不限于某类别 Top20）
      const asRes = await fetch(
        `https://itunes.apple.com/search?term=${term}&entity=software&country=US&limit=20`
      )
      const asData = await asRes.json();
      (asData.results || []).forEach(a => {
        hits.push({
          id: String(a.trackId || ''),
          name: a.trackName || '',
          developer: a.artistName || '',
          icon: a.artworkUrl100 || '',
          platform: 'app_store',
        })
      })
    } catch (e) {
      console.error('App Store search failed:', e)
    }

    // Google Play 搜索
    try {
      const gpRes = await fetch(`${API_BASE}/googleplay/top?category=TOOLS&limit=50`)
      const gpData = await gpRes.json();
      (gpData.apps || []).filter(a =>
        a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.developer?.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 10).forEach(a => {
        hits.push({
          id: a.appId || a.app_id || '',
          name: a.title || a.name || '',
          developer: a.developer || '',
          icon: a.icon || a.icon_url || '',
          platform: 'google_play',
        })
      })
    } catch (e) {
      console.error('Google Play search failed:', e)
    }

    // 去重（App Store 优先）
    const seen = new Set()
    const deduped = []
    for (const h of hits) {
      const key = h.name + '|' + h.platform
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(h)
      }
    }

    setSearchResults(deduped.slice(0, 20))
    setSearching(false)
  }

  // ============ 添加竞品 ============

  const handleAddWatch = async (app) => {
    try {
      const r = await fetch(`${API_BASE}/monitor/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: app.id,
          platform: app.platform,
          name: app.name,
          developer: app.developer,
          icon_url: app.icon,
          country: 'US',
        }),
      })
      if (r.ok) {
        loadWatchlist()
        // 从搜索结果中移除
        setSearchResults(prev => prev.filter(s => s.id !== app.id))
      }
    } catch (e) {
      console.error('Add watch failed:', e)
    }
  }

  // ============ 操作函数 ============

  const handleRemoveWatch = async (appId, platform) => {
    try {
      await fetch(`${API_BASE}/monitor/watch/${appId}?platform=${platform}`, { method: 'DELETE' })
      loadWatchlist()
    } catch (e) {
      console.error('Remove failed:', e)
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
      await fetch(`${API_BASE}/monitor/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      setShowSettings(false)
      loadWatchlist()
    } catch (e) {
      console.error('Save settings failed:', e)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleTestPush = async () => {
    setTestPushResult(null)
    try {
      const r = await fetch(`${API_BASE}/monitor/test-push`, { method: 'POST' })
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
          <span className="status-label-zh">微信推送</span>
          <span className="status-label-en">
            {monitorStatus.wecom ? 'OK' : '未配置'}
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
        <input
          type="text"
          className="search-input"
          placeholder="搜索竞品 App 名称或开发者..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-search" onClick={handleSearch} disabled={searching}>
          {searching ? '搜索中...' : '🔍 搜索'}
        </button>
      </div>

      {/* 搜索结果 */}
      {searchResults.length > 0 && (
        <div className="watch-search-results">
          <div className="section-title">
            搜索结果 / Search Results ({searchResults.length})
          </div>
          <div className="watch-search-grid">
            {searchResults.map((app, i) => (
              <div className="watch-search-card" key={i}>
                <div className="watch-search-card-icon">
                  {app.icon ? (
                    <img src={app.icon} alt="" onError={e => { e.target.style.display = 'none' }} />
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

      {/* 操作栏 */}
      <div className="watch-actions-bar">
        <button className="btn btn-check-all" onClick={handleCheckAll} disabled={checkingAll}>
          {checkingAll ? '检查中...' : '🔄 立即检查所有竞品'}
        </button>
        <span className="watch-source-hint">
          📡 数据源：Google Play 视频 · Google Ads 透明度中心 · YouTube · App Store 截图
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
            <div className="source-row video-content">
              <span className="source-badge">🎬 视频内容</span>
              <span className="source-name">YouTube 搜索</span>
              <span className="source-desc">搜索竞品相关视频，可能包含测评/推广</span>
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
          </div>
          <div className="watch-grid">
            {watchlist.map((app, i) => (
              <div className={`watch-card ${app.total_alerts > 0 ? 'has-alert' : ''}`} key={i}>
                <div className="watch-card-icon">
                  {app.icon_url ? (
                    <img src={app.icon_url} alt={app.name} onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="watch-card-icon-placeholder">{app.name?.[0] || '?'}</div>
                  )}
                </div>
                <div className="watch-card-info">
                  <div className="watch-card-name" title={app.name}>{app.name}</div>
                  <div className="watch-card-dev">{app.developer}</div>
                  <div className="watch-card-platform">
                    {app.platform === 'google_play' ? '📱 Google Play' : '🍎 App Store'}
                  </div>
                  <div className="watch-card-stats">
                    <span>📊 {app.total_alerts || 0} 次提醒</span>
                    <span>📅 {app.last_checked ? new Date(app.last_checked).toLocaleDateString('zh-CN') : '未检查'}</span>
                  </div>
                  {app.total_alerts > 0 && (
                    <div className="watch-card-alert-badge">🔔 有新动态</div>
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
                  📡 来源: GP视频 · Google Ads · YouTube · App Store
                </div>
              </div>
              <div className="check-details">
                {checkResult.results?.map((r, i) => (
                  <div key={i} className={`check-item ${r.detections?.has_new ? 'has-new' : ''}`}>
                    <div className="check-item-name">
                      {r.icon_url && <img src={r.icon_url} alt="" width="20" height="20" style={{borderRadius:4}} />}
                      <strong>{r.app_name}</strong>
                    </div>
                    <div className="check-item-result">
                      {r.error ? `❌ ${r.error}` :
                       r.detections?.has_new ?
                        `🆕 ${r.detections.total_new_ads} 个新内容, ${r.detections.total_new_screenshots} 张新截图` :
                        '✓ 无变化'}
                      {r.pushed && ' 📨 已推送微信'}
                    </div>
                  </div>
                ))}
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
                <span className="label-zh">企业微信机器人 Webhook</span>
              </label>
              <textarea
                rows="3"
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
                value={settings.wecom_webhook}
                onChange={e => setSettings({...settings, wecom_webhook: e.target.value})}
              />
              <div className="field-hint">
                <details>
                  <summary>如何获取 Webhook URL？</summary>
                  <div className="hint-detail">
                    <p>① 企业微信 → 群聊 → 右上角「...」→ 「群机器人」→ 「添加」</p>
                    <p>② 复制 Webhook 地址粘贴到上方</p>
                    <p>③ 可创建只有自己的群聊接收通知</p>
                  </div>
                </details>
              </div>
            </div>

            <div className="settings-actions">
              <button
                className="btn btn-test-push"
                onClick={handleTestPush}
                disabled={!settings.wecom_webhook}
              >
                📨 测试推送
              </button>
              {testPushResult && (
                <span className={`test-result ${testPushResult.status === 'sent' ? 'success' : 'fail'}`}>
                  {testPushResult.status === 'sent' ? '✅ 推送成功！请检查企业微信' :
                   testPushResult.status === 'error' ? `❌ ${testPushResult.message}` :
                   '❌ 推送失败，请检查 Webhook URL'}
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
    </div>
  )
}
