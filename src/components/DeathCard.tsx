import { useEffect } from "react";
import "./DeathCard.css";

interface DeathCardProps {
  peakMass: number;
  cellsEaten: number;
  timeAlive: number; // seconds
  onPlayAgain: () => void;
  onSpectate: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function DeathCard({
  peakMass,
  cellsEaten,
  timeAlive,
  onPlayAgain,
  onSpectate,
}: DeathCardProps) {
  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(onSpectate, 8000);
    return () => clearTimeout(timer);
  }, [onSpectate]);

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSpectate();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSpectate]);

  return (
    <div className="death-card-overlay" onClick={onSpectate}>
      <div className="death-card" onClick={(e) => e.stopPropagation()}>
        <h2>You Died</h2>
        <div className="death-card-stats">
          <div className="death-stat">
            <span className="death-stat-value">{peakMass.toLocaleString()}</span>
            <span className="death-stat-label">Peak Mass</span>
          </div>
          <div className="death-stat">
            <span className="death-stat-value">{cellsEaten}</span>
            <span className="death-stat-label">Players Eaten</span>
          </div>
          <div className="death-stat">
            <span className="death-stat-value">{formatTime(timeAlive)}</span>
            <span className="death-stat-label">Time Alive</span>
          </div>
          <div className="death-stat">
            <span className="death-stat-value">
              {timeAlive > 0 ? (peakMass / (timeAlive / 60)).toFixed(0) : "0"}
            </span>
            <span className="death-stat-label">Mass / Min</span>
          </div>
        </div>
        <div className="death-card-actions">
          <button className="death-card-btn primary" onClick={onPlayAgain}>
            Play Again
          </button>
          <button className="death-card-btn secondary" onClick={onSpectate}>
            Spectate
          </button>
        </div>
      </div>
    </div>
  );
}
