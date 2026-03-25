import { useState, useCallback, useEffect, useRef } from "react";
import type { ConnectionState, LeaderboardEntry } from "../protocol";
import type { UserProfile } from "../App";
import type { Settings } from "../game/settings";
import { TokenReveal } from "./TokenReveal";
import { EffectTokenReveal } from "./EffectTokenReveal";
import { DailyGoals } from "./DailyGoals";
import { setSkinFiles, getSkinFile } from "../skinFileMap";
import { CURSOR_LIST, renderCursorToDataURL } from "../game/cursors";
import "./Lobby.css";

interface SkinAccessEntry {
  name: string;
  file: string;
  category: string;
  rarity: string;
  minLevel?: number;
  accessible: boolean;
  reason?: string;
  tokens?: number;
  tokensNeed?: number;
}

interface EffectAccessEntry {
  id: string;
  label: string;
  description: string;
  category: string;
  accessible: boolean;
  reason?: string;
  tokens?: number;
  tokensNeed?: number;
}

interface TopUserEntry {
  name: string;
  points: number;
  level: number;
  topScore?: number;
}

interface LobbyProps {
  connectionState: ConnectionState;
  onSpawn: (name: string, skin: string, effect: string) => void;
  onSpectate: () => void;
  canSpawn: boolean;
  serverBaseUrl: string;
  leaderboard: LeaderboardEntry[];
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  authProvider: string | null;
  displayName: string | null;
  displayPicture: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
  onOpenShop: () => void;
  onOpenMarketplace: () => void;
  onOpenClan: () => void;
  sessionToken: string | null;
  userLevel: number;
  xpCurrent: number;
  xpNeeded: number;
  onOpenOptions: () => void;
  onOpenHowToPlay: () => void;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  multiboxEnabled: boolean;
  onMultiboxToggle: () => void;
  pendingTokens: Array<{skinName: string}>;
  pendingEffectTokens: Array<{effectName: string}>;
  serverBaseUrlForTokens: string;
  sessionTokenForTokens: string | null;
  onTokenRevealDone: () => void;
  onEffectTokenRevealDone: () => void;
}

export function Lobby({
  connectionState,
  onSpawn,
  onSpectate,
  canSpawn,
  serverBaseUrl,
  leaderboard,
  isAuthenticated,
  userProfile,
  authProvider,
  displayName,
  displayPicture,
  onSignIn,
  onSignOut,
  isAdmin,
  onOpenAdmin,
  onOpenShop,
  onOpenMarketplace,
  onOpenClan,
  sessionToken,
  userLevel,
  xpCurrent,
  xpNeeded,
  onOpenOptions,
  onOpenHowToPlay,
  settings,
  onSettingsChange,
  multiboxEnabled,
  onMultiboxToggle,
  pendingTokens,
  pendingEffectTokens,
  serverBaseUrlForTokens,
  sessionTokenForTokens,
  onTokenRevealDone,
  onEffectTokenRevealDone,
}: LobbyProps) {
  const [name, setName] = useState(() => localStorage.getItem("h4kmally-name") || "");
  const [skin, setSkin] = useState(() => localStorage.getItem("h4kmally-skin") || "");
  const [effect, setEffect] = useState(() => localStorage.getItem("h4kmally-effect") || "");

  // Persist name, skin, and effect to localStorage
  useEffect(() => {
    localStorage.setItem("h4kmally-name", name);
  }, [name]);

  useEffect(() => {
    localStorage.setItem("h4kmally-skin", skin);
  }, [skin]);

  useEffect(() => {
    localStorage.setItem("h4kmally-effect", effect);
  }, [effect]);
  const [skins, setSkins] = useState<SkinAccessEntry[]>([]);
  const [effectEntries, setEffectEntries] = useState<EffectAccessEntry[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showEffectPicker, setShowEffectPicker] = useState(false);
  const [lbTab, setLbTab] = useState<"top" | "lb" | "goals">("top");
  const [topUsers, setTopUsers] = useState<TopUserEntry[]>([]);
  const [skinCategoryTab, setSkinCategoryTab] = useState<string>("all");
  const [effectCategoryTab, setEffectCategoryTab] = useState<string>("all");
  const [showCursorPicker, setShowCursorPicker] = useState(false);
  const cursorPreviewCache = useRef<Map<string, string>>(new Map());
  const [customSkinSlots, setCustomSkinSlots] = useState(0);
  const [uploadingSkin, setUploadingSkin] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const skinFileInput = useRef<HTMLInputElement>(null);

  // Load skins with access info (on mount and whenever picker is opened)
  useEffect(() => {
    if (!serverBaseUrl) return;
    const url = sessionToken
      ? `${serverBaseUrl}/api/skins/access?session=${encodeURIComponent(sessionToken)}`
      : `${serverBaseUrl}/api/skins/access`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.skins) {
          setSkins(data.skins);
          setSkinFiles(data.skins);
        }
        if (typeof data.customSkinSlots === "number") {
          setCustomSkinSlots(data.customSkinSlots);
        }
      })
      .catch(() => {});
  }, [serverBaseUrl, showPicker, sessionToken]);

  // Load effects with access info
  useEffect(() => {
    if (!serverBaseUrl) return;
    const url = sessionToken
      ? `${serverBaseUrl}/api/effects/access?session=${encodeURIComponent(sessionToken)}`
      : `${serverBaseUrl}/api/effects/access`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.effects) {
          setEffectEntries(data.effects);
        }
      })
      .catch(() => {});
  }, [serverBaseUrl, showEffectPicker, sessionToken]);

  // Load top users (all-time high scorers)
  useEffect(() => {
    if (!serverBaseUrl) return;
    fetch(`${serverBaseUrl}/api/top-users?limit=20`)
      .then((r) => r.json())
      .then((data) => {
        if (data.topUsers && Array.isArray(data.topUsers)) setTopUsers(data.topUsers);
        else if (Array.isArray(data)) setTopUsers(data);
      })
      .catch(() => {});
  }, [serverBaseUrl]);

  const handlePlay = useCallback(() => {
    onSpawn(name || "unnamed", skin, effect);
  }, [name, skin, effect, onSpawn]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && canSpawn) {
        handlePlay();
      }
    },
    [canSpawn, handlePlay]
  );

  const selectSkin = useCallback((skinName: string) => {
    setSkin(skinName);
    setShowPicker(false);
  }, []);

  const handleCustomSkinUpload = useCallback(async (file: File) => {
    if (!serverBaseUrl || !sessionToken) return;
    setUploadingSkin(true);
    setUploadError(null);
    const skinName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
    const form = new FormData();
    form.append("file", file);
    form.append("name", skinName);
    try {
      const resp = await fetch(
        `${serverBaseUrl}/api/skins/upload?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST", body: form }
      );
      const data = await resp.json();
      if (!resp.ok) {
        setUploadError(data.error || "Upload failed");
      } else {
        // Refresh skins list to show the new custom skin
        setCustomSkinSlots(s => Math.max(0, s - 1));
        setShowPicker(false);
        setTimeout(() => setShowPicker(true), 100);
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploadingSkin(false);
    }
  }, [serverBaseUrl, sessionToken]);

  return (
    <div className="lobby-overlay" onKeyDown={handleKeyDown}>
      <div className="lobby-layout">
        {/* ── Left panel: Profile ── */}
        <div className="lobby-panel-left">
          <div className="profile-header">
            <div className="profile-avatar">
              {isAuthenticated && displayPicture ? (
                <img src={displayPicture} alt="avatar" />
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              )}
            </div>
            <div className="profile-info">
              <div className="profile-name">
                {isAuthenticated
                  ? (displayName || userProfile?.name || "User")
                  : "Guest"}
              </div>
              <div className="profile-level">
                {isAuthenticated
                  ? `Level ${userLevel}${authProvider ? ` · ${authProvider.charAt(0).toUpperCase() + authProvider.slice(1)}` : ""}`
                  : "Not signed in"}
              </div>
            </div>
          </div>

          <div className="xp-bar">
            <div
              className="xp-bar-fill"
              style={{
                width: userProfile && xpNeeded > 0
                  ? `${Math.min(100, (xpCurrent / xpNeeded) * 100)}%`
                  : "0%",
              }}
            />
            <div className="xp-bar-text">
              {userProfile
                ? `${xpCurrent.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`
                : "0 / 0 XP"}
            </div>
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <span>Points</span>
              <span className="profile-stat-value">
                {userProfile ? userProfile.points.toLocaleString() : "0"}
              </span>
            </div>
            <div className="profile-stat">
              <span>Games Played</span>
              <span className="profile-stat-value">
                {userProfile ? userProfile.gamesPlayed.toLocaleString() : "0"}
              </span>
            </div>
            <div className="profile-stat">
              <span>Top Score</span>
              <span className="profile-stat-value">
                {userProfile ? userProfile.topScore.toLocaleString() : "0"}
              </span>
            </div>
          </div>

          <button className="btn-signin" onClick={isAuthenticated ? onSignOut : onSignIn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isAuthenticated ? (
                <>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </>
              ) : (
                <>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </>
              )}
            </svg>
            {isAuthenticated ? "Sign out" : "Sign in"}
          </button>

          {isAuthenticated && (
            <button className="btn-shop" onClick={onOpenShop}>
              🛒 Shop
            </button>
          )}

          <button className="btn-shop" onClick={onOpenMarketplace} style={{ background: "rgba(20,90,50,0.55)", borderColor: "rgba(39,174,96,0.5)" }}>
            🏪 Marketplace
          </button>

          {isAdmin && (
            <button className="btn-admin" onClick={onOpenAdmin}>
              Admin Panel
            </button>
          )}
        </div>

        {/* ── Center panel: Main menu ── */}
        <div className="lobby-panel-center">
          <h1 className="lobby-title">h4kmally</h1>

          {connectionState === "disconnected" && (
            <div className="lobby-section">
              <p className="lobby-status">Connecting to server...</p>
              <div className="loading-bar">
                <div className="loading-bar-progress" />
              </div>
            </div>
          )}

          {connectionState === "connecting" && (
            <div className="lobby-section">
              <p className="lobby-status">Connecting...</p>
              <div className="loading-bar">
                <div className="loading-bar-progress" />
              </div>
            </div>
          )}

          {connectionState === "connected" && (
            <div className="lobby-section">
              {/* Skin circle + effect selector + nickname */}
              <div className="form-group-flex">
                <div
                  className="skin-select-icon"
                  onClick={() => setShowPicker(true)}
                  title={skin || "Select skin"}
                >
                  {skin ? (
                    <img
                      src={`${serverBaseUrl}/skins/${getSkinFile(skin)}`}
                      alt={skin}
                    />
                  ) : null}
                  <span className="skin-plus">+</span>
                </div>
                <div
                  className={`effect-select-icon ${effect ? "active" : ""}`}
                  onClick={() => setShowEffectPicker(!showEffectPicker)}
                  title={effect ? effectEntries.find(e => e.id === effect)?.label ?? effect : "Select effect"}
                >
                  <span className="effect-icon">✦</span>
                  {effect && <span className="effect-active-dot" />}
                </div>
                <div
                  className={`cursor-select-icon ${settings.cursor ? "active" : ""}`}
                  onClick={() => setShowCursorPicker(!showCursorPicker)}
                  title={settings.cursor ? CURSOR_LIST.find(c => c.id === settings.cursor)?.label ?? settings.cursor : "Select cursor"}
                >
                  <span className="cursor-icon">⊕</span>
                  {settings.cursor && <span className="cursor-active-dot" />}
                </div>
                <div className="form-group-fields">
                  <input
                    className="lobby-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nickname"
                    maxLength={15}
                    autoFocus
                  />
                </div>
              </div>

              {/* Effect picker dropdown */}

              <div className="mode-btns">
                <button
                  className="btn-play"
                  onClick={handlePlay}
                  disabled={!canSpawn}
                >
                  Play
                </button>
                <button
                  className="btn-spectate"
                  onClick={onSpectate}
                  disabled={connectionState !== "connected"}
                >
                  Spectate
                </button>
              </div>

              <label className="multibox-toggle" title="Enable a second cell group you control with Tab">
                <input
                  type="checkbox"
                  checked={multiboxEnabled}
                  onChange={onMultiboxToggle}
                  disabled={connectionState !== "connected"}
                />
                <span>Multibox</span>
              </label>
            </div>
          )}

          <div className="lobby-footer">
            <button className="btn-howtoplay" onClick={onOpenHowToPlay}>&#x2753; How to Play</button>
            <button className="btn-options" onClick={onOpenOptions} title="Options (Esc)">&#9881; Options</button>
            {connectionState === "connecting" && <span className="lobby-connection-state">Connecting…</span>}
          </div>
        </div>

        {/* ── Right panel: Leaderboard ── */}
        <div className="lobby-panel-right">
          <div className="lb-tabs">
            <button
              className={`lb-tab ${lbTab === "lb" ? "active" : ""}`}
              onClick={() => setLbTab("lb")}
            >
              Leaderboard
            </button>
            <button
              className={`lb-tab ${lbTab === "top" ? "active" : ""}`}
              onClick={() => setLbTab("top")}
            >
              Top Users
            </button>
            {isAuthenticated && (
              <button
                className={`lb-tab ${lbTab === "goals" ? "active" : ""}`}
                onClick={() => setLbTab("goals")}
              >
                Goals
              </button>
            )}
          </div>
          <div className="lb-inner">
            {lbTab === "lb" && (
              <>
                {leaderboard.length === 0 ? (
                  <div className="lb-empty">No players online</div>
                ) : (
                  <table className="lb-table">
                    <tbody>
                      {leaderboard.map((entry) => (
                        <tr key={entry.rank}>
                          <td>{entry.rank}.</td>
                          <td>{entry.name || "unnamed"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
            {lbTab === "top" && (
              <>
                {topUsers.length === 0 ? (
                  <div className="lb-empty">No data yet</div>
                ) : (
                  <table className="lb-table top-users-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>XP</th>
                        <th>Top</th>
                        <th>Lv</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topUsers.map((user, i) => (
                        <tr key={i}>
                          <td className="top-rank">{i + 1}.</td>
                          <td className="top-name">{user.name}</td>
                          <td className="top-points">{user.points.toLocaleString()}</td>
                          <td className="top-score">{(user.topScore ?? 0).toLocaleString()}</td>
                          <td className="top-level">Lv{user.level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
            {lbTab === "goals" && isAuthenticated && serverBaseUrl && sessionToken && (
              <DailyGoals
                serverBaseUrl={serverBaseUrl}
                sessionToken={sessionToken}
              />
            )}
          </div>

          {isAuthenticated && (
            <button
              className="clan-browse-btn"
              onClick={onOpenClan}
            >
              ⚔️ Clans
            </button>
          )}
        </div>
      </div>

      {/* ── Skin Picker Modal ── */}
      {showPicker && (
        <div className="skin-picker-overlay" onClick={() => setShowPicker(false)}>
          <div className="skin-picker-panel" onClick={(e) => e.stopPropagation()}>
            <div className="skin-picker-header">
              <h2>Skins</h2>
              <button
                className="skin-picker-close"
                onClick={() => setShowPicker(false)}
              >
                &times;
              </button>
            </div>

            {/* Category tabs */}
            <div className="skin-category-tabs">
              {["all", "free", "level", "premium", "custom"].map((cat) => {
                const count = cat === "all"
                  ? skins.length
                  : skins.filter((s) => s.category === cat).length;
                return (
                  <button
                    key={cat}
                    className={`skin-cat-tab ${skinCategoryTab === cat ? "active" : ""}`}
                    onClick={() => setSkinCategoryTab(cat)}
                  >
                    {cat === "custom" ? "🖼️ Custom" : cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
                  </button>
                );
              })}
            </div>

            <div className="skin-picker-grid">
              {skins
                .filter((s) => skinCategoryTab === "all" || s.category === skinCategoryTab)
                .map((s) => {
                  const locked = !s.accessible;
                  return (
                    <div
                      key={s.name}
                      className={`skin-picker-item ${s.name === skin ? "active" : ""} ${locked ? "locked" : ""} rarity-${s.rarity}`}
                      onClick={() => !locked && selectSkin(s.name)}
                      title={locked ? (s.reason || "Locked") : s.name}
                    >
                      <img
                        src={`${serverBaseUrl}/skins/${s.file}`}
                        alt={s.name}
                        loading="lazy"
                      />
                      {locked && (
                        <div className="skin-lock-overlay">
                          <span className="skin-lock-icon">🔒</span>
                          {s.category === "premium" && s.tokensNeed && (
                            <span className="skin-token-progress">
                              {s.tokens || 0}/{s.tokensNeed}
                            </span>
                          )}
                          {s.category === "level" && s.minLevel && (
                            <span className="skin-level-req">Lv.{s.minLevel}</span>
                          )}
                        </div>
                      )}
                      {/* Rarity dot */}
                      <span className={`skin-rarity-dot rarity-${s.rarity}`} />
                    </div>
                  );
                })}
            </div>
            {skin && (
              <button className="skin-picker-clear" onClick={() => selectSkin("")}>
                Clear Skin
              </button>
            )}

            {/* Custom skin upload */}
            {isAuthenticated && (customSkinSlots > 0 || isAdmin) && (
              <div className="custom-skin-upload">
                <input
                  ref={skinFileInput}
                  type="file"
                  accept=".png,.jpg,.jpeg,.gif,.webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCustomSkinUpload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  className="custom-skin-upload-btn"
                  onClick={() => skinFileInput.current?.click()}
                  disabled={uploadingSkin}
                >
                  {uploadingSkin ? "Uploading..." : isAdmin ? "🖼️ Upload Custom Skin (admin)" : `🖼️ Upload Custom Skin (${customSkinSlots} slot${customSkinSlots !== 1 ? "s" : ""})`}
                </button>
                {uploadError && <div className="custom-skin-error">{uploadError}</div>}
              </div>
            )}
            {isAuthenticated && !isAdmin && customSkinSlots === 0 && (
              <div className="custom-skin-upload">
                <button className="custom-skin-shop-btn" onClick={() => { setShowPicker(false); onOpenShop(); }}>
                  🛒 Buy Custom Skin Slot (50🫘)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Effect Picker Modal ── */}
      {showEffectPicker && (
        <div className="effect-picker-overlay" onClick={() => setShowEffectPicker(false)}>
          <div className="effect-picker-panel" onClick={(e) => e.stopPropagation()}>
            <div className="effect-picker-header">
              <h2>Effects</h2>
              <button
                className="effect-picker-close"
                onClick={() => setShowEffectPicker(false)}
              >
                &times;
              </button>
            </div>

            {/* Category tabs */}
            <div className="effect-category-tabs">
              {["all", "free", "premium"].map((cat) => {
                const count = cat === "all"
                  ? effectEntries.length
                  : effectEntries.filter((e) => e.category === cat).length;
                return (
                  <button
                    key={cat}
                    className={`effect-cat-tab ${effectCategoryTab === cat ? "active" : ""}`}
                    onClick={() => setEffectCategoryTab(cat)}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
                  </button>
                );
              })}
            </div>

            <div className="effect-picker-grid">
              {/* None option */}
              <div
                className={`effect-picker-card ${effect === "" ? "active" : ""}`}
                onClick={() => { setEffect(""); setShowEffectPicker(false); }}
                title="No effect"
              >
                <div className="effect-card-icon">✕</div>
                <div className="effect-card-label">None</div>
              </div>
              {effectEntries
                .filter((e) => effectCategoryTab === "all" || e.category === effectCategoryTab)
                .map((e) => {
                  const locked = !e.accessible;
                  return (
                    <div
                      key={e.id}
                      className={`effect-picker-card ${effect === e.id ? "active" : ""} ${locked ? "locked" : ""} ${e.category === "premium" ? "premium" : ""}`}
                      onClick={() => {
                        if (!locked) {
                          setEffect(e.id);
                          setShowEffectPicker(false);
                        }
                      }}
                      title={locked ? (e.reason || "Locked") : e.label}
                    >
                      <div className="effect-card-icon">
                        {e.category === "premium" ? "★" : "✦"}
                      </div>
                      <div className="effect-card-label">{e.label}</div>
                      {locked && (
                        <div className="effect-lock-overlay">
                          <span className="effect-lock-icon2">🔒</span>
                          {e.category === "premium" && e.tokensNeed != null && (
                            <span className="effect-token-progress">
                              {e.tokens || 0}/{e.tokensNeed}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            {effect && (
              <button
                className="effect-picker-clear"
                onClick={() => { setEffect(""); setShowEffectPicker(false); }}
              >
                Clear Effect
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Cursor Picker ── */}
      {showCursorPicker && (
        <div className="cursor-picker-overlay" onClick={() => setShowCursorPicker(false)}>
          <div className="cursor-picker-panel" onClick={(e) => e.stopPropagation()}>
            <div className="cursor-picker-header">
              <h2>Cursors</h2>
              <button
                className="cursor-picker-close"
                onClick={() => setShowCursorPicker(false)}
              >
                &times;
              </button>
            </div>

            <div className="cursor-picker-grid">
              {/* None option */}
              <div
                className={`cursor-picker-card ${settings.cursor === "" ? "active" : ""}`}
                onClick={() => { onSettingsChange({ ...settings, cursor: "" }); setShowCursorPicker(false); }}
                title="Default cursor"
              >
                <div className="cursor-card-icon">✕</div>
                <div className="cursor-card-label">Default</div>
              </div>
              {CURSOR_LIST.map((cur) => {
                // Lazy-render preview
                let preview = cursorPreviewCache.current.get(cur.id);
                if (!preview) {
                  preview = renderCursorToDataURL(cur.id, 48) ?? "";
                  cursorPreviewCache.current.set(cur.id, preview);
                }
                return (
                  <div
                    key={cur.id}
                    className={`cursor-picker-card ${settings.cursor === cur.id ? "active" : ""}`}
                    onClick={() => { onSettingsChange({ ...settings, cursor: cur.id }); setShowCursorPicker(false); }}
                    title={cur.description}
                  >
                    <div className="cursor-card-preview">
                      {preview && <img src={preview} alt={cur.label} width={36} height={36} />}
                    </div>
                    <div className="cursor-card-label">{cur.label}</div>
                  </div>
                );
              })}
            </div>
            {settings.cursor && (
              <div className="cursor-mode-row">
                <label className="cursor-mode-label">Mode:</label>
                <select
                  className="cursor-mode-select"
                  value={settings.cursorMode}
                  onChange={(e) => onSettingsChange({ ...settings, cursorMode: e.target.value as "real" | "canvas" | "both" })}
                >
                  <option value="real">Real (fast)</option>
                  <option value="canvas">Canvas (for recording)</option>
                  <option value="both">Both</option>
                </select>
              </div>
            )}
            <label className="cursor-lines-toggle">
              <input
                type="checkbox"
                checked={settings.showCursorLines}
                onChange={() => onSettingsChange({ ...settings, showCursorLines: !settings.showCursorLines })}
              />
              <span className="toggle-slider" />
              Cursor Lines
            </label>
            {settings.cursor && (
              <button
                className="cursor-picker-clear"
                onClick={() => { onSettingsChange({ ...settings, cursor: "" }); setShowCursorPicker(false); }}
              >
                Clear Cursor
              </button>
            )}
          </div>
        </div>
      )}

      {/* Token Reveal — shown in lobby after level-up */}
      {pendingTokens.length > 0 && sessionTokenForTokens && (
        <TokenReveal
          tokens={pendingTokens}
          serverBaseUrl={serverBaseUrlForTokens}
          sessionToken={sessionTokenForTokens}
          onDone={onTokenRevealDone}
        />
      )}

      {/* Effect Token Reveal — shown in lobby after level-up */}
      {pendingEffectTokens.length > 0 && sessionTokenForTokens && pendingTokens.length === 0 && (
        <EffectTokenReveal
          tokens={pendingEffectTokens}
          serverBaseUrl={serverBaseUrlForTokens}
          sessionToken={sessionTokenForTokens}
          onDone={onEffectTokenRevealDone}
        />
      )}
    </div>
  );
}
