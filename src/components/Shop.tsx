import { useState, useEffect, useCallback } from "react";
import "./Shop.css";

interface ShopItem {
  id: string;
  name: string;
  price: number;
  tokens: number;
}

interface ShopOrder {
  id: string;
  itemId: string;
  amount: number;
  tokens: number;
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
    // Poll orders every 10s to detect fulfillment
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

      // Refresh orders
      fetchShopData();
    } catch {
      setError("Failed to initiate purchase");
    } finally {
      setPurchasing(null);
    }
  }, [serverBaseUrl, sessionToken, fetchShopData]);

  const pendingOrders = orders.filter(o => o.status === "pending");
  const completedOrders = orders.filter(o => o.status === "completed");

  return (
    <div className="shop-overlay" onClick={onClose}>
      <div className="shop-panel" onClick={e => e.stopPropagation()}>
        <div className="shop-header">
          <h2>🛒 Token Shop</h2>
          <button className="shop-close" onClick={onClose}>&times;</button>
        </div>

        <p className="shop-desc">
          Buy <strong>Skin Tokens</strong> with <strong>{currency}</strong> — collect 5 of the same token to unlock a premium skin!
        </p>

        {loading ? (
          <div className="shop-loading">Loading...</div>
        ) : (
          <>
            {error && <div className="shop-error">{error}</div>}
            {success && <div className="shop-success">{success}</div>}

            <div className="shop-items">
              {items.map(item => (
                <div key={item.id} className="shop-item">
                  <div className="shop-item-tokens">
                    <span className="shop-item-count">{item.tokens}</span>
                    <span className="shop-item-label">Tokens</span>
                  </div>
                  <div className="shop-item-price">
                    <span className="shop-item-beans">🫘 {item.price}</span>
                    <span className="shop-item-currency">{currency}</span>
                  </div>
                  <button
                    className="shop-item-buy"
                    onClick={() => handlePurchase(item.id)}
                    disabled={purchasing === item.id}
                  >
                    {purchasing === item.id ? "..." : "Buy"}
                  </button>
                </div>
              ))}
            </div>

            {pendingOrders.length > 0 && (
              <div className="shop-orders">
                <h3>⏳ Pending Orders</h3>
                <p className="shop-orders-hint">Complete the payment on {currency} to receive tokens. Orders auto-refresh.</p>
                {pendingOrders.map(order => (
                  <div key={order.id} className="shop-order pending">
                    <span className="shop-order-tokens">{order.tokens} tokens</span>
                    <span className="shop-order-amount">🫘 {order.amount}</span>
                    <span className="shop-order-status">Waiting for payment...</span>
                  </div>
                ))}
              </div>
            )}

            {completedOrders.length > 0 && (
              <div className="shop-orders">
                <h3>✅ Completed</h3>
                {completedOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="shop-order completed">
                    <span className="shop-order-tokens">{order.tokens} tokens</span>
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
