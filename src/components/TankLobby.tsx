import { useState, useEffect, useCallback } from "react";
import type { TankLobbyState, TankMemberInfo } from "../protocol";
import "./TankLobby.css";

interface TankLobbyProps {
  tankState: TankLobbyState | null;
  onQueue: (size: number, isPrivate: boolean) => void;
  onJoin: (code: string) => void;
  onCancel: () => void;
  onVote: (skin: string, effect: string) => void;
  onClose: () => void;
  connectionState: string;
}

export function TankLobby({
  tankState,
  onQueue,
  onJoin,
  onCancel,
  onVote,
  onClose,
  connectionState,
}: TankLobbyProps) {
  const [mode, setMode] = useState<"menu" | "waiting" | "voting" | "playing">("menu");
  const [tankSize, setTankSize] = useState(2);
  const [joinCode, setJoinCode] = useState("");
  const [skinVote, setSkinVote] = useState("");
  const [effectVote, setEffectVote] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState("");

  // Sync mode with server state
  useEffect(() => {
    if (!tankState) return;
    if (tankState.state === "error") {
      setError(tankState.error || "Unknown error");
      setMode("menu");
      return;
    }
    if (tankState.state === "waiting") setMode("waiting");
    if (tankState.state === "voting") setMode("voting");
    if (tankState.state === "playing") setMode("playing");
    if (tankState.state === "ended") {
      setMode("menu");
      setHasVoted(false);
      setSkinVote("");
      setEffectVote("");
    }
  }, [tankState]);

  const handlePublicQueue = useCallback(() => {
    setError("");
    onQueue(tankSize, false);
  }, [tankSize, onQueue]);

  const handlePrivateCreate = useCallback(() => {
    setError("");
    onQueue(tankSize, true);
  }, [tankSize, onQueue]);

  const handleJoinCode = useCallback(() => {
    if (!joinCode.trim()) return;
    setError("");
    onJoin(joinCode.trim().toUpperCase());
  }, [joinCode, onJoin]);

  const handleVote = useCallback(() => {
    if (!skinVote && !effectVote) return;
    onVote(skinVote, effectVote);
    setHasVoted(true);
  }, [skinVote, effectVote, onVote]);

  const handleCancel = useCallback(() => {
    onCancel();
    setMode("menu");
    setHasVoted(false);
    setError("");
  }, [onCancel]);

  // Menu: choose tank size and queue type
  if (mode === "menu") {
    return (
      <div className="tank-lobby">
        <div className="tank-lobby-header">
          <h2>&#x1F680; Tank Mode</h2>
          <button className="tank-close-btn" onClick={onClose}>&times;</button>
        </div>
        <p className="tank-description">
          Multiple players control one body! Movement is averaged, any player can split/eject.
        </p>

        {error && <div className="tank-error">{error}</div>}

        <div className="tank-size-selector">
          <label>Tank Size:</label>
          <div className="tank-size-options">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                className={`tank-size-btn ${tankSize === n ? "active" : ""}`}
                onClick={() => setTankSize(n)}
              >
                {n} Players
              </button>
            ))}
          </div>
        </div>

        <div className="tank-actions">
          <button
            className="tank-btn tank-btn-public"
            onClick={handlePublicQueue}
            disabled={connectionState !== "connected"}
          >
            &#x1F310; Find Public Match
          </button>
          <button
            className="tank-btn tank-btn-private"
            onClick={handlePrivateCreate}
            disabled={connectionState !== "connected"}
          >
            &#x1F512; Create Private Lobby
          </button>
        </div>

        <div className="tank-join-section">
          <span className="tank-join-label">Or join by code:</span>
          <div className="tank-join-row">
            <input
              className="tank-code-input"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
            />
            <button
              className="tank-btn tank-btn-join"
              onClick={handleJoinCode}
              disabled={connectionState !== "connected" || !joinCode.trim()}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Waiting state
  if (mode === "waiting") {
    return (
      <div className="tank-lobby">
        <div className="tank-lobby-header">
          <h2>&#x23F3; Waiting for Players</h2>
        </div>

        {tankState?.code && (
          <div className="tank-code-display">
            <span>Lobby Code:</span>
            <strong className="tank-code-value">{tankState.code}</strong>
            <button
              className="tank-code-copy"
              onClick={() => navigator.clipboard.writeText(tankState.code || "")}
              title="Copy code"
            >
              &#x1F4CB;
            </button>
          </div>
        )}

        <div className="tank-members">
          <div className="tank-member-header">
            Players ({tankState?.members?.length || 0}/{tankState?.desiredSize || "?"})
          </div>
          {tankState?.members?.map((m: TankMemberInfo, i: number) => (
            <div key={i} className="tank-member">
              <span className="tank-member-name">
                {m.isHost && <span className="tank-host-badge">&#x1F451;</span>}
                {m.name || "Anonymous"}
              </span>
            </div>
          ))}
        </div>

        {typeof tankState?.waitTimer === "number" && (
          <div className="tank-timer">
            Time remaining: <strong>{tankState.waitTimer}s</strong>
          </div>
        )}

        <button className="tank-btn tank-btn-cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    );
  }

  // Voting state
  if (mode === "voting") {
    const allSkins = tankState?.allSkins || [];
    const allEffects = tankState?.allEffects || [];

    return (
      <div className="tank-lobby">
        <div className="tank-lobby-header">
          <h2>&#x1F3A8; Vote on Appearance</h2>
        </div>

        <div className="tank-members">
          <div className="tank-member-header">Tank Members</div>
          {tankState?.members?.map((m: TankMemberInfo, i: number) => (
            <div key={i} className="tank-member">
              <span className="tank-member-name">
                {m.isHost && <span className="tank-host-badge">&#x1F451;</span>}
                {m.name || "Anonymous"}
              </span>
              {m.voted ? (
                <span className="tank-vote-badge">&#x2705; Voted</span>
              ) : (
                <span className="tank-vote-pending">Voting...</span>
              )}
            </div>
          ))}
        </div>

        {typeof tankState?.voteTimer === "number" && (
          <div className="tank-timer">
            Vote ends in: <strong>{tankState.voteTimer}s</strong>
          </div>
        )}

        {!hasVoted ? (
          <div className="tank-vote-form">
            {allSkins.length > 0 && (
              <div className="tank-vote-group">
                <label>Skin:</label>
                <div className="tank-vote-options">
                  {allSkins.map((s) => (
                    <button
                      key={s}
                      className={`tank-vote-btn ${skinVote === s ? "active" : ""}`}
                      onClick={() => setSkinVote(s)}
                    >
                      {s || "Default"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {allEffects.length > 0 && (
              <div className="tank-vote-group">
                <label>Effect:</label>
                <div className="tank-vote-options">
                  {allEffects.map((e) => (
                    <button
                      key={e}
                      className={`tank-vote-btn ${effectVote === e ? "active" : ""}`}
                      onClick={() => setEffectVote(e)}
                    >
                      {e || "None"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className="tank-btn tank-btn-vote"
              onClick={handleVote}
              disabled={!skinVote && !effectVote}
            >
              &#x2714; Cast Vote
            </button>
          </div>
        ) : (
          <div className="tank-vote-status">
            &#x2705; Vote submitted! Waiting for other players...
          </div>
        )}

        <button className="tank-btn tank-btn-cancel" onClick={handleCancel}>
          Leave
        </button>
      </div>
    );
  }

  // Playing state (this component is typically hidden during gameplay)
  if (mode === "playing") {
    return (
      <div className="tank-lobby tank-playing-indicator">
        <div className="tank-playing-label">
          &#x1F680; TANK MODE ACTIVE
        </div>
        <div className="tank-playing-members">
          {tankState?.members?.map((m: TankMemberInfo, i: number) => (
            <span key={i} className="tank-playing-name">{m.name}</span>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
