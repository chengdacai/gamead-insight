import { useState, useEffect, useCallback } from "react";
import {
  BarChartOutlined,
  GoogleOutlined,
  AppleOutlined,
  RocketOutlined,
  CaretRightOutlined,
  LoadingOutlined,
  LineChartOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";

const API = "/api";

/* ─── Insightrackr 风格：应用类型（应用 / 游戏） ─── */
const APP_TYPES = [
  { key: "app",  zh: "应用", en: "App" },
  { key: "game", zh: "游戏", en: "Game" },
];

/* ─── 类别列表（根据 app_type 动态变化，需与后端 ITUNES_GENRE_MAP 同步） ─── */
const CATEGORY_MAP = {
  app: [
    { key: "ART_AND_DESIGN", zh: "图形设计", en: "Graphics & Design" },
    { key: "TOOLS",        zh: "工具",     en: "Utilities" },
    { key: "PHOTOGRAPHY",  zh: "摄影录像", en: "Photo & Video" },
    { key: "PRODUCTIVITY",  zh: "效率",     en: "Productivity" },
    { key: "BUSINESS",      zh: "商务",     en: "Business" },
    { key: "EDUCATION",     zh: "教育",     en: "Education" },
    { key: "ENTERTAINMENT", zh: "娱乐",     en: "Entertainment" },
    { key: "LIFESTYLE",     zh: "生活",     en: "Lifestyle" },
    { key: "HEALTH_FITNESS",zh: "健康健身", en: "Health & Fitness" },
    { key: "MUSIC",        zh: "音乐",     en: "Music" },
    { key: "NEWS",         zh: "新闻",     en: "News" },
    { key: "WEATHER",      zh: "天气",     en: "Weather" },
    { key: "NAVIGATION",   zh: "导航",     en: "Navigation" },
    { key: "FINANCE",      zh: "财务",     en: "Finance" },
    { key: "SHOPPING",     zh: "购物",     en: "Shopping" },
    { key: "FOOD_DRINK",   zh: "美食饮品", en: "Food & Drink" },
    { key: "MEDICAL",      zh: "医疗",     en: "Medical" },
    { key: "REFERENCE",    zh: "参考",     en: "Reference" },
    { key: "SOCIAL_NETWORKING", zh: "社交", en: "Social Networking" },
    { key: "TRAVEL",       zh: "旅行",     en: "Travel" },
  ],
  game: [
    { key: "GAME_ACTION",     zh: "动作",     en: "Action" },
    { key: "GAME_ADVENTURE",  zh: "冒险",     en: "Adventure" },
    { key: "GAME_ARCADE",    zh: "街机",     en: "Arcade" },
    { key: "GAME_BOARD",     zh: "桌游",     en: "Board" },
    { key: "GAME_CARD",      zh: "卡牌",     en: "Card" },
    { key: "GAME_CASINO",    zh: "赌场",     en: "Casino" },
    { key: "GAME_PUZZLE",   zh: "益智",     en: "Puzzle" },
    { key: "GAME_RACING",    zh: "竞速",     en: "Racing" },
    { key: "GAME_ROLE_PLAYING", zh: "角色扮演", en: "Role Playing" },
    { key: "GAME_SIMULATION", zh: "模拟",     en: "Simulation" },
    { key: "GAME_SPORTS",    zh: "体育",     en: "Sports" },
    { key: "GAME_STRATEGY",  zh: "策略",     en: "Strategy" },
    { key: "GAME_TRIVIA",    zh: "问答",     en: "Trivia" },
    { key: "GAME_WORD",      zh: "文字",     en: "Word" },
    { key: "GAME_FAMILY",    zh: "家庭",     en: "Family" },
    { key: "GAME_CASUAL",    zh: "休闲",     en: "Casual" },
  ],
};

const COUNTRIES = [
  { key: "US", zh: "美国", en: "US", flag: "🇺🇸" },
  { key: "CN", zh: "中国", en: "CN", flag: "🇨🇳" },
  { key: "JP", zh: "日本", en: "JP", flag: "🇯🇵" },
  { key: "GB", zh: "英国", en: "GB", flag: "🇬🇧" },
  { key: "DE", zh: "德国", en: "DE", flag: "🇩🇪" },
];

/* ═══════════════════ 单个 App 卡片行（Insightrackr 风格） ═══════════════════ */
function AppCard({ app, index, onClick, showGrowth }) {
  const rank = app.rank ?? index + 1;
  const name = app.name || app.id || "未知应用";
  const dev = app.developer || app.store || "";
  const icon = app.icon_url || app.icon || "";
  const rating = app.rating;
  const isTop3 = rank <= 3;

  return (
    <div className="sr-card-row" onClick={() => onClick?.(app)} role="button" tabIndex={0}>
      {/* 排名号 */}
      <span className={`sr-rank ${isTop3 ? "rank-top3" : ""}`}>{rank}</span>

      {/* 大图标 */}
      <div className="app-icon-wrap">
        {icon ? (
          <img src={icon} alt="" className="app-icon-large"
            onError={(e) => { e.target.style.display = "none"; e.target.nextSibling?.style?.removeProperty('display'); }}
          />
        ) : null}
        {!icon && <div className="app-icon-placeholder">{name.charAt(0).toUpperCase()}</div>}
      </div>

      {/* 名称 + 开发商 + 评分 */}
      <div className="sr-info">
        <div className="sr-name">{name}</div>
        <div className="sr-dev">{dev}</div>
        {rating > 0 && (
          <div className="app-rating">
            <span className="star">&#9733;</span> {rating.toFixed(1)}
          </div>
        )}
        {/* 增长分析：排名变动指示器 */}
        {showGrowth && app.rank_change !== undefined && app.rank_change !== 0 && (
          <div style={{
            fontSize: 11, fontWeight: 600, marginTop: 2,
            color: app.rank_change > 0 ? 'var(--green)' : 'var(--red)',
            fontFamily: 'var(--font-en)'
          }}>
            {app.rank_change > 0 ? '↑' : '↓'} {Math.abs(app.rank_change)}
          </div>
        )}
        {showGrowth && app.has_changes && !app.rank_change && (
          <div style={{fontSize:10,color:'var(--orange)',marginTop:2}}>
            ● 有变更 / Changed
          </div>
        )}
      </div>

      {/* 右侧箭头 */}
      <CaretRightOutlined className="app-arrow" />
    </div>
  );
}

/* ═══════════════════ 主组件 ═══════════════════ */
export default function StoreRanking() {
  const navigate = useNavigate();
  const [store, setStore]       = useState("app_store");
  const [appType, setAppType]   = useState("app");         // 应用 / 游戏
  const [category, setCategory]   = useState("ART_AND_DESIGN");
  const [country, setCountry]     = useState("US");
  const [data, setData]           = useState([]);
  const [dataPaid, setDataPaid]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(false);
  const [error, setError]         = useState("");
  const [showGrowth, setShowGrowth] = useState(false);      // 增长分析开关

  /* 根据当前 appType 获取类别列表 */
  const currentCategories = CATEGORY_MAP[appType] || CATEGORY_MAP.app;

  /* 切换 appType 时重置 category 到该类型的第一个 */
  const handleAppTypeChange = (newType) => {
    setAppType(newType);
    const cats = CATEGORY_MAP[newType];
    if (cats && cats.length > 0) {
      setCategory(cats[0].key);
    }
  };

  /* 抓取数据（免费榜） */
  const fetchFree = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let apps = [];
      if (store === "app_store") {
        const res = await axios.get(`${API}/api/appstore/top20`, {
          params: { category, chart_type: "free", country },
        });
        apps = res.data.apps || [];
      } else if (store === "google_play") {
        const res = await axios.get(`${API}/api/googleplay/top`, {
          params: { category, country, chart_type: "free", limit: 20 },
        });
        apps = res.data.apps || [];
      } else {
        const [asRes, gpRes] = await Promise.all([
          axios.get(`${API}/api/appstore/top20`, { params: { category, chart_type: "free" } }),
          axios.get(`${API}/api/googleplay/top`, { params: { category, country, chart_type: "free", limit: 20 } }),
        ]);
        apps = mergeApps(asRes.data.apps || [], gpRes.data.apps || []);
      }
      setData(apps);
    } catch (err) {
      setError("数据加载失败 / Failed to load data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [store, category, country]);

  /* 抓取数据（付费榜） */
  const fetchPaid = useCallback(async () => {
    setLoadingPaid(true);
    try {
      let apps = [];
      if (store === "app_store") {
        const res = await axios.get(`${API}/api/appstore/top20`, {
          params: { category, chart_type: "paid", country },
        });
        apps = res.data.apps || [];
      } else if (store === "google_play") {
        const res = await axios.get(`${API}/api/googleplay/top`, {
          params: { category, country, chart_type: "paid", limit: 20 },
        });
        apps = res.data.apps || [];
      } else {
        const [asRes, gpRes] = await Promise.all([
          axios.get(`${API}/api/appstore/top20`, { params: { category, chart_type: "paid" } }),
          axios.get(`${API}/api/googleplay/top`, { params: { category, country, chart_type: "paid", limit: 20 } }),
        ]);
        apps = mergeApps(asRes.data.apps || [], gpRes.data.apps || []);
      }
      setDataPaid(apps);
    } catch {
      // 付费榜可选，失败不阻塞
    } finally {
      setLoadingPaid(false);
    }
  }, [store, category, country]);

  useEffect(() => { fetchFree(); fetchPaid(); }, [fetchFree, fetchPaid]);

  const mergeApps = (asApps, gpApps) => {
    const seen = new Set();
    const merged = [];
    for (const app of [...asApps, ...gpApps]) {
      const key = (app.name || app.id || "").toLowerCase().replace(/\s/g, "");
      if (key && !seen.has(key)) { seen.add(key); merged.push(app); }
    }
    return merged;
  };

  const handleAppClick = (app) => {
    navigate(`/appstore/${app.app_id || app.id}`);
  };

  const currentCatLabel = currentCategories.find(c => c.key === category)?.zh || category;
  const currentCountryFlag = COUNTRIES.find(c => c.key === country)?.flag || "";

  return (
    <div className="page-container">
      {/* ─── 标题栏 ─── */}
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
          <BarChartOutlined style={{ color: "#6c5ce7" }} />
          <span>应用商店排行榜</span>
          <span style={{ fontSize: 13, color: "#b2bec3", fontWeight: 400, marginLeft: 8 }}>
            Store Rankings
          </span>
        </h2>
      </div>

      {/* ─── 筛选工具栏（完全对齐 Insightrackr） ─── */}
      <div className="ranking-toolbar">
        {/* 日期标签 */}
        <div className="toolbar-date">
          <BarChartOutlined style={{ fontSize: 13 }} />
          {new Date().toISOString().slice(0, 10)}
        </div>

        {/* 商店选择 */}
        <select value={store} onChange={e => setStore(e.target.value)} className="toolbar-select">
          <option value="app_store">AppStore</option>
          <option value="google_play">Google Play</option>
          <option value="combined">合并</option>
        </select>

        {/* 应用 / 游戏 选择器（Insightrackr 核心） */}
        <select value={appType} onChange={e => handleAppTypeChange(e.target.value)} className="toolbar-select">
          {APP_TYPES.map(t => (
            <option key={t.key} value={t.key}>{t.zh}</option>
          ))}
        </select>

        {/* 类别选择（根据应用/游戏动态变化） */}
        <select value={category} onChange={e => setCategory(e.target.value)} className="toolbar-select">
          {currentCategories.map(c => (
            <option key={c.key} value={c.key}>{c.zh}</option>
          ))}
        </select>

        {/* 国家 */}
        <select value={country} onChange={e => setCountry(e.target.value)} className="toolbar-select toolbar-country">
          {COUNTRIES.map(c => (
            <option key={c.key} value={c.key}>{c.flag} {c.zh}</option>
          ))}
        </select>

        {/* 增长分析开关（Insightrackr 风格） */}
        <label className="growth-toggle">
          <LineChartOutlined style={{ fontSize: 13 }} />
          <span>增长分析</span>
          <input type="checkbox" checked={showGrowth} onChange={e => setShowGrowth(e.target.checked)} />
        </label>

        {/* 刷新按钮 */}
        <button className="toolbar-refresh" onClick={() => { fetchFree(); fetchPaid(); }} disabled={loading}>
          {loading ? <LoadingOutlined spin /> : <RocketOutlined />}
          {loading ? "加载中..." : "刷新"}
        </button>
      </div>

      {/* 提示文字 */}
      <div className="ranking-hint">
        提示：应用可点击代表该应用详情数据。 / Tap an app to view details & ad creative ideas.
      </div>

      {/* ─── 双列榜单（免费榜 | 付费榜） ─── */}
      <div className="ranking-grid">
        {/* ===== 免费榜 ===== */}
        <div className="ranking-column">
          <div className="column-header">
            <span className="column-icon free">免费</span>
            <span className="column-title">免费榜</span>
            <span className="column-sub">Free</span>
            {data.length > 0 && <span className="column-count">{data.length}</span>}
          </div>
          <div className="column-body">
            {loading && data.length === 0 ? (
              <div className="empty-state">
                <LoadingOutlined spin style={{ fontSize: 28, marginBottom: 12, color: "#6c5ce7" }} />
                <p>正在抓取数据...</p>
              </div>
            ) : error && data.length === 0 ? (
              <div className="empty-state error-state"><p>{error}</p></div>
            ) : data.length === 0 ? (
              <div className="empty-state"><p>暂无数据</p></div>
            ) : (
              data.map((app, idx) => (
                <AppCard key={app.app_id || app.id || idx} app={app} index={idx} onClick={handleAppClick} showGrowth={showGrowth} />
              ))
            )}
          </div>
        </div>

        {/* ===== 付费榜 ===== */}
        <div className="ranking-column">
          <div className="column-header">
            <span className="column-icon paid">付费</span>
            <span className="column-title">付费榜</span>
            <span className="column-sub">Paid</span>
            {dataPaid.length > 0 && <span className="column-count">{dataPaid.length}</span>}
          </div>
          <div className="column-body">
            {loadingPaid && dataPaid.length === 0 ? (
              <div className="empty-state">
                <LoadingOutlined spin style={{ fontSize: 28, marginBottom: 12, color: "#fdcb6e" }} />
                <p>正在抓取...</p>
              </div>
            ) : dataPaid.length === 0 ? (
              <div className="empty-state">
                <p>{store === "combined" ? "请选择单一商店查看付费榜" : "暂无数据"}</p>
              </div>
            ) : (
              dataPaid.map((app, idx) => (
                <AppCard key={app.app_id || app.id || idx} app={app} index={idx} onClick={handleAppClick} showGrowth={showGrowth} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 底部统计信息 */}
      {!loading && data.length > 0 && (
        <div className="ranking-footer">
          <span>共 {data.length + dataPaid.length} 款应用 · {currentCatLabel} · {COUNTRIES.find(c=>c.key===country)?.zh||country}</span>
          <span className="footer-badge">
            {store === "app_store" && <AppleOutlined />}
            {store === "google_play" && <GoogleOutlined />}
            {store === "combined" && <BarChartOutlined />}
          </span>
        </div>
      )}
    </div>
  );
}
