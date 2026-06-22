import { useState, useEffect, useCallback } from "react";
import {
  BarChartOutlined,
  GoogleOutlined,
  AppleOutlined,
  RocketOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  PlusOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";

const API = "";

const CATEGORIES = [
  { key: "TOOLS",        zh: "工具",     en: "Tools" },
  { key: "ART_AND_DESIGN", zh: "图形设计", en: "Art & Design" },
  { key: "PHOTOGRAPHY",  zh: "摄影",     en: "Photography" },
  { key: "PRODUCTIVITY",  zh: "效率",     en: "Productivity" },
  { key: "BUSINESS",      zh: "商务",     en: "Business" },
];

const COUNTRIES = [
  { key: "US", zh: "美国", en: "United States" },
  { key: "CN", zh: "中国", en: "China" },
  { key: "JP", zh: "日本", en: "Japan" },
  { key: "GB", zh: "英国", en: "United Kingdom" },
  { key: "DE", zh: "德国", en: "Germany" },
];

export default function StoreRanking() {
  const navigate = useNavigate();
  const [store, setStore]   = useState("app_store");   // app_store | google_play | combined
  const [category, setCategory] = useState("TOOLS");
  const [country, setCountry]   = useState("US");
  const [chartType, setChartType] = useState("free");
  const [limit, setLimit] = useState(20);
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let apps = [];
      if (store === "app_store") {
        const res = await axios.get(`${API}/api/appstore/top20`, {
          params: { category: category },
        });
        apps = res.data.apps || [];
      } else if (store === "google_play") {
        const res = await axios.get(`${API}/api/googleplay/top`, {
          params: { category: category, country, chart_type: chartType, limit },
        });
        apps = res.data.apps || [];
      } else {
        // combined
        const [asRes, gpRes] = await Promise.all([
          axios.get(`${API}/api/appstore/top20`, {
            params: { category: category },
          }),
          axios.get(`${API}/api/googleplay/top`, {
            params: { category: category, country, chart_type: chartType, limit },
          }),
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
  }, [store, category, country, chartType, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const mergeApps = (asApps, gpApps) => {
    const seen = new Set();
    const merged = [];
    for (const app of [...asApps, ...gpApps]) {
      const key = (app.name || app.id || "").toLowerCase().replace(/\s/g, "");
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(app);
      }
    }
    return merged;
  };

  const getChangeIcon = (app) => {
    const ct = app.change_type || app.change_label_zh || "";
    if (ct.includes("上升") || ct.includes("Up"))   return <CaretUpOutlined    style={{ color: "#00b894" }} />;
    if (ct.includes("下降") || ct.includes("Down")) return <CaretDownOutlined  style={{ color: "#d63031" }} />;
    if (ct.includes("新上榜") || ct.includes("New"))  return <PlusOutlined       style={{ color: "#0984e3" }} />;
    if (ct.includes("跌出") || ct.includes("Drop")) return <MinusOutlined      style={{ color: "#e17055" }} />;
    return null;
  };

  return (
    <div className="page-container">
      {/* 顶部标题 + 筛选栏 */}
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
          <BarChartOutlined style={{ color: "#6c5ce7" }} />
          <span>双商店榜单</span>
          <span style={{ fontSize: 13, color: "#b2bec3", fontWeight: 400, marginLeft: 8 }}>
            Dual Store Rankings
          </span>
        </h2>

        <div className="filter-bar" style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* 商店切换 */}
          <div className="store-tabs" style={{ display: "inline-flex", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 3 }}>
            {[
              { key: "app_store",  icon: <AppleOutlined />,    zh: "App Store",  en: "App Store"  },
              { key: "google_play", icon: <GoogleOutlined />,   zh: "Google Play", en: "Google Play" },
              { key: "combined",   icon: <BarChartOutlined />, zh: "合并",       en: "Combined"  },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setStore(s.key)}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "none",
                  background: store === s.key ? "rgba(108,92,231,0.5)" : "transparent",
                  color: store === s.key ? "#fff" : "#b2bec3", cursor: "pointer",
                  fontSize: 13, display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {s.icon} {s.zh}
              </button>
            ))}
          </div>

          {/* 类别 */}
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                     background: "#2d3436", color: "#dfe6e9", fontSize: 13 }}
          >
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.zh} / {c.en}</option>
            ))}
          </select>

          {/* 国家 */}
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                     background: "#2d3436", color: "#dfe6e9", fontSize: 13 }}
          >
            {COUNTRIES.map(c => (
              <option key={c.key} value={c.key}>{c.zh} / {c.en}</option>
            ))}
          </select>

          {/* 榜单类型 */}
          <select
            value={chartType}
            onChange={e => setChartType(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                     background: "#2d3436", color: "#dfe6e9", fontSize: 13 }}
          >
            <option value="free">免费榜 / Free</option>
            <option value="paid">付费榜 / Paid</option>
          </select>

          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: loading ? "rgba(108,92,231,0.3)" : "rgba(108,92,231,0.8)",
              color: "#fff", cursor: loading ? "default" : "pointer", fontSize: 13,
            }}
          >
            {loading ? "加载中..." : "刷新 / Refresh"}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{
          margin: "16px 0", padding: "10px 16px", borderRadius: 8,
          background: "rgba(214,48,49,0.15)", border: "1px solid rgba(214,48,49,0.3)",
          color: "#ff7675", fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* 榜单表格 */}
      <div style={{
        marginTop: 16, background: "rgba(255,255,255,0.04)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden",
      }}>
        {/* 表头 */}
        <div style={{
          display: "grid", gridTemplateColumns: "50px 1fr 100px 80px 100px 120px",
          padding: "10px 16px", background: "rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "#b2bec3",
        }}>
          <span>排名</span>
          <span>应用名称 / App Name</span>
          <span>评分</span>
          <span>版本</span>
          <span>变更</span>
          <span>操作</span>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "#b2bec3" }}>
            <RocketOutlined spin style={{ fontSize: 24, marginBottom: 8 }} />
            <div>正在抓取数据... / Fetching data...</div>
          </div>
        )}

        {/* 数据行 */}
        {!loading && data.map((app, idx) => (
          <div
            key={app.id || app.app_id || idx}
            style={{
              display: "grid", gridTemplateColumns: "50px 1fr 100px 80px 120px 120px",
              padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              fontSize: 13, alignItems: "center",
              background: app.change_type && app.change_type !== "none"
                ? "rgba(108,92,231,0.08)" : "transparent",
            }}
          >
            {/* 排名 */}
            <span style={{
              fontWeight: 700, fontSize: 15,
              color: app.rank <= 3 ? "#fdcb6e" : (app.rank <= 10 ? "#dfe6e9" : "#b2bec3"),
            }}>
              #{app.rank || idx + 1}
            </span>

            {/* 应用名称 + 图标 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {app.icon && (
                <img
                  src={app.icon}
                  alt=""
                  style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, objectFit: "cover" }}
                  onError={e => e.target.style.display = "none"}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#dfe6e9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {app.name || app.id || "未知应用"}
                </div>
                <div style={{ fontSize: 11, color: "#b2bec3", marginTop: 2 }}>
                  {app.developer || app.store || ""}
                </div>
              </div>
            </div>

            {/* 评分 */}
            <span style={{ color: "#fdcb6e" }}>
              {app.rating ? `${app.rating.toFixed(1)} ★` : "—"}
            </span>

            {/* 版本 */}
            <span style={{ color: "#b2bec3", fontSize: 12 }}>{app.version || "—"}</span>

            {/* 变更标签 */}
            <div>
              {app.change_type && app.change_type !== "none" ? (
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 4,
                  background: app.change_type === "new_entry"
                    ? "rgba(9,132,227,0.2)" : "rgba(0,184,148,0.2)",
                  color: app.change_type === "new_entry" ? "#0984e3" : "#00b894",
                }}>
                  {getChangeIcon(app)} {app.change_label_zh || app.change_label_en || ""}
                </span>
              ) : (
                <span style={{ color: "#636e72", fontSize: 11 }}>—</span>
              )}
            </div>

            {/* 操作 */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => navigate(`/app/${app.id || app.app_id}`)}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(108,92,231,0.4)",
                  background: "transparent", color: "#a29bfe", cursor: "pointer", fontSize: 11,
                }}
              >
                详情 / Detail
              </button>
              <button
                onClick={() => {
                  // 跳转到广告库页面，预填广告主名称
                  const name = (app.name || app.id || "").replace(/\s*\(.*?\)\s*/, "").trim();
                  navigate(`/creative?q=${encodeURIComponent(name)}`);
                }}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(253,203,110,0.4)",
                  background: "transparent", color: "#fdcb6e", cursor: "pointer", fontSize: 11,
                }}
              >
                广告 / Ads
              </button>
            </div>
          </div>
        ))}

        {/* 空状态 */}
        {!loading && data.length === 0 && !error && (
          <div style={{ padding: 40, textAlign: "center", color: "#636e72" }}>
            暂无数据 / No data available
          </div>
        )}
      </div>
    </div>
  );
}
