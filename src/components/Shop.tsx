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

export function Shop({ serverBaseUrl, sessionToken, onClose }: ShopProps) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [currency, setCurrency] = useState("Beans");
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch shop items and orders
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
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        }
      );

      if (!resp.ok) {
        const data = await resp.json();
        setError(data.error || "Purchase failed");
        return;
      }

      const data = await resp.json();
      if (data.paymentUrl) {
        window.open(data.paymentUrl, "_blank", "noopener");
        setSuccess("Payment page opened! Complete the transfer to receive your tokens.");
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
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        }
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

  const perBean = (item: ShopItem) => (item.tokens / item.price).toFixed(1);

  // Compute bonus % vs base tier for skin/effect items
  const skinBaseRate = skinItems.length > 0 ? skinItems[0].tokens / skinItems[0].price : 1;
  const effectBaseRate = effectItems.length > 0 ? effectItems[0].tokens / effectItems[0].price : 1;

  const bonusPct = (item: ShopItem): number => {
    const rate = item.tokens / item.price;
    const base = item.section === "skin" ? skinBaseRate : effectBaseRate;
    return Math.round(((rate - base) / base) * 100);
  };

  // Compute bundle savings vs buying individually at base rate
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
          <h2>🛒 Token Shop</h2>
          <button className="shop-close" onClick={onClose}>&times;</button>
        </div>

        <p className="shop-desc">
          Buy tokens with <strong>{currency}</strong> to unlock premium skins and effects.
          Collect 5 matching tokens to unlock! Effects are rarer — bundles are the best deal.
        </p>

        {loading ? (
          <div className="shop-loading">Loading...</div>
        ) : (
          <>
            {error && <div className="shop-error">{error}</div>}
            {success && <div className="shop-success">{success}</div>}

            {/* ── Skin Tokens Section ── */}
            <div className="shop-section">
              <div className="shop-section-header skin-section">
                <span className="shop-section-icon">🎨</span>
                <span className="shop-section-title">Skin Tokens</span>
              </div>
              <div className="shop-items">
                {skinItems.map(item => (
                  <div key={item.id} className="shop-item skin-item">
                    {bonusPct(item) > 0 && (
                      <span className="shop-item-bonus">+{bonusPct(item)}% bonus</span>
                    )}
                    <div className="shop-item-tokens">
                      <span className="shop-item-count skin-count">{item.tokens}</span>
                      <span className="shop-item-label">Skin Tokens</span>
                    </div>
                    <div className="shop-item-price">
                      <span className="shop-item-beans">🫘 {item.price}</span>
                    </div>
                    <button
                      className="shop-item-buy skin-buy"
                      onClick={() => handlePurchase(item.id)}
                      disabled={purchasing === item.id}
                    >
                      {purchasing === item.id ? "..." : "Buy"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Effect Tokens Section ── */}
            <div className="shop-section">
              <div className="shop-section-header effect-section">
                <span className="shop-section-icon">✦</span>
                <span className="shop-section-title">Effect Tokens</span>
              </div>
              <div className="shop-items">
                {effectItems.map(item => (
                  <div key={item.id} className="shop-item effect-item">
                    {bonusPct(item) > 0 && (
                      <span className="shop-item-bonus effect-bonus">+{bonusPct(item)}% bonus</span>
                    )}
                    <div className="shop-item-tokens">
                      <span className="shop-item-count effect-count">{item.tokens}</span>
                      <span className="shop-item-label">Effect Tokens</span>
                    </div>
                    <div className="shop-item-price">
                      <span className="shop-item-beans">🫘 {item.price}</span>
                    </div>
                    <button
                      className="shop-item-buy effect-buy"
                      onClick={() => handlePurchase(item.id)}
                      disabled={purchasing === item.id}
                    >
                      {purchasing === item.id ? "..." : "Buy"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Bundles Section ── */}
            <div className="shop-section">
              <div className="shop-section-header bundle-section">
                <span className="shop-section-icon">🎁</span>
                <span className="shop-section-title">Bundles</span>
                <span className="shop-section-badge">Best Value!</span>
              </div>
              <div className="shop-items">
                {bundleItems.map(item => (
                  <div key={item.id} className="shop-item bundle-item">
                    {bundleSavings(item) > 0 && (
                      <span className="shop-item-bonus bundle-savings">Save {bundleSavings(item)}%</span>
                    )}
                    <div className="shop-item-name">{item.name}</div>
                    <div className="shop-item-tokens bundle-tokens">
                      <span className="shop-item-count bundle-count">{item.tokens}</span>
                      <span className="shop-item-label">Total Tokens</span>
                      <span className="bundle-breakdown">
                        🎨 {item.skinTokens} + ✦ {item.effectTokens}
                      </span>
                    </div>
                    <div className="shop-item-price">
                      <span className="shop-item-beans">🫘 {item.price}</span>
                    </div>
                    <button
                      className="shop-item-buy bundle-buy"
                      onClick={() => handlePurchase(item.id)}
                      disabled={purchasing === item.id}
                    >
                      {purchasing === item.id ? "..." : "Buy"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {pendingOrders.length > 0 && (
              <div className="shop-orders">
                <h3>⏳ Pending Orders</h3>
                <p className="shop-orders-hint">Complete the payment on {currency} to receive tokens. Orders auto-refresh.</p>
                {pendingOrders.map(order => (
                  <div key={order.id} className="shop-order pending">
                    <span className="shop-order-tokens">
                      {order.tokenType === "bundle"
                        ? `🎨 ${order.skinTokens || "?"} + ✦ ${order.effectTokens || "?"}`
                        : `${order.tokens} ${order.tokenType === "effect" ? "effect" : "skin"} tokens`}
                    </span>
                    <span className="shop-order-amount">🫘 {order.amount}</span>
                    <span className="shop-order-status">Waiting for payment...</span>
                    <button
                      className="shop-order-cancel"
                      onClick={() => handleCancel(order.id)}
                      title="Cancel this order"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {completedOrders.length > 0 && (
              <div className="shop-orders">
                <h3>✅ Completed</h3>
                {completedOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="shop-order completed">
                    <span className="shop-order-tokens">
                      {order.tokenType === "bundle"
                        ? `🎨 ${order.skinTokens || "?"} + ✦ ${order.effectTokens || "?"}`
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
