import { useState, useCallback } from "react";
import "./TokenReveal.css";

interface PendingEffectToken {
  effectName: string;
}

// Display labels for effect IDs
const EFFECT_LABELS: Record<string, { label: string; icon: string }> = {
  sakura:      { label: "Sakura",      icon: "🌸" },
  frost:       { label: "Frost",       icon: "❄️" },
  shadow_aura: { label: "Shadow Aura", icon: "🌑" },
  flame:       { label: "Flame",       icon: "🔥" },
  glitch:      { label: "Glitch",      icon: "⚡" },
  blackhole:   { label: "Black Hole",  icon: "🕳️" },
};

interface EffectTokenRevealProps {
  tokens: PendingEffectToken[];
  serverBaseUrl: string;
  sessionToken: string;
  onDone: () => void;
}

export function EffectTokenReveal({ tokens, serverBaseUrl, sessionToken, onDone }: EffectTokenRevealProps) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [allDone, setAllDone] = useState(false);

  const revealToken = useCallback((index: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(index);
      if (next.size === tokens.length) {
        setTimeout(() => setAllDone(true), 600);
      }
      return next;
    });
  }, [tokens.length]);

  const handleDone = useCallback(async () => {
    try {
      await fetch(
        `${serverBaseUrl}/api/auth/effect-tokens/reveal?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST" }
      );
    } catch {
      // ignore
    }
    onDone();
  }, [serverBaseUrl, sessionToken, onDone]);

  const tokenCounts: Record<string, number> = {};
  for (const t of tokens) {
    tokenCounts[t.effectName] = (tokenCounts[t.effectName] || 0) + 1;
  }

  return (
    <div className="token-reveal-overlay">
      <div className="token-reveal-panel">
        <div className="token-reveal-header">
          <h2>✦ New Effect Tokens!</h2>
          <p className="token-reveal-subtitle">
            Click each token to reveal your effect!
          </p>
        </div>

        <div className="token-reveal-grid">
          {tokens.map((token, i) => {
            const isRevealed = revealed.has(i);
            const info = EFFECT_LABELS[token.effectName] || { label: token.effectName, icon: "✦" };
            return (
              <div
                key={i}
                className={`token-card ${isRevealed ? "revealed" : ""}`}
                onClick={() => !isRevealed && revealToken(i)}
              >
                <div className="token-card-inner">
                  <div className="token-back">
                    <div className="token-back-design">
                      <span className="token-question">✦</span>
                      <div className="token-sparkle s1">✧</div>
                      <div className="token-sparkle s2">✦</div>
                      <div className="token-sparkle s3">✧</div>
                    </div>
                  </div>
                  <div className="token-front">
                    <span className="effect-token-icon">{info.icon}</span>
                    <span className="token-skin-name">{info.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {allDone && (
          <div className="token-reveal-summary">
            <h3>You received:</h3>
            <div className="token-summary-list">
              {Object.entries(tokenCounts).map(([effectName, count]) => {
                const info = EFFECT_LABELS[effectName] || { label: effectName, icon: "✦" };
                return (
                  <div key={effectName} className="token-summary-item">
                    <span className="effect-token-icon">{info.icon}</span>
                    <span className="token-summary-name">{info.label}</span>
                    <span className="token-summary-count">×{count}</span>
                  </div>
                );
              })}
            </div>
            <button className="token-reveal-done" onClick={handleDone}>
              Awesome!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
