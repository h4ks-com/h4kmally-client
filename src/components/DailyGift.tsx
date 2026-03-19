import { useState, useEffect, useCallback } from "react";
import "./DailyGift.css";

interface DailyGiftData {
  code: string;
  redeemUrl: string;
  amount: number;
  createdAt: number;
  redeemed: boolean;
}

interface DailyGiftProps {
  serverBaseUrl: string;
  sessionToken: string;
}

export function DailyGift({ serverBaseUrl, sessionToken }: DailyGiftProps) {
  const [gift, setGift] = useState<DailyGiftData | null>(null);
  const [available, setAvailable] = useState(false);
  const [nextGiftAt, setNextGiftAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGift = useCallback(async () => {
    try {
      const resp = await fetch(
        `${serverBaseUrl}/api/shop/daily-gift?session=${encodeURIComponent(sessionToken)}`
      );
      if (resp.status === 404) {
        // Shop not enabled on this server
        setLoading(false);
        return;
      }
      if (!resp.ok) {
        setLoading(false);
        return;
      }
      const data = await resp.json();
      if (data.gift) {
        setGift(data.gift);
        setAvailable(data.available);
      }
      if (data.nextGiftAt) {
        setNextGiftAt(data.nextGiftAt);
      }
    } catch {
      setError("Failed to check daily gift");
    } finally {
      setLoading(false);
    }
  }, [serverBaseUrl, sessionToken]);

  useEffect(() => {
    fetchGift();
  }, [fetchGift]);

  const handleClaim = useCallback(() => {
    if (gift?.redeemUrl) {
      window.open(gift.redeemUrl, "_blank", "noopener");
    }
  }, [gift]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // Don't show if loading, dismissed, no gift, or gift already redeemed
  if (loading || dismissed || error) return null;
  if (!gift) {
    // No gift available yet — show countdown if we have nextGiftAt
    if (nextGiftAt) {
      const now = Math.floor(Date.now() / 1000);
      const remaining = nextGiftAt - now;
      if (remaining > 0) {
        return (
          <div className="daily-gift-banner">
            <div className="daily-gift-content">
              <span className="daily-gift-icon">🎁</span>
              <span className="daily-gift-text">
                Next daily gift in {formatTime(remaining)}
              </span>
            </div>
            <button className="daily-gift-dismiss" onClick={handleDismiss}>✕</button>
          </div>
        );
      }
    }
    return null;
  }

  if (gift.redeemed) {
    // Gift was already redeemed
    return (
      <div className="daily-gift-banner redeemed">
        <div className="daily-gift-content">
          <span className="daily-gift-icon">✅</span>
          <span className="daily-gift-text">
            Daily gift redeemed! 🫘 {gift.amount} beans
          </span>
        </div>
        <button className="daily-gift-dismiss" onClick={handleDismiss}>✕</button>
      </div>
    );
  }

  // Gift is available and not yet redeemed
  return (
    <div className="daily-gift-banner available">
      <div className="daily-gift-content">
        <span className="daily-gift-icon">🎁</span>
        <span className="daily-gift-text">
          {available ? "Daily gift ready!" : "Claim your daily gift!"} <strong>🫘 {gift.amount} beans</strong>
        </span>
      </div>
      <button className="daily-gift-claim" onClick={handleClaim}>
        Claim
      </button>
      <button className="daily-gift-dismiss" onClick={handleDismiss}>✕</button>
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
