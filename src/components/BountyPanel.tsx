import { useState, useEffect, useCallback, useRef } from "react";
import "./BountyPanel.css";

interface Bounty {
  id: string;
  posterSub: string;
  posterName: string;
  targetSub: string;
  targetName: string;
  rewardType: "beans" | "powerup";
  rewardKey: string;
  rewardAmount: number;
  status: string;
  claimedBy?: string;
  createdAt: number;
}

interface OnlineUser {
  sub: string;
  displayName: string;
}

interface BountyPanelProps {
  serverBaseUrl: string;
  sessionToken: string | null;
  onClose: () => void;
  prefillTargetName?: string; // pre-fill target search from death card
}

const POWERUP_LABELS: Record<string, string> = {
  virus_layer: "Virus Layer",
  speed_boost: "Speed Boost",
  ghost_mode: "Ghost Mode",
  mass_magnet: "Mass Magnet",
  freeze_splitter: "Freeze Splitter",
  recombine: "Recombine",
};

function rewardLabel(b: Bounty): string {
  if (b.rewardType === "beans") return `${b.rewardAmount} beans`;
  const name = POWERUP_LABELS[b.rewardKey] || b.rewardKey;
  return `${b.rewardAmount}× ${name}`;
}

function timeAgo(unix: number): string {
  const d = Math.floor(Date.now() / 1000 - unix);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function BountyPanel({ serverBaseUrl, sessionToken, onClose, prefillTargetName }: BountyPanelProps) {
  const [tab, setTab] = useState<"active" | "mine">("active");
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [targetSearch, setTargetSearch] = useState(prefillTargetName || "");
  const [selectedTarget, setSelectedTarget] = useState<OnlineUser | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [rewardType, setRewardType] = useState<"beans" | "powerup">("beans");
  const [rewardKey, setRewardKey] = useState("speed_boost");
  const [rewardAmount, setRewardAmount] = useState(50);
  const [creating, setCreating] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchBounties = useCallback(async () => {
    if (!serverBaseUrl) return;
    setLoading(true);
    try {
      const url = tab === "mine" && sessionToken
        ? `${serverBaseUrl}/api/bounties/my?session=${sessionToken}`
        : `${serverBaseUrl}/api/bounties`;
      const res = await fetch(url);
      const data = await res.json();
      setBounties(data.bounties || []);
      setError("");
    } catch {
      setError("Failed to load bounties");
    }
    setLoading(false);
  }, [serverBaseUrl, sessionToken, tab]);

  useEffect(() => {
    fetchBounties();
  }, [fetchBounties]);

  // Fetch online users for autocomplete
  const fetchOnlineUsers = useCallback(async () => {
    if (!serverBaseUrl) return;
    try {
      const res = await fetch(`${serverBaseUrl}/api/bounties/online-users`);
      const data = await res.json();
      setOnlineUsers(data.users || []);
    } catch {
      // Silently ignore
    }
  }, [serverBaseUrl]);

  useEffect(() => {
    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 10000);
    return () => clearInterval(interval);
  }, [fetchOnlineUsers]);

  // Auto-search when prefillTargetName is provided
  useEffect(() => {
    if (prefillTargetName && onlineUsers.length > 0 && !selectedTarget) {
      const match = onlineUsers.find(
        (u) => u.displayName.toLowerCase() === prefillTargetName.toLowerCase()
      );
      if (match) {
        setSelectedTarget(match);
        setTargetSearch(match.displayName);
      }
    }
  }, [prefillTargetName, onlineUsers, selectedTarget]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filter online users by search text
  const filteredUsers = targetSearch.trim()
    ? onlineUsers.filter((u) =>
        u.displayName.toLowerCase().includes(targetSearch.toLowerCase())
      )
    : onlineUsers;

  const handleSelectUser = (user: OnlineUser) => {
    setSelectedTarget(user);
    setTargetSearch(user.displayName);
    setShowDropdown(false);
  };

  const handleSearchChange = (val: string) => {
    setTargetSearch(val);
    setSelectedTarget(null);
    setShowDropdown(true);
  };

  const handleCreate = async () => {
    if (!sessionToken || !selectedTarget) return;
    setCreating(true);
    setError("");
    setPaymentUrl("");
    try {
      const res = await fetch(`${serverBaseUrl}/api/bounties/create?session=${sessionToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetSub: selectedTarget.sub,
          rewardType,
          rewardKey: rewardType === "powerup" ? rewardKey : "",
          rewardAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create bounty");
      } else {
        if (data.paymentUrl) {
          setPaymentUrl(data.paymentUrl);
        }
        setTargetSearch("");
        setSelectedTarget(null);
        fetchBounties();
      }
    } catch {
      setError("Failed to create bounty");
    }
    setCreating(false);
  };

  const handleCancel = async (bountyId: string) => {
    if (!sessionToken) return;
    try {
      const res = await fetch(`${serverBaseUrl}/api/bounties/cancel?session=${sessionToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bountyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to cancel bounty");
      } else {
        fetchBounties();
      }
    } catch {
      setError("Failed to cancel bounty");
    }
  };

  return (
    <div className="bounty-panel-overlay" onClick={onClose}>
      <div className="bounty-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bounty-panel-inner">
          <button className="bounty-close-btn" onClick={onClose}>✕</button>
          <h2>🎯 Bounty Board</h2>
          <p className="subtitle">Place bounties on players — kill them and claim the reward!</p>

          <div className="bounty-tabs">
            <button
              className={`bounty-tab ${tab === "active" ? "active" : ""}`}
              onClick={() => setTab("active")}
            >
              Active Bounties
            </button>
            {sessionToken && (
              <button
                className={`bounty-tab ${tab === "mine" ? "active" : ""}`}
                onClick={() => setTab("mine")}
              >
                My Bounties
              </button>
            )}
          </div>

          <div className="bounty-list">
            {loading && <div className="bounty-empty">Loading...</div>}
            {!loading && bounties.length === 0 && (
              <div className="bounty-empty">
                {tab === "active" ? "No active bounties" : "You haven't placed any bounties"}
              </div>
            )}
            {bounties.map((b) => (
              <div key={b.id} className="bounty-item">
                <div>
                  <div className="bounty-target">💀 {b.targetName}</div>
                  <div className="bounty-reward">{rewardLabel(b)}</div>
                  <div className="bounty-poster">
                    by {b.posterName} • {timeAgo(b.createdAt)}
                    {b.claimedBy && ` • claimed by ${b.claimedBy}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`bounty-status ${b.status}`}>{b.status.replace("_", " ")}</span>
                  {tab === "mine" && (b.status === "active" || b.status === "pending_payment") && (
                    <button className="bounty-cancel-btn" onClick={() => handleCancel(b.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {sessionToken && (
            <div className="bounty-create">
              <h3>Place a Bounty</h3>
              <div className="bounty-form-row" ref={dropdownRef} style={{ position: "relative" }}>
                <label>Target:</label>
                <div className="bounty-autocomplete-wrapper">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search online players..."
                    value={targetSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => setShowDropdown(true)}
                    maxLength={50}
                    autoComplete="off"
                    className={selectedTarget ? "bounty-input-selected" : ""}
                  />
                  {selectedTarget && (
                    <button
                      className="bounty-clear-target"
                      onClick={() => {
                        setSelectedTarget(null);
                        setTargetSearch("");
                        inputRef.current?.focus();
                      }}
                    >✕</button>
                  )}
                  {showDropdown && !selectedTarget && (
                    <div className="bounty-dropdown">
                      {filteredUsers.length === 0 ? (
                        <div className="bounty-dropdown-empty">
                          {targetSearch ? "No matching players online" : "No authenticated players online"}
                        </div>
                      ) : (
                        filteredUsers.slice(0, 15).map((u) => (
                          <div
                            key={u.sub}
                            className="bounty-dropdown-item"
                            onMouseDown={() => handleSelectUser(u)}
                          >
                            {u.displayName}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="bounty-form-row">
                <label>Reward:</label>
                <select value={rewardType} onChange={(e) => setRewardType(e.target.value as "beans" | "powerup")}>
                  <option value="beans">Beans</option>
                  <option value="powerup">Powerup</option>
                </select>
              </div>
              {rewardType === "powerup" && (
                <div className="bounty-form-row">
                  <label>Type:</label>
                  <select value={rewardKey} onChange={(e) => setRewardKey(e.target.value)}>
                    {Object.entries(POWERUP_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="bounty-form-row">
                <label>Amount:</label>
                <input
                  type="number"
                  min={rewardType === "beans" ? 10 : 1}
                  max={rewardType === "beans" ? 10000 : 50}
                  value={rewardAmount}
                  onChange={(e) => setRewardAmount(Math.max(1, parseInt(e.target.value) || 0))}
                />
              </div>
              <button
                className="bounty-submit-btn"
                onClick={handleCreate}
                disabled={creating || !selectedTarget}
              >
                {creating ? "Creating..." : rewardType === "beans" ? "Create Bounty (pay via beans)" : "Create Bounty"}
              </button>
              {paymentUrl && (
                <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="bounty-payment-link">
                  💰 Click here to pay for your bounty
                </a>
              )}
              {error && <div className="bounty-error">{error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
