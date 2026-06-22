import { useState, useEffect, useCallback } from "react";
import {
  PlayCircleOutlined,
  FacebookOutlined,
  GoogleOutlined,
  SearchOutlined,
  FilterOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";

const API = "";

export default function AdLibrary() {
  const navigate = useNavigate();
  const [query, setQuery]         = useState("");
  const [platform, setPlatform]     = useState("meta"); // meta | google | tiktok
  const [ads, setAds]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [selectedAd, setSelectedAd] = useState(null); // 弹窗播放

  const fetchAds = useCallback(async () => {
    if (!query.trim()) {
      setError("请输入广告主名称 / Please enter advertiser name");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let results = [];
      if (platform === "meta") {
        const res = await axios.get(`${API}/api/meta/ads`, {
          params: { advertiser: query.trim(), country: "US", limit: 20 },
        });
        results = res.data.ads || [];
        if (res.data.has_new_ads) {
          setError(`🆕 ${query} 有 ${res.data.new_count} 条新广告！ / ${res.data.new_count} new ads detected!`);
        }
      } else if (platform === "google") {
        // Google Ads Transparency Center 引导链接
        results = [{
          ad_id:       "google_placeholder",
          advertiser:   query,
          title:        "请访问 Google 广告透明度中心查看",
          title_en:     "Visit Google Ads Transparency Center",
          body:        `Google Ads Transparency Center 数据需通过网页查看。`,
          body_en:      "Google Ads Transparency Center data requires web access.",
          snapshot_url: `https://transparencycenter.google.com/?hl=en&type=ADS&query=${encodeURIComponent(query)}`,
          platforms_zh: ["Google Search", "YouTube"],
          first_seen:   "",
          last_seen:    "",
          creative_type_zh: "图片/视频",
          is_placeholder: true,
        }];
      } else {
        // 仅支持 Meta 和 Google
        setError("当前仅支持 Meta (Facebook/Instagram) 广告库 / Only Meta Ad Library is supported currently");
        return;
      }
      setAds(results);
    } catch (err) {
      setError("查询失败 / Query failed");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [query, platform]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchAds();
  };

  // 点击广告卡片 → 弹窗播放
  const openAdModal = (ad) => {
    if (ad.is_placeholder) {
      // 跳转到对应平台
      if (ad.snapshot_url) window.open(ad.snapshot_url, "_blank");
      return;
    }
    setSelectedAd(ad);
  };

  return (
    <div className="page-container">
      {/* 顶部标题 + 搜索栏 */}
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
          <PlayCircleOutlined style={{ color: "#fdcb6e" }} />
          <span>广告素材库</span>
          <span style={{ fontSize: 13, color: "#b2bec3", fontWeight: 400, marginLeft: 8 }}>
            Ad Creative Library
          </span>
        </h2>

        <form onSubmit={handleSearch} style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* 平台选择 */}
          <div style={{
            display: "inline-flex", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 3,
          }}>
            {[
              { key: "meta",   icon: <FacebookOutlined />, zh: "Meta",  en: "Meta (FB/IG)" },
              { key: "google", icon: <GoogleOutlined />,   zh: "Google", en: "Google Ads"      },
              { key: "google", icon: <GoogleOutlined />,   zh: "Google", en: "Google Ads"      },
            ].map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlatform(p.key)}
                style={{
                  padding: "6px 12px", borderRadius: 6, border: "none",
                  background: platform === p.key ? "rgba(108,92,231,0.5)" : "transparent",
                  color: platform === p.key ? "#fff" : "#b2bec3", cursor: "pointer",
                  fontSize: 12, display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {p.icon} {p.zh}
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="输入广告主名称 / Enter advertiser name (e.g. Canva)"
            style={{
              flex: 1, minWidth: 240, padding: "8px 14px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)", background: "#2d3436",
              color: "#dfe6e9", fontSize: 13, outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: loading || !query.trim()
                ? "rgba(108,92,231,0.3)"
                : "rgba(108,92,231,0.8)",
              color: "#fff", cursor: loading || !query.trim() ? "default" : "pointer",
              fontSize: 13, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <SearchOutlined />
            {loading ? "查询中..." : "搜索 / Search"}
          </button>
        </form>
      </div>

      {/* 错误 / 告警提示 */}
      {error && (
        <div style={{
          margin: "16px 0", padding: "10px 16px", borderRadius: 8,
          background: error.includes("🆕")
            ? "rgba(0,184,148,0.12)" : "rgba(214,48,49,0.12)",
          border: `1px solid ${error.includes("🆕") ? "rgba(0,184,148,0.3)" : "rgba(214,48,49,0.3)"}`,
          color: error.includes("🆕") ? "#00b894" : "#ff7675",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* 统计条 */}
      {ads.length > 0 && !ads[0]?.is_placeholder && (
        <div style={{
          margin: "16px 0", display: "flex", gap: 16, flexWrap: "wrap",
        }}>
          {[
            { label_zh: "广告总数", label_en: "Total Ads",   value: ads.length,         color: "#6c5ce7" },
            { label_zh: "活跃广告", label_en: "Active Ads", value: ads.filter(a => !a.end_date).length, color: "#00b894" },
            { label_zh: "视频广告", label_en: "Video Ads",  value: ads.filter(a => (a.creative_type || "").includes("视频")).length, color: "#fdcb6e" },
          ].map(s => (
            <div key={s.label_en} style={{
              padding: "10px 16px", borderRadius: 10,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
              minWidth: 140,
            }}>
              <div style={{ fontSize: 11, color: "#b2bec3", marginBottom: 4 }}>{s.label_zh} / {s.label_en}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 广告卡片网格 */}
      <div style={{
        marginTop: 16, display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}>
        {loading && (
          <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "#b2bec3" }}>
            <PlayCircleOutlined spin style={{ fontSize: 24, marginBottom: 8 }} />
            <div>正在查询广告库... / Querying ad library...</div>
          </div>
        )}

        {!loading && ads.map((ad, idx) => (
          <div
            key={ad.ad_id || idx}
            onClick={() => openAdModal(ad)}
            style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)", padding: 0,
              cursor: "pointer", overflow: "hidden",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(108,92,231,0.4)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}
          >
            {/* 视频缩略图 / 占位 */}
            <div style={{
              height: 160, background: "rgba(0,0,0,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
            }}>
              {ad.snapshot_url && !ad.is_placeholder ? (
                <>
                  <img
                    src={`https://placehold.co/320x160/2d3436/fdcb6e?text=${encodeURIComponent((ad.title || "").substring(0, 20))}`}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(0)" }}
                    onError={e => e.target.style.display = "none"}
                  />
                  {/* 播放按钮覆盖层 */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(0,0,0,0.3)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <PlayCircleOutlined style={{ fontSize: 40, color: "rgba(255,255,255,0.8)" }} />
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <FilterOutlined style={{ fontSize: 28, color: "#636e72" }} />
                  <div style={{ fontSize: 11, color: "#b2bec3", marginTop: 8 }}>
                    {ad.platforms_zh?.join(", ") || "Facebook / Instagram"}
                  </div>
                </div>
              )}
              {/* 新广告标签 */}
              {ad.first_seen && (
                <div style={{
                  position: "absolute", top: 8, left: 8,
                  padding: "2px 8px", borderRadius: 4,
                  background: "rgba(214,48,49,0.9)", color: "#fff",
                  fontSize: 10, fontWeight: 600,
                }}>
                  <ClockCircleOutlined /> {ad.first_seen}
                </div>
              )}
            </div>

            {/* 广告信息 */}
            <div style={{ padding: "10px 14px" }}>
              <div style={{
                fontWeight: 600, fontSize: 13, color: "#dfe6e9",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                marginBottom: 6,
              }}>
                {(ad.title || ad.body || "").substring(0, 50)}
                {((ad.title || ad.body || "").length > 50) && "..."}
              </div>
              <div style={{ fontSize: 11, color: "#b2bec3", marginBottom: 8, lineHeight: 1.5 }}>
                {ad.body && ad.body.length > 80 ? ad.body.substring(0, 80) + "..." : (ad.body || "")}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: "#636e72" }}>
                  {ad.platforms_zh?.join(", ") || "—"}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); openAdModal(ad); }}
                  style={{
                    padding: "3px 10px", borderRadius: 4, border: "1px solid rgba(108,92,231,0.4)",
                    background: "transparent", color: "#a29bfe", cursor: "pointer", fontSize: 11,
                  }}
                >
                  <EyeOutlined /> 查看 / View
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* 空状态 */}
        {!loading && ads.length === 0 && !error && (
          <div style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "#636e72" }}>
            <SearchOutlined style={{ fontSize: 40, marginBottom: 12, display: "block" }} />
            <div style={{ fontSize: 14, marginBottom: 4 }}>输入广告主名称开始搜索</div>
            <div style={{ fontSize: 12 }}>Enter advertiser name to start searching</div>
            <div style={{ fontSize: 11, marginTop: 12, color: "#b2bec3" }}>
              示例 / Examples: Canva, PicsArt, CapCut, Notion
            </div>
          </div>
        )}
      </div>

      {/* 视频播放弹窗 */}
      {selectedAd && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }} onClick={() => setSelectedAd(null)}>
          <div
            style={{
              background: "#2d3436", borderRadius: 16, maxWidth: 720, width: "100%",
              maxHeight: "90vh", overflow: "auto", padding: 24, position: "relative",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={() => setSelectedAd(null)}
              style={{
                position: "absolute", top: 12, right: 12,
                background: "rgba(255,255,255,0.1)", border: "none",
                color: "#dfe6e9", width: 32, height: 32,
                borderRadius: "50%", cursor: "pointer", fontSize: 16,
              }}
            >✕</button>

            <h3 style={{ margin: "0 0 12px 0", color: "#dfe6e9", fontSize: 16 }}>
              {selectedAd.title || selectedAd.advertiser}
            </h3>
            <p style={{ fontSize: 13, color: "#b2bec3", lineHeight: 1.6, marginBottom: 16 }}>
              {selectedAd.body || selectedAd.body_en || ""}
            </p>

            {/* 视频播放器（如果有 snapshot_url） */}
            {selectedAd.snapshot_url && !selectedAd.is_placeholder ? (
              <div style={{
                background: "#000", borderRadius: 12, overflow: "hidden",
                aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <iframe
                  src={selectedAd.snapshot_url}
                  title="Ad Preview"
                  style={{ width: "100%", height: "100%", border: "none" }}
                  allow="autoplay; encrypted-media"
                />
              </div>
            ) : (
              <div style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 12,
                padding: 40, textAlign: "center", color: "#b2bec3",
              }}>
                <p>此广告素材暂无预览，请访问原平台查看</p>
                <p style={{ fontSize: 12 }}>Preview not available. Visit original platform.</p>
                {selectedAd.snapshot_url && (
                  <a
                    href={selectedAd.snapshot_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#a29bfe", fontSize: 13, marginTop: 12, display: "inline-block" }}
                  >
                    访问原平台 / Visit Platform →
                  </a>
                )}
              </div>
            )}

            {/* 广告详情 */}
            <div style={{
              marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
              fontSize: 12, color: "#b2bec3",
            }}>
              <div>
                <span style={{ color: "#636e72" }}>广告主 / Advertiser: </span>
                <span style={{ color: "#dfe6e9" }}>{selectedAd.advertiser || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#636e72" }}>平台 / Platforms: </span>
                <span style={{ color: "#dfe6e9" }}>{(selectedAd.platforms_zh || []).join(", ") || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#636e72" }}>投放开始 / Start: </span>
                <span style={{ color: "#dfe6e9" }}>{selectedAd.start_date || selectedAd.first_seen || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#636e72" }}>投放结束 / End: </span>
                <span style={{ color: "#dfe6e9" }}>{selectedAd.end_date || selectedAd.last_seen || "投放中 / Active"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
