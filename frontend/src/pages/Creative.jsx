import { useState, useEffect } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'

const API_BASE = window.location.hostname === 'localhost' ? '/api' : '/api'

export default function Creative() {
  const [templates, setTemplates] = useState({})
  const [selected, setSelected] = useState(null)
  const [appIdeas, setAppIdeas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch creative templates
    fetch(`${API_BASE}/creative/tools`)
      .then(r => r.json())
      .then(d => setTemplates(d.templates || {}))
      .catch(() => {})
      .finally(() => setLoading(false))

    // Fetch top apps for creative demonstration
    fetch(`${API_BASE}/appstore/top20?sort_by=rating`)
      .then(r => r.json())
      .then(d => {
        const top3 = (d.apps || []).slice(0, 3)
        // Generate sample creative ideas for display
        const ideas = top3.map(app => ({
          app_name: app.name,
          app_icon: app.icon_url,
          rating: app.rating,
          ideas: [
            {
              template: 'problem_solution',
              zh: `展示${app.name}解决日常痛点的场景`,
              en: `Show how ${app.name} solves daily pain points`
            },
            {
              template: 'before_after',
              zh: `分屏对比使用${app.name}前后的效率差异`,
              en: `Split-screen before/after with ${app.name}`
            },
            {
              template: 'productivity_hack',
              zh: `以iPhone隐藏技巧形式揭秘${app.name}`,
              en: `Reveal ${app.name} as an iPhone hidden trick`
            },
          ]
        }))
        setAppIdeas(ideas)
      })
      .catch(() => {})
  }, [])

  const templateEntries = Object.entries(templates)
  const templateKeys = Object.keys(templates)
  const selectedTemplate = selected ? templates[selected] : null

  // Radar data to visualize template coverage
  const radarData = templateEntries.map(([key, tpl]) => ({
    template: tpl.zh || key,
    score: templateKeys.indexOf(key) < 3 ? 95 : templateKeys.indexOf(key) < 5 ? 85 : 75,
    full: 100,
  }))

  return (
    <div>
      {/* Intro */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value purple">{templateEntries.length}</div>
          <div className="stat-label-zh">广告模板 / Templates</div>
          <div className="stat-label-en">tools category specific</div>
          <div className="stat-sub">🎯 工具类定制 / Customized</div>
        </div>
        <div className="stat-card">
          <div className="stat-value green">{appIdeas.length}</div>
          <div className="stat-label-zh">创意案例 / Case Studies</div>
          <div className="stat-label-en">top apps demonstration</div>
          <div className="stat-sub">💡 即学即用 / Ready to use</div>
        </div>
        <div className="stat-card">
          <div className="stat-value blue">100%</div>
          <div className="stat-label-zh">双语覆盖 / Bilingual</div>
          <div className="stat-label-en">Chinese + English</div>
          <div className="stat-sub">🌐 全球化 / Global Ready</div>
        </div>
        <div className="stat-card">
          <div className="stat-value orange">6</div>
          <div className="stat-label-zh">创意维度 / Dimensions</div>
          <div className="stat-label-en">creative angles</div>
          <div className="stat-sub">🎬 多视角 / Multi-angle</div>
        </div>
      </div>

      {/* Template List */}
      <div className="card" style={{marginBottom:24}}>
        <div className="card-header">
          <div>
            <div className="card-title-zh">6大工具类广告模板 / 6 Tools Ad Templates</div>
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
                      {idea.template}
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
