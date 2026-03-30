import { useState, useEffect, useCallback } from "react";
import "./BountyPanel.css";

interface Bounty {
  id: string;
  posterSub: string;
  posterName: string;
  targetName: string;
  rewardType: "beans" | "powerup";
  rewardKey: string;
  rewardAmount: number;
  status: string;
  claimedBy?: string;
  createdAt: number;
}

interface BountyPanelProps {
  serverBaseUrl: string;
  sessionToken: string | null;
  onClose: () => void;
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

export function BountyPanel({ serverBaseUrl, sessionToken, onClose }: BountyPanelProps) {
  const [tab, setTab] = useState<"active" | "mine">("active");
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [targetName, setTargetName] = useState("");
  const [rewardType, setRewardType] = useState<"beans" | "powerup">("beans");
  const [rewardKey, setRewardKey] = useState("speed_boost");
  const [rewardAmount, setRewardAmount] = useState(50);
  const [creating, setCreating] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");

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

  const handleCreate = async () => {
    if (!sessionToken || !targetName.trim()) return;
    setCreating(true);
    setError("");
    setPaymentUrl("");
    try {
      const res = await fetch(`${serverBaseUrl}/api/bounties/create?session=${sessionToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetName: targetName.trim(),
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
        setTargetName("");
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
                  {tab === "mine" && b.status === "active" && (
                    <button className="bounty-cancel-btn" onClick={() => handleCancel(b.id)}>
                      Cancel
                    </button>
                  )}
                  {tab === "mine" && b.status === "pending_payment" && (
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
              <div className="bounty-form-row">
                <label>Target:</label>
                <input
                  type="text"
                  placeholder="Player name"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  maxLength={50}
                />
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
                disabled={creating || !targetName.trim()}
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
