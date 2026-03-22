import { useState, useEffect, useCallback } from "react";
import "./ClanPanel.css";

interface ClanPanelProps {
  serverBaseUrl: string;
  sessionToken: string;
  isAdmin: boolean;
  onClose: () => void;
  onClanChange: () => void;
}

interface ClanMember {
  sub: string;
  name: string;
  role: string;
  joinedAt: string;
}

interface ClanJoinRequest {
  sub: string;
  name: string;
  requestedAt: string;
}

interface ClanDetail {
  id: string;
  name: string;
  tag: string;
  members: ClanMember[];
  joinRequests?: ClanJoinRequest[];
  settings: {
    acceptingRequests: boolean;
    description: string;
    clanColor: string;
    isPublic: boolean;
    maxMembers: number;
  };
}

interface ClanListItem {
  id: string;
  name: string;
  tag: string;
  memberCount: number;
  color: string;
  description: string;
  accepting: boolean;
  minLevel: number;
}

export function ClanPanel({ serverBaseUrl, sessionToken, isAdmin, onClose, onClanChange }: ClanPanelProps) {
  const [tab, setTab] = useState<"my-clan" | "browse" | "create">("my-clan");
  const [myClan, setMyClan] = useState<ClanDetail | null>(null);
  const [myRole, setMyRole] = useState<string>("");
  const [clanList, setClanList] = useState<ClanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createTag, setCreateTag] = useState("");
  const [createDesc, setCreateDesc] = useState("");

  // Settings edit state
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#ffffff");
  const [editAccepting, setEditAccepting] = useState(true);
  const [editPublic, setEditPublic] = useState(true);
  const [editMinLevel, setEditMinLevel] = useState(1);
  const [editMaxMembers, setEditMaxMembers] = useState(50);
  const [savingSettings, setSavingSettings] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  };

  const api = useCallback(
    async (path: string, opts?: RequestInit) => {
      const resp = await fetch(`${serverBaseUrl}/api/clans${path}`, {
        ...opts,
        headers: { ...headers, ...opts?.headers },
      });
      return resp.json();
    },
    [serverBaseUrl, sessionToken]
  );

  const fetchMyClan = useCallback(async () => {
    try {
      const data = await api("/my");
      if (data.clan) {
        setMyClan(data.clan);
        setMyRole(data.myRole || "member");
        setTab("my-clan");
      } else {
        setMyClan(null);
        setMyRole("");
        setTab("browse");
      }
    } catch {
      setMyClan(null);
    }
    setLoading(false);
  }, [api]);

  const fetchList = useCallback(async () => {
    try {
      // GET /api/clans returns a bare array of clan summaries
      const data = await api("");
      setClanList(Array.isArray(data) ? data : []);
    } catch {
      setClanList([]);
    }
  }, [api]);

  useEffect(() => {
    fetchMyClan();
    fetchList();
  }, [fetchMyClan, fetchList]);

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    const data = await api("/create", {
      method: "POST",
      body: JSON.stringify({ name: createName.trim(), tag: createTag.trim(), description: createDesc.trim() }),
    });
    if (data.error) {
      setError(data.error);
      return;
    }
    if (data.paymentUrl) {
      // Non-admin: redirect to payment
      window.open(data.paymentUrl, "_blank");
      setSuccess("Payment opened. After paying, come back and click 'Confirm Payment'.");
      return;
    }
    // Admin: clan created immediately
    setSuccess("Clan created!");
    onClanChange();
    await fetchMyClan();
    await fetchList();
  };

  const handleConfirmPayment = async () => {
    setError("");
    const data = await api("/create-confirm", {
      method: "POST",
      body: JSON.stringify({ name: createName.trim(), tag: createTag.trim(), description: createDesc.trim() }),
    });
    if (data.error) {
      setError(data.error);
      return;
    }
    setSuccess("Clan created!");
    onClanChange();
    await fetchMyClan();
    await fetchList();
  };

  const handleJoin = async (clanId: string) => {
    setError("");
    const data = await api("/join", {
      method: "POST",
      body: JSON.stringify({ clanId }),
    });
    if (data.error) {
      setError(data.error);
    } else {
      setSuccess(data.message || "Join request sent!");
    }
  };

  const handleAccept = async (sub: string) => {
    const data = await api("/accept", {
      method: "POST",
      body: JSON.stringify({ sub }),
    });
    if (data.error) setError(data.error);
    else { setSuccess("Member accepted!"); await fetchMyClan(); }
  };

  const handleReject = async (sub: string) => {
    const data = await api("/reject", {
      method: "POST",
      body: JSON.stringify({ sub }),
    });
    if (data.error) setError(data.error);
    else { setSuccess("Request rejected."); await fetchMyClan(); }
  };

  const handleKick = async (sub: string) => {
    const data = await api("/kick", {
      method: "POST",
      body: JSON.stringify({ sub }),
    });
    if (data.error) setError(data.error);
    else { setSuccess("Member kicked."); await fetchMyClan(); }
  };

  const handleSetRole = async (sub: string, role: string) => {
    const data = await api("/set-role", {
      method: "POST",
      body: JSON.stringify({ sub, role }),
    });
    if (data.error) setError(data.error);
    else { setSuccess("Role updated!"); await fetchMyClan(); }
  };

  const handleLeave = async () => {
    if (!confirm("Are you sure you want to leave your clan?")) return;
    const data = await api("/leave", { method: "POST" });
    if (data.error) setError(data.error);
    else {
      setSuccess("You left the clan.");
      setMyClan(null);
      setMyRole("");
      onClanChange();
      setTab("browse");
      await fetchList();
    }
  };

  const canManageMembers = myRole === "elder" || myRole === "co-leader" || myRole === "leader";
  const canManageRoles = myRole === "co-leader" || myRole === "leader";
  const canEditSettings = myRole === "co-leader" || myRole === "leader";

  const openSettings = () => {
    if (!myClan) return;
    setEditName(myClan.name);
    setEditDesc(myClan.settings.description || "");
    setEditColor(myClan.settings.clanColor || "#ffffff");
    setEditAccepting(myClan.settings.acceptingRequests);
    setEditPublic(myClan.settings.isPublic);
    setEditMinLevel(myClan.settings.minLevel || 1);
    setEditMaxMembers(myClan.settings.maxMembers || 50);
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    setError("");
    setSavingSettings(true);
    try {
      const data = await api("/settings", {
        method: "POST",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          clanColor: editColor,
          acceptingRequests: editAccepting,
          isPublic: editPublic,
          minLevel: editMinLevel,
          maxMembers: editMaxMembers,
        }),
      });
      if (data.error) {
        setError(data.error);
      } else {
        setSuccess("Settings saved!");
        setShowSettings(false);
        await fetchMyClan();
        onClanChange();
      }
    } catch {
      setError("Failed to save settings");
    }
    setSavingSettings(false);
  };

  if (loading) {
    return (
      <div className="clan-overlay" onClick={onClose}>
        <div className="clan-panel" onClick={(e) => e.stopPropagation()}>
          <div className="clan-header">
            <h2>Clans</h2>
            <button className="clan-close" onClick={onClose}>&times;</button>
          </div>
          <p style={{ color: "#888" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="clan-overlay" onClick={onClose}>
      <div className="clan-panel" onClick={(e) => e.stopPropagation()}>
        <div className="clan-header">
          <h2>Clans</h2>
          <button className="clan-close" onClick={onClose}>&times;</button>
        </div>

        <div className="clan-tabs">
          {myClan && (
            <button
              className={`clan-tab-btn ${tab === "my-clan" ? "active" : ""}`}
              onClick={() => { setTab("my-clan"); setError(""); setSuccess(""); }}
            >
              My Clan
            </button>
          )}
          <button
            className={`clan-tab-btn ${tab === "browse" ? "active" : ""}`}
            onClick={() => { setTab("browse"); setError(""); setSuccess(""); fetchList(); }}
          >
            Browse
          </button>
          {!myClan && (
            <button
              className={`clan-tab-btn ${tab === "create" ? "active" : ""}`}
              onClick={() => { setTab("create"); setError(""); setSuccess(""); }}
            >
              Create
            </button>
          )}
        </div>

        {error && <div className="clan-error">{error}</div>}
        {success && <div className="clan-success">{success}</div>}

        {/* MY CLAN TAB */}
        {tab === "my-clan" && myClan && (
          <div>
            <div className="clan-info">
              <div><strong>{myClan.name}</strong> <span style={{ color: "#6dd5ed" }}>[{myClan.tag}]</span></div>
              {myClan.settings.description && <div style={{ marginTop: 4 }}>{myClan.settings.description}</div>}
              <div style={{ marginTop: 4 }}>Members: {myClan.members.length} / {myClan.settings.maxMembers}</div>
              <div>Your role: <span style={{ color: "#6dd5ed", textTransform: "capitalize" }}>{myRole}</span></div>
            </div>

            {/* Join Requests */}
            {canManageMembers && myClan.joinRequests && myClan.joinRequests.length > 0 && (
              <>
                <div className="clan-section-title">Join Requests ({myClan.joinRequests.length})</div>
                <div className="clan-requests-list">
                  {myClan.joinRequests.map((req) => (
                    <div key={req.sub} className="clan-request-row">
                      <span>{req.name || req.sub}</span>
                      <div className="clan-member-actions">
                        <button className="clan-btn clan-btn-sm" onClick={() => handleAccept(req.sub)}>Accept</button>
                        <button className="clan-btn clan-btn-sm clan-btn-danger" onClick={() => handleReject(req.sub)}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Members */}
            <div className="clan-section-title">Members</div>
            <div className="clan-members-list">
              {myClan.members.map((m) => (
                <div key={m.sub} className="clan-member-row">
                  <div>
                    <span className="clan-member-name">{m.name || m.sub}</span>
                    <span className="clan-member-role" style={{ marginLeft: 8 }}>{m.role}</span>
                  </div>
                  <div className="clan-member-actions">
                    {canManageRoles && m.role !== "leader" && m.sub !== myClan.members.find(x => x.role === "leader")?.sub && (
                      <select
                        value={m.role}
                        onChange={(e) => handleSetRole(m.sub, e.target.value)}
                        style={{ background: "#222", color: "#eee", border: "1px solid #444", borderRadius: 4, fontSize: "0.75rem", padding: "3px 6px" }}
                      >
                        <option value="member">Member</option>
                        <option value="elder">Elder</option>
                        {myRole === "leader" && <option value="co-leader">Co-Leader</option>}
                      </select>
                    )}
                    {canManageMembers && m.role !== "leader" && m.role !== "co-leader" && (
                      <button className="clan-btn clan-btn-sm clan-btn-danger" onClick={() => handleKick(m.sub)}>Kick</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Settings Form */}
            {showSettings && canEditSettings && (
              <div className="clan-settings-form">
                <div className="clan-section-title">Clan Settings</div>
                <label className="clan-field-label">Clan Name</label>
                <input
                  className="clan-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={32}
                />
                <label className="clan-field-label">Description</label>
                <textarea
                  className="clan-input clan-textarea"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
                <div className="clan-settings-row">
                  <label className="clan-field-label">Clan Color</label>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="clan-color-picker"
                  />
                </div>
                <div className="clan-settings-row">
                  <label className="clan-field-label">Accepting Requests</label>
                  <button
                    className={`clan-toggle ${editAccepting ? "on" : "off"}`}
                    onClick={() => setEditAccepting(!editAccepting)}
                  >
                    {editAccepting ? "Yes" : "No"}
                  </button>
                </div>
                <div className="clan-settings-row">
                  <label className="clan-field-label">Public (visible in Browse)</label>
                  <button
                    className={`clan-toggle ${editPublic ? "on" : "off"}`}
                    onClick={() => setEditPublic(!editPublic)}
                  >
                    {editPublic ? "Yes" : "No"}
                  </button>
                </div>
                <div className="clan-settings-row">
                  <label className="clan-field-label">Min Level to Join</label>
                  <input
                    type="number"
                    className="clan-input clan-input-short"
                    value={editMinLevel}
                    onChange={(e) => setEditMinLevel(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={100}
                  />
                </div>
                <div className="clan-settings-row">
                  <label className="clan-field-label">Max Members</label>
                  <input
                    type="number"
                    className="clan-input clan-input-short"
                    value={editMaxMembers}
                    onChange={(e) => setEditMaxMembers(Math.max(2, Math.min(200, parseInt(e.target.value) || 50)))}
                    min={2}
                    max={200}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="clan-btn" onClick={handleSaveSettings} disabled={savingSettings || editName.trim().length < 1}>
                    {savingSettings ? "Saving..." : "Save Settings"}
                  </button>
                  <button className="clan-btn clan-btn-muted" onClick={() => setShowSettings(false)}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              {canEditSettings && !showSettings && (
                <button className="clan-btn" onClick={openSettings}>
                  ⚙️ Edit Clan
                </button>
              )}
              <button className="clan-btn clan-btn-danger" onClick={handleLeave}>
                Leave Clan
              </button>
            </div>
          </div>
        )}

        {/* BROWSE TAB */}
        {tab === "browse" && (
          <div className="clan-list">
            {clanList.length === 0 && <p style={{ color: "#888" }}>No clans found.</p>}
            {clanList.map((c) => (
              <div key={c.id} className="clan-list-item">
                <div>
                  <span className="clan-list-name">{c.name}</span>
                  <span className="clan-list-tag">[{c.tag}]</span>
                  <div className="clan-list-members">{c.memberCount} member{c.memberCount !== 1 ? "s" : ""}</div>
                  {c.description && <div style={{ fontSize: "0.8rem", color: "#777", marginTop: 2 }}>{c.description}</div>}
                </div>
                {!myClan && (
                  <button className="clan-btn clan-btn-sm" onClick={() => handleJoin(c.id)}>Join</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CREATE TAB */}
        {tab === "create" && !myClan && (
          <div className="clan-form">
            <label>Clan Name (3-24 characters)</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={24}
              placeholder="My Clan"
            />
            <label>Clan Tag (2-6 characters, shown in-game)</label>
            <input
              value={createTag}
              onChange={(e) => setCreateTag(e.target.value)}
              maxLength={6}
              placeholder="TAG"
            />
            <label>Description (optional)</label>
            <textarea
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="Tell others about your clan..."
            />
            <p style={{ fontSize: "0.8rem", color: "#888" }}>
              {isAdmin ? "Admins create clans for free." : "Creating a clan costs 50 beans."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="clan-btn"
                onClick={handleCreate}
                disabled={createName.trim().length < 3 || createTag.trim().length < 2}
              >
                Create Clan
              </button>
              {success?.includes("Payment") && (
                <button className="clan-btn" onClick={handleConfirmPayment}>
                  Confirm Payment
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
