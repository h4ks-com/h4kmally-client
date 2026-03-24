import { useState, useEffect, useCallback } from "react";
import "./DailyGoals.css";

interface DailyGoal {
  type: string;
  label: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
}

interface PowerupDef {
  type: string;
  label: string;
  description: string;
  charges: number;
  keySlot: number;
}

interface DailyState {
  dateKey: string;
  goals: DailyGoal[];
  powerupGranted: boolean;
  powerups?: Record<string, number>;
}

interface DailyGoalsProps {
  serverBaseUrl: string;
  sessionToken: string;
  onActivatePowerup?: () => void;
}

const POWERUP_INFO: Record<string, PowerupDef> = {
  virus_layer: { type: "virus_layer", label: "Virus Layer", description: "Drop a virus behind your farthest blob", charges: 5, keySlot: 1 },
  speed_boost: { type: "speed_boost", label: "Speed Boost", description: "6 seconds of 2× speed", charges: 3, keySlot: 2 },
  ghost_mode: { type: "ghost_mode", label: "Ghost Mode", description: "Pass through cells for 6s", charges: 1, keySlot: 3 },
  mass_magnet: { type: "mass_magnet", label: "Mass Magnet", description: "Pull nearby mass & enemies for 5s", charges: 2, keySlot: 4 },
  freeze_splitter: { type: "freeze_splitter", label: "Freeze Splitter", description: "Shoot a virus that splits & freezes an enemy for 3s", charges: 3, keySlot: 5 },
  recombine: { type: "recombine", label: "Recombine", description: "Rapidly merge all your split cells", charges: 1, keySlot: 6 },
};

const GOAL_ICONS: Record<string, string> = {
  score: "🏆",
  player_kills: "⚔️",
  virus_shoot: "🦠",
  games_played: "🎮",
  pacifist: "☮️",
  revenge: "💀",
  mass_ejected: "💨",
};

export function DailyGoals({ serverBaseUrl, sessionToken, onActivatePowerup }: DailyGoalsProps) {
  const [state, setState] = useState<DailyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  const fetchGoals = useCallback(() => {
    fetch(`${serverBaseUrl}/api/daily-goals?session=${encodeURIComponent(sessionToken)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setState(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [serverBaseUrl, sessionToken]);

  useEffect(() => {
    fetchGoals();
    const interval = setInterval(fetchGoals, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchGoals]);

  const handleActivate = () => {
    setActivating(true);
    fetch(`${serverBaseUrl}/api/daily-goals/activate-powerup?session=${encodeURIComponent(sessionToken)}`, {
      method: "POST",
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          onActivatePowerup?.();
          fetchGoals(); // refresh state
        }
        setActivating(false);
      })
      .catch(() => setActivating(false));
  };

  if (loading || !state) return null;

  const allCompleted = state.goals.every(g => g.completed);
  const powerups = state.powerups ?? {};
  const powerupEntries = Object.entries(powerups).filter(([, charges]) => charges > 0);
  const totalCharges = powerupEntries.reduce((sum, [, c]) => sum + c, 0);

  return (
    <div className="daily-goals">
      <div className="dg-header">
        <span className="dg-icon">📋</span>
        <span className="dg-title">Daily Goals</span>
        <span className="dg-date">{state.dateKey}</span>
      </div>

      <div className="dg-list">
        {state.goals.map((goal, i) => {
          const pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
          return (
            <div key={i} className={`dg-goal ${goal.completed ? "dg-completed" : ""}`}>
              <div className="dg-goal-header">
                <span className="dg-goal-icon">{GOAL_ICONS[goal.type] || "🎯"}</span>
                <span className="dg-goal-label">{goal.label}</span>
                {goal.completed && <span className="dg-check">✅</span>}
              </div>
              <div className="dg-goal-desc">{goal.description}</div>
              <div className="dg-progress-bar">
                <div className="dg-progress-fill" style={{ width: `${pct}%` }} />
                <span className="dg-progress-text">
                  {goal.progress.toLocaleString()} / {goal.target.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {allCompleted && (
        <div className="dg-reward">
          {state.powerupGranted && powerupEntries.length > 0 ? (
            <div className="dg-powerup-reward">
              <div className="dg-reward-label">🎁 Reward Earned!</div>
              {powerupEntries.map(([pType, charges]) => {
                const info = POWERUP_INFO[pType];
                if (!info) return null;
                return (
                  <div key={pType} className="dg-powerup-entry">
                    <div className="dg-powerup-name">{info.label} <span className="dg-powerup-key">[{info.keySlot}]</span></div>
                    <div className="dg-powerup-desc">{info.description}</div>
                    <div className="dg-powerup-charges">
                      {charges} charge{charges !== 1 ? "s" : ""}
                    </div>
                  </div>
                );
              })}
              {totalCharges > 0 ? (
                <button
                  className="dg-activate-btn"
                  onClick={handleActivate}
                  disabled={activating}
                >
                  {activating ? "Loading..." : "⚡ Activate in Game"}
                </button>
              ) : (
                <div className="dg-powerup-used">All charges used!</div>
              )}
            </div>
          ) : (
            <div className="dg-all-done">
              <div className="dg-reward-label">🎉 All goals complete!</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
