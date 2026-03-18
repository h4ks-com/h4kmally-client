import { useState, useCallback } from "react";
import { getSkinFile } from "../skinFileMap";
import "./TokenReveal.css";

interface PendingToken {
  skinName: string;
}

interface TokenRevealProps {
  tokens: PendingToken[];
  serverBaseUrl: string;
  sessionToken: string;
  onDone: () => void;
}

export function TokenReveal({ tokens, serverBaseUrl, sessionToken, onDone }: TokenRevealProps) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [allDone, setAllDone] = useState(false);

  const revealToken = useCallback((index: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(index);
      // Check if all are revealed
      if (next.size === tokens.length) {
        setTimeout(() => setAllDone(true), 600);
      }
      return next;
    });
  }, [tokens.length]);

  const handleDone = useCallback(async () => {
    // Tell server we've seen the tokens
    try {
      await fetch(
        `${serverBaseUrl}/api/auth/tokens/reveal?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST" }
      );
    } catch {
      // ignore
    }
    onDone();
  }, [serverBaseUrl, sessionToken, onDone]);

  // Group tokens by skin for the summary
  const tokenCounts: Record<string, number> = {};
  for (const t of tokens) {
    tokenCounts[t.skinName] = (tokenCounts[t.skinName] || 0) + 1;
  }

  return (
    <div className="token-reveal-overlay">
      <div className="token-reveal-panel">
        <div className="token-reveal-header">
          <h2>🎉 New Skin Tokens!</h2>
          <p className="token-reveal-subtitle">
            Click each token to reveal what you won!
          </p>
        </div>

        <div className="token-reveal-grid">
          {tokens.map((token, i) => {
            const isRevealed = revealed.has(i);
            return (
              <div
                key={i}
                className={`token-card ${isRevealed ? "revealed" : ""}`}
                onClick={() => !isRevealed && revealToken(i)}
              >
                <div className="token-card-inner">
                  {/* Back face */}
                  <div className="token-back">
                    <div className="token-back-design">
                      <span className="token-question">?</span>
                      <div className="token-sparkle s1">✦</div>
                      <div className="token-sparkle s2">✧</div>
                      <div className="token-sparkle s3">✦</div>
                    </div>
                  </div>
                  {/* Front face */}
                  <div className="token-front">
                    <img
                      src={`${serverBaseUrl}/skins/${getSkinFile(token.skinName)}`}
                      alt={token.skinName}
                      loading="lazy"
                    />
                    <span className="token-skin-name">{token.skinName}</span>
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
              {Object.entries(tokenCounts).map(([skinName, count]) => (
                <div key={skinName} className="token-summary-item">
                  <img
                    src={`${serverBaseUrl}/skins/${getSkinFile(skinName)}`}
                    alt={skinName}
                  />
                  <span className="token-summary-name">{skinName}</span>
                  <span className="token-summary-count">×{count}</span>
                </div>
              ))}
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
