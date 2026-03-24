import { useState, useEffect, useCallback, useRef } from "react";
import "./AdminPanel.css";

interface AdminPanelProps {
  serverBaseUrl: string;
  sessionToken: string;
  onClose: () => void;
}

interface UserEntry {
  sub: string;
  name: string;
  picture: string;
  points: number;
  gamesPlayed: number;
  topScore: number;
  isAdmin?: boolean;
  bannedUntil?: number;
  banReason?: string;
  clanId?: string;
  unlockedSkins?: string[];
  skinTokens?: Record<string, number>;
  unlockedEffects?: string[];
  effectTokens?: Record<string, number>;
  dailyState?: {
    dateKey: string;
    goals: { type: string; label: string; description: string; target: number; progress: number; completed: boolean }[];
    powerupGranted: boolean;
    powerups?: Record<string, number>;
  };
}

interface OnlinePlayer {
  playerId: number;
  name: string;
  skin: string;
  score: number;
  alive: boolean;
  userSub: string;
  ip: string;
  centerX: number;
  centerY: number;
}

interface IPBanEntry {
  ip: string;
  reason: string;
  bannedBy: string;
  expiresAt: number;
}

interface SkinEntry {
  name: string;
  file: string;
  category: string;
  rarity: string;
  minLevel?: number;
  ownerSub?: string;
}

type Tab = "users" | "online" | "ipbans" | "skins";

export function AdminPanel({ serverBaseUrl, sessionToken, onClose }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>("online");
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [online, setOnline] = useState<OnlinePlayer[]>([]);
  const [ipBans, setIpBans] = useState<IPBanEntry[]>([]);
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("free");
  const [uploadRarity, setUploadRarity] = useState("common");
  const [uploadMinLevel, setUploadMinLevel] = useState(1);
  const [brStatus, setBrStatus] = useState<{ state: number; playersAlive: number; timeRemaining: number } | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [skinFilter, setSkinFilter] = useState<"all" | "custom">("all");

  const api = useCallback(
    async (endpoint: string, method = "GET", body?: Record<string, unknown>) => {
      const opts: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
      };
      if (body) opts.body = JSON.stringify(body);
      const resp = await fetch(`${serverBaseUrl}/api/admin/${endpoint}`, opts);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      return data;
    },
    [serverBaseUrl, sessionToken]
  );

  const showMsg = (type: "error" | "success", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api("users");
      setUsers(data.users || []);
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchOnline = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api("online");
      setOnline(data.players || []);
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchIPBans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api("ip-bans");
      setIpBans(data.bans || []);
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchSkins = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api("skins");
      setSkins(data.skins || []);
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Fetch data when tab changes
  useEffect(() => {
    if (tab === "users") fetchUsers();
    else if (tab === "online") fetchOnline();
    else if (tab === "ipbans") fetchIPBans();
    else if (tab === "skins") fetchSkins();
  }, [tab, fetchUsers, fetchOnline, fetchIPBans, fetchSkins]);

  const handleToggleAdmin = async (sub: string, currentlyAdmin: boolean) => {
    try {
      await api("set-admin", "POST", { sub, isAdmin: !currentlyAdmin });
      showMsg("success", currentlyAdmin ? "Admin removed" : "Admin granted");
      fetchUsers();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleBanUser = async (sub: string) => {
    const reason = prompt("Ban reason (optional):");
    const durationStr = prompt("Duration in hours (0 = permanent):", "0");
    const hours = parseInt(durationStr || "0", 10);
    try {
      await api("ban-user", "POST", {
        sub,
        reason: reason || "Banned by admin",
        duration: hours > 0 ? hours * 3600 : -1,
      });
      showMsg("success", "User banned");
      fetchUsers();
      fetchOnline();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleUnbanUser = async (sub: string) => {
    try {
      await api("unban-user", "POST", { sub });
      showMsg("success", "User unbanned");
      fetchUsers();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleBanIP = async (ip?: string) => {
    const targetIP = ip || prompt("IP address to ban:");
    if (!targetIP) return;
    const reason = prompt("Ban reason (optional):");
    const durationStr = prompt("Duration in hours (0 = permanent):", "0");
    const hours = parseInt(durationStr || "0", 10);
    try {
      await api("ban-ip", "POST", {
        ip: targetIP,
        reason: reason || "IP banned by admin",
        duration: hours > 0 ? hours * 3600 : -1,
      });
      showMsg("success", `IP ${targetIP} banned`);
      fetchIPBans();
      fetchOnline();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleUnbanIP = async (ip: string) => {
    try {
      await api("unban-ip", "POST", { ip });
      showMsg("success", `IP ${ip} unbanned`);
      fetchIPBans();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const isBanned = (u: UserEntry) => {
    if (!u.bannedUntil) return false;
    if (u.bannedUntil === -1) return true;
    return u.bannedUntil > Date.now() / 1000;
  };

  const handleUploadSkin = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.length) {
      showMsg("error", "Please select an image file");
      return;
    }
    if (!uploadName.trim()) {
      showMsg("error", "Please enter a skin name");
      return;
    }
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("name", uploadName.trim());
    formData.append("category", uploadCategory);
    formData.append("rarity", uploadRarity);
    if (uploadCategory === "level") {
      formData.append("minLevel", String(uploadMinLevel));
    }
    try {
      const resp = await fetch(`${serverBaseUrl}/api/admin/upload-skin?session=${encodeURIComponent(sessionToken)}`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      showMsg("success", `Skin "${uploadName.trim()}" uploaded`);
      setUploadName("");
      if (fileInput) fileInput.value = "";
      fetchSkins();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleDeleteSkin = async (name: string) => {
    if (!confirm(`Delete skin "${name}"? This cannot be undone.`)) return;
    try {
      await api("delete-skin", "POST", { name });
      showMsg("success", `Skin "${name}" deleted`);
      fetchSkins();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleSetSkinLevel = async (name: string, minLevel: number) => {
    try {
      await api("set-skin-level", "POST", { name, minLevel });
      showMsg("success", `Min level for "${name}" set to ${minLevel}`);
      fetchSkins();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const fetchBRStatus = useCallback(async () => {
    try {
      const data = await api("br/status");
      setBrStatus(data);
    } catch { /* ignore */ }
  }, [api]);

  useEffect(() => {
    fetchBRStatus();
    const iv = setInterval(fetchBRStatus, 3000);
    return () => clearInterval(iv);
  }, [fetchBRStatus]);

  const handleBRStart = async () => {
    try {
      await api("br/start", "POST");
      showMsg("success", "Battle Royale started!");
      fetchBRStatus();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const handleBRStop = async () => {
    try {
      await api("br/stop", "POST");
      showMsg("success", "Battle Royale stopped");
      fetchBRStatus();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  const POWERUPS = [
    { type: "virus_layer", label: "Virus Layer", charges: 5 },
    { type: "speed_boost", label: "Speed Boost", charges: 3 },
    { type: "ghost_mode", label: "Ghost Mode", charges: 1 },
    { type: "mass_magnet", label: "Mass Magnet", charges: 2 },
    { type: "freeze_splitter", label: "Freeze Splitter", charges: 3 },
    { type: "recombine", label: "Recombine", charges: 1 },
  ];

  const handleGrantPowerup = async (sub: string, powerup: string) => {
    if (!sub) {
      showMsg("error", "Only signed-in users can receive powerups");
      return;
    }
    const def = POWERUPS.find((p) => p.type === powerup);
    if (!def) return;
    try {
      await api("grant-powerup", "POST", { sub, powerup, charges: def.charges });
      showMsg("success", `Granted ${def.label} to player`);
      if (tab === "users") fetchUsers();
    } catch (e: unknown) {
      showMsg("error", (e as Error).message);
    }
  };

  return (
    <div className="admin-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-panel">
        <div className="admin-header">
          <h2>Admin Panel</h2>
          <button className="admin-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${tab === "online" ? "active" : ""}`}
            onClick={() => setTab("online")}
          >
            Online ({online.length})
          </button>
          <button
            className={`admin-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            All Users
          </button>
          <button
            className={`admin-tab ${tab === "ipbans" ? "active" : ""}`}
            onClick={() => setTab("ipbans")}
          >
            IP Bans
          </button>
          <button
            className={`admin-tab ${tab === "skins" ? "active" : ""}`}
            onClick={() => setTab("skins")}
          >
            Skins ({skins.length})
          </button>
        </div>

        <div className="admin-content">
          {message && <div className={`admin-msg ${message.type}`}>{message.text}</div>}

          {/* Battle Royale Controls */}
          <div className="admin-br-controls">
            <strong>Battle Royale</strong>
            <span className="admin-br-status">
              {brStatus ? `${["Inactive","Countdown","Active","Finished"][brStatus.state] || brStatus.state} | ${brStatus.playersAlive} alive` : "Loading..."}
            </span>
            <button
              className="admin-btn admin-btn-br-start"
              onClick={handleBRStart}
              disabled={brStatus?.state === 2 || brStatus?.state === 1}
            >
              Start BR
            </button>
            <button
              className="admin-btn admin-btn-br-stop"
              onClick={handleBRStop}
              disabled={brStatus?.state === 0}
            >
              Stop BR
            </button>
          </div>

          {tab === "online" && (
            <>
              <button className="admin-btn refresh" onClick={fetchOnline} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Account</th>
                    <th>IP</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {online.map((p) => (
                    <tr key={p.playerId}>
                      <td>{p.name || "(unnamed)"}</td>
                      <td>{Math.round(p.score).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${p.alive ? "online" : "offline"}`}>
                          {p.alive ? "Alive" : "Dead"}
                        </span>
                      </td>
                      <td>{p.userSub ? "Signed in" : "Guest"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{p.ip}</td>
                      <td>
                        {p.userSub && (
                          <select
                            className="admin-powerup-select"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleGrantPowerup(p.userSub, e.target.value);
                                e.target.value = "";
                              }
                            }}
                          >
                            <option value="" disabled>
                              Grant Powerup…
                            </option>
                            {POWERUPS.map((pu) => (
                              <option key={pu.type} value={pu.type}>
                                {pu.label} ({pu.charges})
                              </option>
                            ))}
                          </select>
                        )}
                        {p.userSub && (
                          <button className="admin-btn ban" onClick={() => handleBanUser(p.userSub)}>
                            Ban Account
                          </button>
                        )}
                        {p.ip && (
                          <button className="admin-btn ban" onClick={() => handleBanIP(p.ip)}>
                            Ban IP
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {online.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#666" }}>
                        No players online
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {tab === "users" && (
            <>
              <button className="admin-btn refresh" onClick={fetchUsers} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Points</th>
                    <th>Top Score</th>
                    <th>Games</th>
                    <th>Clan</th>
                    <th>Powerup</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <>
                      <tr key={u.sub} className={expandedUser === u.sub ? "expanded-row" : ""} onClick={() => setExpandedUser(expandedUser === u.sub ? null : u.sub)} style={{ cursor: "pointer" }}>
                        <td>
                          {u.picture && (
                            <img
                              src={u.picture}
                              alt=""
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                marginRight: 6,
                                verticalAlign: "middle",
                              }}
                            />
                          )}
                          {u.name || u.sub}
                        </td>
                        <td>{u.points.toLocaleString()}</td>
                        <td>{u.topScore.toLocaleString()}</td>
                        <td>{u.gamesPlayed}</td>
                        <td>{u.clanId ? <span className="badge online">{u.clanId}</span> : <span style={{ color: "#555" }}>—</span>}</td>
                        <td>
                          {u.dailyState?.powerups && Object.keys(u.dailyState.powerups).length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              {Object.entries(u.dailyState.powerups).map(([type, charges]) => (
                                <span key={type} className="badge powerup" style={{ fontSize: 10 }}>
                                  {POWERUPS.find((p) => p.type === type)?.label || type} ×{charges}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: "#555" }}>—</span>
                          )}
                        </td>
                        <td>
                          {u.isAdmin && <span className="badge admin">Admin</span>}{" "}
                          {isBanned(u) && (
                            <span className="badge banned" title={u.banReason}>
                              Banned
                            </span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="admin-powerup-select"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleGrantPowerup(u.sub, e.target.value);
                                e.target.value = "";
                              }
                            }}
                          >
                            <option value="" disabled>
                              Grant Powerup…
                            </option>
                            {POWERUPS.map((pu) => (
                              <option key={pu.type} value={pu.type}>
                                {pu.label} ({pu.charges})
                              </option>
                            ))}
                          </select>
                          <button
                            className="admin-btn toggle-admin"
                            onClick={() => handleToggleAdmin(u.sub, !!u.isAdmin)}
                          >
                            {u.isAdmin ? "Remove Admin" : "Make Admin"}
                          </button>
                          {isBanned(u) ? (
                            <button className="admin-btn unban" onClick={() => handleUnbanUser(u.sub)}>
                              Unban
                            </button>
                          ) : (
                            <button className="admin-btn ban" onClick={() => handleBanUser(u.sub)}>
                              Ban
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedUser === u.sub && (
                        <tr key={u.sub + "-detail"} className="user-detail-row">
                          <td colSpan={8}>
                            <div className="user-detail">
                              <div className="user-detail-grid">
                                <div className="user-detail-section">
                                  <h4>Account</h4>
                                  <div className="detail-item"><span className="detail-label">Sub</span><span className="detail-value mono">{u.sub}</span></div>
                                  <div className="detail-item"><span className="detail-label">Clan</span><span className="detail-value">{u.clanId || "None"}</span></div>
                                </div>
                                <div className="user-detail-section">
                                  <h4>Skins</h4>
                                  {u.unlockedSkins && u.unlockedSkins.length > 0 ? (
                                    <div className="detail-tags">
                                      {u.unlockedSkins.map((s) => <span key={s} className="detail-tag skin">{s}</span>)}
                                    </div>
                                  ) : <span className="detail-empty">None unlocked</span>}
                                  {u.skinTokens && Object.keys(u.skinTokens).length > 0 && (
                                    <div className="detail-item" style={{ marginTop: 4 }}>
                                      <span className="detail-label">Tokens</span>
                                      <span className="detail-value">{Object.entries(u.skinTokens).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="user-detail-section">
                                  <h4>Effects</h4>
                                  {u.unlockedEffects && u.unlockedEffects.length > 0 ? (
                                    <div className="detail-tags">
                                      {u.unlockedEffects.map((e) => <span key={e} className="detail-tag effect">{e}</span>)}
                                    </div>
                                  ) : <span className="detail-empty">None unlocked</span>}
                                  {u.effectTokens && Object.keys(u.effectTokens).length > 0 && (
                                    <div className="detail-item" style={{ marginTop: 4 }}>
                                      <span className="detail-label">Tokens</span>
                                      <span className="detail-value">{Object.entries(u.effectTokens).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="user-detail-section">
                                  <h4>Powerups</h4>
                                  {u.dailyState?.powerups && Object.keys(u.dailyState.powerups).length > 0 ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                      {Object.entries(u.dailyState.powerups).map(([type, charges]) => (
                                        <div key={type} className="detail-item">
                                          <span className="detail-label">{POWERUPS.find((p) => p.type === type)?.label || type}</span>
                                          <span className="detail-value">{charges} charges</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <span className="detail-empty">No powerups</span>}
                                  {u.dailyState && (
                                    <div className="detail-item" style={{ marginTop: 4 }}>
                                      <span className="detail-label">Daily goals</span>
                                      <span className="detail-value">{u.dailyState.goals.filter((g) => g.completed).length}/3 complete ({u.dailyState.dateKey})</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "#666" }}>
                        No registered users
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {tab === "ipbans" && (
            <>
              <button className="admin-btn refresh" onClick={fetchIPBans} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>
              <button
                className="admin-btn ban"
                onClick={() => handleBanIP()}
                style={{ marginBottom: 12 }}
              >
                + Add IP Ban
              </button>
              <table>
                <thead>
                  <tr>
                    <th>IP Address</th>
                    <th>Reason</th>
                    <th>Banned By</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ipBans.map((b) => (
                    <tr key={b.ip}>
                      <td style={{ fontFamily: "monospace" }}>{b.ip}</td>
                      <td>{b.reason}</td>
                      <td>{b.bannedBy}</td>
                      <td>
                        {b.expiresAt === -1
                          ? "Permanent"
                          : new Date(b.expiresAt * 1000).toLocaleString()}
                      </td>
                      <td>
                        <button className="admin-btn unban" onClick={() => handleUnbanIP(b.ip)}>
                          Unban
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ipBans.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: 20, color: "#666" }}>
                        No IP bans
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {tab === "skins" && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <button className="admin-btn refresh" onClick={fetchSkins} disabled={loading}>
                  {loading ? "Loading..." : "Refresh"}
                </button>
                <button
                  className={`admin-btn ${skinFilter === "all" ? "refresh" : ""}`}
                  style={{ opacity: skinFilter === "all" ? 1 : 0.5 }}
                  onClick={() => setSkinFilter("all")}
                >
                  All Skins
                </button>
                <button
                  className={`admin-btn ${skinFilter === "custom" ? "ban" : ""}`}
                  style={{ opacity: skinFilter === "custom" ? 1 : 0.5 }}
                  onClick={() => setSkinFilter("custom")}
                >
                  👤 Custom Skins ({skins.filter(s => s.category === "custom").length})
                </button>
              </div>

              <div className="skin-upload-form">
                <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#ccc" }}>Upload New Skin</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Skin name"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    style={{ background: "#222", border: "1px solid #444", borderRadius: 4, color: "#ddd", padding: "6px 10px", fontSize: 13, width: 140 }}
                  />
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    style={{ background: "#222", border: "1px solid #444", borderRadius: 4, color: "#ddd", padding: "6px 10px", fontSize: 13 }}
                  >
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="level">Level</option>
                    <option value="clan">Clan</option>
                  </select>
                  {uploadCategory === "level" && (
                    <input
                      type="number"
                      min={1}
                      placeholder="Min Level"
                      value={uploadMinLevel}
                      onChange={(e) => setUploadMinLevel(Number(e.target.value) || 1)}
                      style={{ background: "#222", border: "1px solid #444", borderRadius: 4, color: "#ddd", padding: "6px 10px", fontSize: 13, width: 80 }}
                    />
                  )}
                  <select
                    value={uploadRarity}
                    onChange={(e) => setUploadRarity(e.target.value)}
                    style={{ background: "#222", border: "1px solid #444", borderRadius: 4, color: "#ddd", padding: "6px 10px", fontSize: 13 }}
                  >
                    <option value="common">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif,.webp"
                    style={{ fontSize: 12, color: "#aaa" }}
                  />
                  <button className="admin-btn unban" onClick={handleUploadSkin}>
                    Upload
                  </button>
                </div>
              </div>

              <table style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Preview</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Rarity</th>
                    <th>{skinFilter === "custom" ? "Owner" : "Min Level"}</th>
                    <th>File</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {skins
                    .filter(s => skinFilter === "all" || s.category === "custom")
                    .map((s) => (
                    <tr key={s.name} style={s.category === "custom" ? { background: "rgba(255, 180, 220, 0.07)" } : undefined}>
                      <td>
                        <img
                          src={`${serverBaseUrl}/skins/${s.file}`}
                          alt={s.name}
                          style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", background: "#333" }}
                        />
                      </td>
                      <td>{s.name}</td>
                      <td>
                        <span className={`badge ${s.category === "premium" ? "admin" : s.category === "custom" ? "banned" : s.category === "level" ? "online" : "offline"}`}>
                          {s.category}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${s.rarity === "legendary" ? "admin" : s.rarity === "epic" ? "banned" : s.rarity === "rare" ? "online" : "offline"}`}>
                          {s.rarity}
                        </span>
                      </td>
                      <td>
                        {s.category === "custom" ? (
                          <span style={{ fontSize: 12, color: "#f9a8d4" }}>
                            {s.ownerSub ? s.ownerSub.slice(0, 12) + "..." : "unknown"}
                          </span>
                        ) : s.category === "level" ? (
                          <input
                            type="number"
                            min={1}
                            defaultValue={s.minLevel || 1}
                            style={{ width: 50, background: "#222", border: "1px solid #444", borderRadius: 4, color: "#ddd", padding: "2px 6px", fontSize: 12, textAlign: "center" }}
                            onBlur={(e) => {
                              const val = Number(e.target.value) || 1;
                              if (val !== (s.minLevel || 0)) {
                                handleSetSkinLevel(s.name, val);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span style={{ color: "#555" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.file}</td>
                      <td>
                        <button className="admin-btn ban" onClick={() => handleDeleteSkin(s.name)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {skins.filter(s => skinFilter === "all" || s.category === "custom").length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#666" }}>
                        {skinFilter === "custom" ? "No custom skins" : "No skins"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
