import type { LeaderboardEntry } from "../protocol";
import "./HUD.css";

interface HUDProps {
  score: number;
  latency: number;
  leaderboard: LeaderboardEntry[];
  levelUpText?: string | null;
}

export function HUD({ score, latency, leaderboard, levelUpText }: HUDProps) {
  return (
    <>
      {/* Score */}
      <div className="hud-score">Score: {score}</div>

      {/* Level Up notification */}
      {levelUpText && (
        <div className="hud-levelup">{levelUpText}</div>
      )}

      {/* Ping */}
      <div className="hud-ping">{Math.round(latency)}ms</div>

      {/* Leaderboard */}
      <div className="hud-leaderboard">
        <div className="hud-lb-title">Leaderboard</div>
        {leaderboard.map((entry) => (
          <div
            key={entry.rank}
            className={`hud-lb-entry ${entry.isMe ? "hud-lb-me" : ""}`}
          >
            <span className="hud-lb-rank">{entry.rank}.</span>
            <span className="hud-lb-name">{entry.name || "unnamed"}</span>
          </div>
        ))}
      </div>
    </>
  );
}
