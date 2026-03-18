import { useState, useCallback, useEffect } from "react";
import type { ConnectionState, LeaderboardEntry } from "../protocol";
import type { UserProfile } from "../App";
import { TokenReveal } from "./TokenReveal";
import { setSkinFiles, getSkinFile } from "../skinFileMap";
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

interface LobbyProps {
  connectionState: ConnectionState;
  onSpawn: (name: string, skin: string) => void;
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
  sessionToken: string | null;
  userLevel: number;
  xpCurrent: number;
  xpNeeded: number;
  onOpenOptions: () => void;
  pendingTokens: Array<{skinName: string}>;
  serverBaseUrlForTokens: string;
  sessionTokenForTokens: string | null;
  onTokenRevealDone: () => void;
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
  sessionToken,
  userLevel,
  xpCurrent,
  xpNeeded,
  onOpenOptions,
  pendingTokens,
  serverBaseUrlForTokens,
  sessionTokenForTokens,
  onTokenRevealDone,
}: LobbyProps) {
  const [name, setName] = useState(() => localStorage.getItem("h4kmally-name") || "");
  const [skin, setSkin] = useState(() => localStorage.getItem("h4kmally-skin") || "");

  // Persist name and skin to localStorage
  useEffect(() => {
    localStorage.setItem("h4kmally-name", name);
  }, [name]);

  useEffect(() => {
    localStorage.setItem("h4kmally-skin", skin);
  }, [skin]);
  const [skins, setSkins] = useState<SkinAccessEntry[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [lbTab, setLbTab] = useState<"top" | "winners">("top");
  const [skinCategoryTab, setSkinCategoryTab] = useState<string>("all");

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
      })
      .catch(() => {});
  }, [serverBaseUrl, showPicker, sessionToken]);

  const handlePlay = useCallback(() => {
    onSpawn(name || "unnamed", skin);
  }, [name, skin, onSpawn]);

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
              {/* Skin circle + nickname/server */}
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
            </div>
          )}

          <div className="lobby-footer">
            <button className="btn-options" onClick={onOpenOptions} title="Options (Esc)">&#9881; Options</button>
            {connectionState === "connecting" && <span className="lobby-connection-state">Connecting…</span>}
          </div>
        </div>

        {/* ── Right panel: Leaderboard ── */}
        <div className="lobby-panel-right">
          <div className="lb-tabs">
            <button
              className={`lb-tab ${lbTab === "top" ? "active" : ""}`}
              onClick={() => setLbTab("top")}
            >
              Top Users
            </button>
            <button
              className={`lb-tab ${lbTab === "winners" ? "active" : ""}`}
              onClick={() => setLbTab("winners")}
            >
              Winners
            </button>
          </div>
          <div className="lb-inner">
            {lbTab === "top" && (
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
            {lbTab === "winners" && (
              <div className="lb-empty">Coming soon</div>
            )}
          </div>
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
              {["all", "free", "level", "premium"].map((cat) => {
                const count = cat === "all"
                  ? skins.length
                  : skins.filter((s) => s.category === cat).length;
                return (
                  <button
                    key={cat}
                    className={`skin-cat-tab ${skinCategoryTab === cat ? "active" : ""}`}
                    onClick={() => setSkinCategoryTab(cat)}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
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
    </div>
  );
}
