import { useState, useEffect, useCallback } from "react";
import "./Shop.css";

interface ShopItem {
  id: string;
  name: string;
  price: number;
  tokens: number;
  type: string;
  section: string;
  skinTokens?: number;
  effectTokens?: number;
}

interface ShopOrder {
  id: string;
  itemId: string;
  amount: number;
  tokens: number;
  tokenType: string;
  skinTokens?: number;
  effectTokens?: number;
  status: string;
  createdAt: number;
}

interface ShopProps {
  serverBaseUrl: string;
  sessionToken: string;
  onClose: () => void;
}

const POWERUP_INFO: Record<string, { label: string; icon: string }> = {
  virus_layer:     { label: "Virus Layer",     icon: "🦠" },
  speed_boost:     { label: "Speed Boost",     icon: "⚡" },
  ghost_mode:      { label: "Ghost Mode",      icon: "👻" },
  mass_magnet:     { label: "Mass Magnet",     icon: "🧲" },
  freeze_splitter: { label: "Freeze Splitter", icon: "❄️" },
  recombine:       { label: "Recombine",       icon: "🔄" },
};

const POWERUP_CHARGES: Record<string, number> = {
  virus_layer: 5, speed_boost: 3, ghost_mode: 1,
  mass_magnet: 2, freeze_splitter: 3, recombine: 1,
};

export function Shop({ serverBaseUrl, sessionToken, onClose }: ShopProps) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [currency, setCurrency] = useState("Beans");
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchShopData = useCallback(async () => {
    try {
      const [itemsResp, ordersResp] = await Promise.all([
        fetch(`${serverBaseUrl}/api/shop/items`),
        fetch(`${serverBaseUrl}/api/shop/orders?session=${encodeURIComponent(sessionToken)}`),
      ]);
      if (itemsResp.ok) {
        const data = await itemsResp.json();
        setItems(data.items || []);
        if (data.currency) setCurrency(data.currency);
      }
      if (ordersResp.ok) {
        const data = await ordersResp.json();
        setOrders(data.orders || []);
      }
    } catch {
      setError("Failed to load shop data");
    } finally {
      setLoading(false);
    }
  }, [serverBaseUrl, sessionToken]);

  useEffect(() => {
    fetchShopData();
    const interval = setInterval(fetchShopData, 10000);
    return () => clearInterval(interval);
  }, [fetchShopData]);

  const handlePurchase = useCallback(async (itemId: string) => {
    setPurchasing(itemId);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch(
        `${serverBaseUrl}/api/shop/purchase?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) }
      );
      if (!resp.ok) {
        const data = await resp.json();
        setError(data.error || "Purchase failed");
        return;
      }
      const data = await resp.json();
      if (data.paymentUrl) {
        window.open(data.paymentUrl, "_blank", "noopener");
        setSuccess("Payment page opened! Complete the transfer to receive your items.");
      }
      fetchShopData();
    } catch {
      setError("Failed to initiate purchase");
    } finally {
      setPurchasing(null);
    }
  }, [serverBaseUrl, sessionToken, fetchShopData]);

  const handleCancel = useCallback(async (orderId: string) => {
    setError(null);
    try {
      const resp = await fetch(
        `${serverBaseUrl}/api/shop/cancel?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) }
      );
      if (!resp.ok) {
        const data = await resp.json();
        setError(data.error || "Cancel failed");
        return;
      }
      fetchShopData();
    } catch {
      setError("Failed to cancel order");
    }
  }, [serverBaseUrl, sessionToken, fetchShopData]);

  const pendingOrders = orders.filter(o => o.status === "pending");
  const completedOrders = orders.filter(o => o.status === "completed");

  const skinItems = items.filter(i => i.section === "skin");
  const effectItems = items.filter(i => i.section === "effect");
  const bundleItems = items.filter(i => i.section === "bundle");
  const powerupItem = items.find(i => i.section === "powerup");
  const customSkinItem = items.find(i => i.section === "custom_skin");
  const clanItem = items.find(i => i.section === "clan");

  const skinBaseRate = skinItems.length > 0 ? skinItems[0].tokens / skinItems[0].price : 1;
  const effectBaseRate = effectItems.length > 0 ? effectItems[0].tokens / effectItems[0].price : 1;

  const bonusPct = (item: ShopItem): number => {
    const rate = item.tokens / item.price;
    const base = item.section === "skin" ? skinBaseRate : effectBaseRate;
    return Math.round(((rate - base) / base) * 100);
  };

  const bundleSavings = (item: ShopItem): number => {
    const skinCost = (item.skinTokens || 0) / skinBaseRate;
    const effectCost = (item.effectTokens || 0) / effectBaseRate;
    const individualCost = skinCost + effectCost;
    if (individualCost <= 0) return 0;
    return Math.round(((individualCost - item.price) / individualCost) * 100);
  };

  return (
    <div className="shop-overlay" onClick={onClose}>
      <div className="shop-panel" onClick={e => e.stopPropagation()}>
        <div className="shop-header">
          <h2>🛒 Shop</h2>
          <button className="shop-close" onClick={onClose}>&times;</button>
        </div>

        <p className="shop-desc">
          Spend <strong>{currency}</strong> on tokens, powerups, and exclusive skins.
        </p>

        {loading ? (
          <div className="shop-loading">Loading...</div>
        ) : (
          <>
            {error && <div className="shop-error">{error}</div>}
            {success && <div className="shop-success">{success}</div>}

            {/* ── Wide category grid ── */}
            <div className="shop-grid">
              {/* ── Skin Tokens ── */}
              <div className="shop-category">
                <div className="shop-cat-header skin-cat">
                  <span className="shop-cat-icon">🎨</span>
                  <span className="shop-cat-title">Skin Tokens</span>
                </div>
                <div className="shop-cat-items">
                  {skinItems.map(item => (
                    <div key={item.id} className="shop-card skin-card">
                      {bonusPct(item) > 0 && <span className="shop-card-badge green-badge">+{bonusPct(item)}%</span>}
                      <div className="shop-card-value">{item.tokens}</div>
                      <div className="shop-card-label">tokens</div>
                      <div className="shop-card-price">🫘 {item.price}</div>
                      <button
                        className="shop-card-btn skin-btn"
                        onClick={() => handlePurchase(item.id)}
                        disabled={purchasing === item.id}
                      >{purchasing === item.id ? "..." : "Buy"}</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Effect Tokens ── */}
              <div className="shop-category">
                <div className="shop-cat-header effect-cat">
                  <span className="shop-cat-icon">✦</span>
                  <span className="shop-cat-title">Effect Tokens</span>
                </div>
                <div className="shop-cat-items">
                  {effectItems.map(item => (
                    <div key={item.id} className="shop-card effect-card">
                      {bonusPct(item) > 0 && <span className="shop-card-badge purple-badge">+{bonusPct(item)}%</span>}
                      <div className="shop-card-value">{item.tokens}</div>
                      <div className="shop-card-label">tokens</div>
                      <div className="shop-card-price">🫘 {item.price}</div>
                      <button
                        className="shop-card-btn effect-btn"
                        onClick={() => handlePurchase(item.id)}
                        disabled={purchasing === item.id}
                      >{purchasing === item.id ? "..." : "Buy"}</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Bundles ── */}
              <div className="shop-category">
                <div className="shop-cat-header bundle-cat">
                  <span className="shop-cat-icon">🎁</span>
                  <span className="shop-cat-title">Bundles</span>
                  <span className="shop-cat-badge">Best Value!</span>
                </div>
                <div className="shop-cat-items">
                  {bundleItems.map(item => (
                    <div key={item.id} className="shop-card bundle-card">
                      {bundleSavings(item) > 0 && <span className="shop-card-badge gold-badge">-{bundleSavings(item)}%</span>}
                      <div className="shop-card-name">{item.name}</div>
                      <div className="shop-card-breakdown">
                        🎨 {item.skinTokens} + ✦ {item.effectTokens}
                      </div>
                      <div className="shop-card-price">🫘 {item.price}</div>
                      <button
                        className="shop-card-btn bundle-btn"
                        onClick={() => handlePurchase(item.id)}
                        disabled={purchasing === item.id}
                      >{purchasing === item.id ? "..." : "Buy"}</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Powerup Pack ── */}
              {powerupItem && (
                <div className="shop-category">
                  <div className="shop-cat-header powerup-cat">
                    <span className="shop-cat-icon">⚡</span>
                    <span className="shop-cat-title">Powerups</span>
                  </div>
                  <div className="shop-cat-items">
                    <div className="shop-card powerup-card wide-card">
                      <div className="shop-card-name">{powerupItem.name}</div>
                      <div className="powerup-pack-list">
                        {Object.entries(POWERUP_CHARGES).map(([pType, charges]) => (
                          <span key={pType} className="powerup-pack-entry" title={POWERUP_INFO[pType]?.label}>
                            {POWERUP_INFO[pType]?.icon} ×{charges}
                          </span>
                        ))}
                      </div>
                      <div className="shop-card-price">🫘 {powerupItem.price}</div>
                      <button
                        className="shop-card-btn powerup-btn"
                        onClick={() => handlePurchase(powerupItem.id)}
                        disabled={purchasing === powerupItem.id}
                      >{purchasing === powerupItem.id ? "..." : "Buy"}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Custom Skin ── */}
              {customSkinItem && (
                <div className="shop-category">
                  <div className="shop-cat-header custom-cat">
                    <span className="shop-cat-icon">🖼️</span>
                    <span className="shop-cat-title">Custom Skin</span>
                  </div>
                  <div className="shop-cat-items">
                    <div className="shop-card custom-card wide-card">
                      <div className="shop-card-name">Upload Your Own Skin</div>
                      <div className="shop-card-detail">
                        Upload a personal skin image that only you can use.
                      </div>
                      <div className="shop-card-price">🫘 {customSkinItem.price}</div>
                      <button
                        className="shop-card-btn custom-btn"
                        onClick={() => handlePurchase(customSkinItem.id)}
                        disabled={purchasing === customSkinItem.id}
                      >{purchasing === customSkinItem.id ? "..." : "Buy Slot"}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Create a Clan ── */}
              {clanItem && (
                <div className="shop-category">
                  <div className="shop-cat-header clan-cat">
                    <span className="shop-cat-icon">🏰</span>
                    <span className="shop-cat-title">Clans</span>
                  </div>
                  <div className="shop-cat-items">
                    <div className="shop-card clan-card wide-card">
                      <div className="shop-card-name">Create a Clan</div>
                      <div className="shop-card-detail">
                        Start your own clan — invite friends and climb the ranks together.
                      </div>
                      <div className="shop-card-price">🫘 {clanItem.price}</div>
                      <button
                        className="shop-card-btn clan-btn"
                        onClick={() => handlePurchase(clanItem.id)}
                        disabled={purchasing === clanItem.id}
                      >{purchasing === clanItem.id ? "..." : "Buy"}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Pending Orders ── */}
            {pendingOrders.length > 0 && (
              <div className="shop-orders">
                <h3>⏳ Pending Orders</h3>
                <p className="shop-orders-hint">Complete the payment on {currency} to receive items. Auto-refreshes.</p>
                {pendingOrders.map(order => (
                  <div key={order.id} className="shop-order pending">
                    <span className="shop-order-tokens">
                      {order.tokenType === "bundle"
                        ? `🎨 ${order.skinTokens ?? "?"} + ✦ ${order.effectTokens ?? "?"}`
                        : order.tokenType === "powerup"
                        ? "⚡ Powerup Pack"
                        : order.tokenType === "custom_skin"
                        ? "🖼️ Custom Skin Slot"
                        : order.tokenType === "clan"
                        ? "🏰 Clan Creation"
                        : `${order.tokens} ${order.tokenType === "effect" ? "effect" : "skin"} tokens`}
                    </span>
                    <span className="shop-order-amount">🫘 {order.amount}</span>
                    <span className="shop-order-status">Waiting for payment...</span>
                    <button className="shop-order-cancel" onClick={() => handleCancel(order.id)} title="Cancel">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Completed Orders ── */}
            {completedOrders.length > 0 && (
              <div className="shop-orders">
                <h3>✅ Completed</h3>
                {completedOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="shop-order completed">
                    <span className="shop-order-tokens">
                      {order.tokenType === "bundle"
                        ? `🎨 ${order.skinTokens ?? "?"} + ✦ ${order.effectTokens ?? "?"}`
                        : order.tokenType === "powerup"
                        ? "⚡ Powerup Pack"
                        : order.tokenType === "custom_skin"
                        ? "🖼️ Custom Skin Slot"
                        : order.tokenType === "clan"
                        ? "🏰 Clan Creation"
                        : `${order.tokens} ${order.tokenType === "effect" ? "effect" : "skin"} tokens`}
                    </span>
                    <span className="shop-order-amount">🫘 {order.amount}</span>
                    <span className="shop-order-status">Delivered!</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
