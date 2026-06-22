import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import AppStore from './pages/AppStore'
import StoreRanking from './pages/StoreRanking'
import AdLibrary from './pages/AdLibrary'
import Trends from './pages/Trends'
import Creative from './pages/Creative'
import AppDetail from './pages/AppDetail'

const API_BASE = window.location.hostname === 'localhost' ? '/api' : '/api'

// Sidebar nav items
const NAV_ITEMS = [
  { path: '/',           label: '仪表盘', labelEn: 'Dashboard',     icon: '⬡' },
  { path: '/appstore',   label: 'App Store', labelEn: 'App Store',     icon: '📱' },
  { path: '/ranking',    label: '商店榜单', labelEn: 'Store Ranking', icon: '📊' },
  { path: '/ads',         label: '广告素材库', labelEn: 'Ad Library',    icon: '▶' },
  { path: '/trends',     label: '热点趋势', labelEn: 'Trends',         icon: '✦' },
  { path: '/creative',   label: '创意模板', labelEn: 'Creative',      icon: '◆' },
]

export default function App() {
  const [status, setStatus] = useState({ total_topics: 0, ai_mode: '加载中...' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/status`)
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {})
  }, [])

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <div className="brand-icon">◆</div>
          {!sidebarCollapsed && (
            <div className="brand-text">
              <div className="brand-name">GameAd</div>
              <div className="brand-sub">Inspire / 灵感</div>
            </div>
          )}
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {!sidebarCollapsed && (
                <span className="nav-label">
                  <span className="nav-label-zh">{item.label}</span>
                  <span className="nav-label-en">{item.labelEn}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {!sidebarCollapsed && (
            <div className="status-mini">
              <div className="status-dot live"></div>
              <span>{status.total_topics} 条数据 / topics</span>
            </div>
          )}
          <button className="collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '▸' : '◂'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-left">
            <h2 className="page-title">
              <LocationTitle />
            </h2>
          </div>
          <div className="top-bar-right">
            <div className="status-indicator">
              <span className="status-dot live"></span>
              <span className="status-text">实时 / Live</span>
            </div>
            <span className="status-badge free">免费方案 / Free</span>
          </div>
        </header>
        <div className="content-area">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/appstore" element={<AppStore />} />
            <Route path="/appstore/:appId" element={<AppDetail />} />
            <Route path="/ranking" element={<StoreRanking />} />
            <Route path="/ads" element={<AdLibrary />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/creative" element={<Creative />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function LocationTitle() {
  const location = useLocation()
  const item = NAV_ITEMS.find(n => n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path))
  if (!item) return <><span className="title-zh">详情</span><span className="title-divider">/</span><span className="title-en">Detail</span></>
  return <><span className="title-zh">{item.label}</span><span className="title-divider">/</span><span className="title-en">{item.labelEn}</span></>
}
