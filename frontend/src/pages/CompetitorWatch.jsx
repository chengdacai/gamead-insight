import { useState, useEffect } from 'react'

const API_BASE = '/api'

export default function CompetitorWatch() {
  const [watchlist, setWatchlist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [monitorStatus, setMonitorStatus] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedApp, setSelectedApp] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ wecom_webhook: '', check_interval_hours: 6 })
  const [savingSettings, setSavingSettings] = useState(false)
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkResult, setCheckResult] = useState(null)
  const [testPushResult, setTestPushResult] = useState(null)

  // 加载关注列表
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

  // 加载设置
  useEffect(() => {
    fetch(`${API_BASE}/monitor/settings`)
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {})
  }, [])

  // 搜索 App
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      // 通过 iTunes + GP 搜索
      const asRes = await fetch(`${API_BASE}/appstore/top20?category=TOOLS&limit=50`)
      const asData = await asRes.json()
      const query = searchQuery.toLowerCase()

      // 从 App Store 结果中筛选
      const asHits = (asData.apps || []).filter(a =>
        a.name?.toLowerCase().includes(query) ||
        a.developer?.toLowerCase().includes(query)
      ).slice(0, 10)

      // 从 Google Play 结果中筛选
      const gpRes = await fetch(`${API_BASE}/googleplay/top?category=TOOLS&limit=50`)
      const gpData = await gpRes.json()
      const gpHits = (gpData.apps || []).filter(a =>
        a.title?.toLowerCase().includes(query) ||
        a.developer?.toLowerCase().includes(query)
      ).slice(0, 5).map(a => ({
        id: a.appId || a.app_id || '',
        name: a.title || a.name || '',
        developer: a.developer || '',
        icon: a.icon || a.icon_url || '',
        platform: 'google_play',
        bundle_id: a.appId || '',
      }))

      const results = [
        ...asHits.map(a => ({
          id: a.app_id || '',
          name: a.name || '',
          developer: a.developer || '',
          icon: a.icon_url || '',
          platform: 'app_store',
        })),
        ...gpHits,
      ]
      setSearchResults(results)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setSearching(false)
    }
  }

  // 添加竞品
  const handleAddWatch = async (app) => {
    try {
      const body = {
        app_id: app.id || '',
        name: app.name || '',
        developer: app.developer || '',
        icon_url: app.icon || '',
        platform: app.platform || 'app_store',
        bundle_id: app.bundle_id || app.id || '',
      }
      const r = await fetch(`${API_BASE}/monitor/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (data.status === 'added') {
        loadWatchlist()
        setSelectedApp(app.name)
        setTimeout(() => setSelectedApp(null), 2000)
      } else if (data.status === 'already_watching') {
        setSelectedApp('already')
        setTimeout(() => setSelectedApp(null), 2000)
      }
    } catch (e) {
      console.error('Add failed:', e)
    }
  }

  // 移除竞品
  const handleRemoveWatch = async (appId, platform) => {
    try {
      await fetch(`${API_BASE}/monitor/watch/${appId}?platform=${platform}`, { method: 'DELETE' })
      loadWatchlist()
    } catch (e) {
      console.error('Remove failed:', e)
    }
  }

  // 手动全量检查
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

  // 保存设置
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const r = await fetch(`${API_BASE}/monitor/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      await r.json()
      setShowSettings(false)
      loadWatchlist()
    } catch (e) {
      console.error('Save settings failed:', e)
    } finally {
      setSavingSettings(false)
    }
  }

  // 测试推送
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
            {monitorStatus.running ? 'Monitor Running' : 'Monitor Stopped'}
          </span>
        </div>
        <div className="status-item">
          <span className="status-num">{watchlist.length}</span>
          <span className="status-label-zh">个竞品 / 已关注</span>
        </div>
        <div className="status-item">
          <span>{monitorStatus.wecom ? '✅' : '⚠️'}</span>
          <span className="status-label-zh">微信推送</span>
          <span className="status-label-en">
            {monitorStatus.wecom ? 'Configured' : 'Not Set'}
          </span>
        </div>
        <button className="btn btn-settings" onClick={() => setShowSettings(!showSettings)}>
          ⚙️ 设置 / Settings
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="watch-search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="搜索 App 添加到关注列表... / Search app to monitor..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-search" onClick={handleSearch} disabled={searching}>
          {searching ? '搜索中...' : '🔍 搜索 / Search'}
        </button>
        <button className="btn btn-check-all" onClick={handleCheckAll} disabled={checkingAll}>
          {checkingAll ? '检查中... / Checking...' : '🔄 立即检查 / Check Now'}
        </button>
      </div>

      {/* 搜索结果 */}
      {searchResults.length > 0 && (
        <div className="watch-search-results">
          <h3 className="section-title">搜索结果 / Search Results ({searchResults.length})</h3>
          <div className="watch-grid">
            {searchResults.map((app, i) => (
              <div className="watch-card search-card" key={i}>
                <div className="watch-card-icon">
                  {app.icon ? (
                    <img src={app.icon} alt={app.name} onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="watch-card-icon-placeholder">{app.name?.[0] || '?'}</div>
                  )}
                </div>
                <div className="watch-card-info">
                  <div className="watch-card-name" title={app.name}>{app.name}</div>
                  <div className="watch-card-dev">{app.developer}</div>
                  <div className="watch-card-platform">{app.platform === 'google_play' ? '📱 Google Play' : '🍎 App Store'}</div>
                </div>
                <button
                  className="btn btn-add"
                  onClick={() => handleAddWatch(app)}
                >
                  {selectedApp === app.name ? '✅ 已添加 / Added' :
                   selectedApp === 'already' ? '已在关注中' : '+ 关注 / Watch'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 关注列表 */}
      {loading ? (
        <div className="watch-loading">
          <div className="spinner"></div>
          <span>加载关注列表中... / Loading watchlist...</span>
        </div>
      ) : error ? (
        <div className="watch-error">
          <span>❌ 加载失败: {error}</span>
          <button className="btn btn-retry" onClick={loadWatchlist}>重试 / Retry</button>
        </div>
      ) : watchlist.length === 0 ? (
        <div className="watch-empty">
          <div className="empty-icon">🎯</div>
          <div className="empty-title-zh">还没有关注任何竞品</div>
          <div className="empty-title-en">No competitors being watched</div>
          <div className="empty-desc-zh">
            在上方搜索你想监控的 App，系统会每 {settings.check_interval_hours} 小时自动检查新广告，
            发现新素材后通过企业微信通知你。
          </div>
          <div className="empty-desc-en">
            Search for an app above. The system will check for new ads every {settings.check_interval_hours} hours
            and send you a WeChat notification when new creatives are found.
          </div>
        </div>
      ) : (
        <>
          <div className="watch-grid-header">
            <h3 className="section-title">关注列表 / Watchlist ({watchlist.length})</h3>
            <span className="watch-hint">新广告即时微信通知 / Real-time WeChat alerts</span>
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
                    <span>📊 {app.total_alerts || 0} 提醒</span>
                    <span>📅 {app.last_checked ? new Date(app.last_checked).toLocaleDateString('zh-CN') : '未检查'}</span>
                  </div>
                  {app.total_alerts > 0 && (
                    <div className="watch-card-alert-badge">🔔 有新动态</div>
                  )}
                </div>
                <button
                  className="btn btn-remove"
                  onClick={() => handleRemoveWatch(app.app_id, app.platform)}
                  title="移除 / Remove"
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
                已检查 {checkResult.total_checked} 个 App，发现 {checkResult.new_ads_found} 个有新广告
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
                        `🆕 ${r.detections.total_new_ads} 个新广告, ${r.detections.total_new_screenshots} 张新截图` :
                        '✓ 无变化'}
                      {r.pushed && ' 📨 已推送'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="btn" onClick={() => setCheckResult(null)}>关闭 / Close</button>
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
                <span className="label-en">Check Interval (hours)</span>
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={settings.check_interval_hours}
                onChange={e => setSettings({...settings, check_interval_hours: parseInt(e.target.value) || 6})}
              />
              <span className="field-hint">建议 4-12 小时 / Recommended: 4-12 hours</span>
            </div>

            <div className="settings-field">
              <label>
                <span className="label-zh">企业微信机器人 Webhook</span>
                <span className="label-en">WeCom Bot Webhook URL</span>
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
                    <p><strong>第1步</strong>：打开企业微信 PC 或手机客户端</p>
                    <p><strong>第2步</strong>：在任意群聊中 → 右上角「...」→ 「群机器人」→ 「添加机器人」</p>
                    <p><strong>第3步</strong>：复制 Webhook 地址，粘贴到上方输入框</p>
                    <p>💡 也可以创建一个只有自己的群聊，方便接收通知</p>
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
                📨 测试推送 / Test Push
              </button>
              {testPushResult && (
                <span className={`test-result ${testPushResult.status === 'sent' ? 'success' : 'fail'}`}>
                  {testPushResult.status === 'sent' ? '✅ 推送成功！请检查企业微信' :
                   testPushResult.status === 'error' ? `❌ ${testPushResult.message}` :
                   '❌ 推送失败，请检查 Webhook URL'}
                </span>
              )}
              <div className="settings-buttons-right">
                <button className="btn" onClick={() => setShowSettings(false)}>取消 / Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? '保存中...' : '保存 / Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
