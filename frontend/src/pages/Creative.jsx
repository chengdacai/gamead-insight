import { useState, useEffect } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'

const API_BASE = '/api'

export default function Creative() {
  const [templates, setTemplates] = useState({})
  const [selected, setSelected] = useState(null)
  const [appIdeas, setAppIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [templateStats, setTemplateStats] = useState({ total: 0, cases: 0, hooks: 0 })

  const fetchAll = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`${API_BASE}/creative/tools`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch(`${API_BASE}/appstore/top20?limit=6`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
    ]).then(([tmpl, apps]) => {
      const tplData = tmpl.templates || {}
      setTemplates(tplData)
      const appList = (apps.apps || []).slice(0, 4)

      // 统计真实数据
      let totalHooks = 0
      Object.values(tplData).forEach(t => {
        totalHooks += (t.hook_zh || []).length + (t.hook_en || []).length
      })
      setTemplateStats({
        total: Object.keys(tplData).length,
        cases: appList.length,
        hooks: totalHooks
      })

      // 用真实模板名称为 Top App 生成创意案例
      const tplKeys = Object.keys(tplData)
      const ideas = appList.map(app => {
        const appIdeas = tplKeys.slice(0, 4).map((key, j) => {
          const t = tplData[key]
          return {
            template: key,
            template_name: t.zh || key,
            zh: t.hook_zh?.[0] || `${app.name} × ${t.zh || key}`,
            en: t.hook_en?.[0] || `${app.name} × ${t.en || key}`,
          }
        })
        return { app_name: app.name, app_icon: app.icon_url, rating: app.rating, ideas: appIdeas }
      })
      setAppIdeas(ideas)
    }).catch(err => setError(err.message)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])

  const templateEntries = Object.entries(templates)

  // 雷达图数据 — 用模板Hook数量作为真实维度分数
  const radarData = templateEntries.map(([key, tpl]) => ({
    template: (tpl.zh || key).length > 8 ? (tpl.zh || key).slice(0,7)+'…' : (tpl.zh || key),
    score: Math.min(100, ((tpl.hook_zh || []).length + (tpl.hook_en || []).length) * 15),
    full: 100,
  }))

  if (error) return (
    <div className="empty-state">
      <div className="empty-icon">⚠</div>
      <div className="empty-text-zh">数据加载失败</div>
      <div className="empty-text-en">Failed to load data</div>
      <div style={{fontSize:11,color:'var(--text-muted)',margin:'8px 0'}}>{error}</div>
      <button className="btn primary small" onClick={fetchAll} style={{marginTop:12}}>
        重试 / Retry
      </button>
    </div>
  )

  if (loading) return <div className="empty-state"><div className="empty-icon">⬡</div><div className="empty-text-zh">加载中...</div><div className="empty-text-en">Loading...</div></div>

  return (
    <div>
      {/* Intro */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value purple">{templateStats.total}</div>
          <div className="stat-label-zh">广告模板 / Templates</div>
          <div className="stat-label-en">tools category specific</div>
          <div className="stat-sub">🎯 工具类定制 / Customized</div>
        </div>
        <div className="stat-card">
          <div className="stat-value green">{templateStats.cases}</div>
          <div className="stat-label-zh">创意案例 / Case Studies</div>
          <div className="stat-label-en">top apps demonstration</div>
          <div className="stat-sub">💡 即学即用 / Ready to use</div>
        </div>
        <div className="stat-card">
          <div className="stat-value blue">{templateStats.hooks}</div>
          <div className="stat-label-zh">Hook 范例 / Hook Examples</div>
          <div className="stat-label-en">ready-to-use hooks</div>
          <div className="stat-sub">📝 双语 / Bilingual</div>
        </div>
        <div className="stat-card">
          <div className="stat-value orange">{templateStats.total ? '∞' : '—'}</div>
          <div className="stat-label-zh">组合可能 / Combinations</div>
          <div className="stat-label-en">creative angles</div>
          <div className="stat-sub">🎬 多维度 / Multi-angle</div>
        </div>
      </div>

      {/* Template List */}
      <div className="card" style={{marginBottom:24}}>
        <div className="card-header">
          <div>
            <div className="card-title-zh">工具类广告模板库 / Tools Ad Templates</div>
            <div className="card-title-en">Click to explore each template</div>
          </div>
        </div>
        <div className="creative-grid">
          {templateEntries.map(([key, tpl]) => {
            const isSelected = selected === key
            return (
              <div
                key={key}
                className={`creative-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelected(isSelected ? null : key)}
                style={{cursor:'pointer'}}
              >
                <div className="creative-header">
                  <div>
                    <div className="creative-name-zh">{tpl.zh}</div>
                    <div className="creative-name-en">{tpl.en}</div>
                  </div>
                </div>
                <div className="creative-desc">
                  <div style={{fontSize:13,color:'var(--text-primary)',marginBottom:4}}>{tpl.desc_zh}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-en)'}}>{tpl.desc_en}</div>
                </div>
                {isSelected && (
                  <div className="creative-hooks" style={{marginTop:12}}>
                    <div style={{width:'100%',fontSize:10,color:'var(--text-muted)',marginBottom:6}}>
                      Hook 示例 / Examples:
                    </div>
                    {tpl.hook_zh?.map((h, i) => (
                      <span key={`zh${i}`} className="hook-chip">{h}</span>
                    ))}
                    {tpl.hook_en?.map((h, i) => (
                      <span key={`en${i}`} className="hook-chip" style={{opacity:0.7,fontSize:10}}>{h}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* App Case Studies */}
      {appIdeas.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title-zh">Top App 创意示例 / Top Apps Creative Demo</div>
              <div className="card-title-en">Real apps × creative templates</div>
            </div>
          </div>
          {appIdeas.map((app, i) => (
            <div key={i} style={{
              padding: '20px 0',
              borderBottom: i < appIdeas.length - 1 ? '1px solid var(--border-glass)' : 'none'
            }}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                <div className="app-icon" style={{width:40,height:40,borderRadius:10}}>
                  {app.app_icon
                    ? <img src={app.app_icon} alt={app.app_name} />
                    : <div className="app-icon-placeholder">📱</div>
                  }
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{app.app_name}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-en)'}}>
                    Rating: {app.rating?.toFixed(1)} ★
                  </div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:12}}>
                {app.ideas.map((idea, j) => (
                  <div key={j} style={{
                    padding:'12px',
                    background:'rgba(255,255,255,0.02)',
                    borderRadius:10,
                    border:'1px solid var(--border-glass)'
                  }}>
                    <div style={{
                      padding:'2px 8px',
                      borderRadius:4,
                      background:'rgba(79,140,255,0.12)',
                      color:'var(--accent)',
                      fontSize:10,
                      fontWeight:600,
                      display:'inline-block',
                      marginBottom:8,
                      fontFamily:'var(--font-en)',
                      textTransform:'uppercase'
                    }}>
                      {idea.template_name}
                    </div>
                    <div style={{fontSize:12,color:'var(--text-primary)',lineHeight:1.5,marginBottom:4}}>{idea.zh}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-en)',lineHeight:1.4}}>{idea.en}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
