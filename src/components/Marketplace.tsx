import { useState, useEffect, useCallback, ReactNode } from "react";
import "./Marketplace.css";

interface TradeItem {
  itemType: string;
  itemKey: string;
  itemName: string;
  quantity: number;
}

interface WantedItemRow {
  itemType: string;
  itemKey: string;
  quantity: number;
}

interface MarketableListing {
  id: string;
  sellerUsername: string;
  itemType: string;
  itemKey: string;
  itemName: string;
  quantity: number;
  price: number;
  status: string;
  createdAt: number;
  listingType?: string;   // "sale" | "trade"
  wantedItems?: TradeItem[];
  // Seller/admin extras
  buyerUsername?: string;
  soldAt?: number;
  reversedAt?: number;
  payoutErr?: string;
}

interface MarketableItem {
  itemType: string;
  itemKey: string;
  name: string;
  amount: number;
}

interface PendingPurchase {
  id: string;
  listingId: string;
  buyerUsername: string;
  amount: number;
  status: string;
  createdAt: number;
}

interface MarketplaceProps {
  serverBaseUrl: string;
  sessionToken: string | null;
  onClose: () => void;
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  skin_token: "🎨 Skin Token",
  effect_token: "✦ Effect Token",
  powerup: "⚡ Powerup",
};

const POWERUP_ICONS: Record<string, string> = {
  virus_layer: "🦠",
  speed_boost: "⚡",
  ghost_mode: "👻",
  mass_magnet: "🧲",
  freeze_splitter: "❄️",
  recombine: "🔄",
};

const POWERUP_LABELS: Record<string, string> = {
  virus_layer: "Virus Layer",
  speed_boost: "Speed Boost",
  ghost_mode: "Ghost Mode",
  mass_magnet: "Mass Magnet",
  freeze_splitter: "Freeze Splitter",
  recombine: "Recombine",
};

function itemIcon(itemType: string, itemKey: string): string {
  if (itemType === "powerup") return POWERUP_ICONS[itemKey] ?? "⚡";
  if (itemType === "effect_token") return "✦";
  return "📦";
}

interface SkinImageProps {
  serverBaseUrl: string;
  skinName: string;
  skinFileMap: Record<string, string>;
  size?: number;
}
function SkinImage({ serverBaseUrl, skinName, skinFileMap, size = 44 }: SkinImageProps) {
  const file = skinFileMap[skinName] ?? skinFileMap[skinName.toLowerCase()];
  if (!file) return <span className="mp-listing-emoji">🎨</span>;
  return (
    <img
      src={`${serverBaseUrl}/skins/${file}`}
      alt={skinName}
      className="mp-skin-thumb"
      style={{ width: size, height: size }}
    />
  );
}

function timeAgo(unix: number): string {
  const seconds = Math.floor(Date.now() / 1000 - unix);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Shop base rates (beans per 1 token/charge) derived from cheapest shop pack.
// skin: 5 tokens = 5 beans → 1.0/token
// effect: 3 tokens = 5 beans → 1.667/token
// powerup: 10 beans/pack, roughly 6 charges total → ~1.67/charge
const SHOP_RATES: Record<string, number> = {
  skin_token: 1.0,
  effect_token: 5 / 3,
  powerup: 10 / 6,
};

/** Returns how many beans the listing saves vs buying the same qty in the shop.
 *  Positive = cheaper than shop. Returns null for trade listings. */
function dealScore(l: MarketableListing): number | null {
  if (l.listingType === "trade") return null;
  const rate = SHOP_RATES[l.itemType];
  if (!rate) return null;
  const shopCost = l.quantity * rate;
  return shopCost - l.price; // positive → cheaper than shop
}

type Tab = "browse" | "sell" | "my-listings" | "my-purchases";

export function Marketplace({ serverBaseUrl, sessionToken, onClose }: MarketplaceProps) {
  const [tab, setTab] = useState<Tab>("browse");
  const [listings, setListings] = useState<MarketableListing[]>([]);
  const [myListings, setMyListings] = useState<MarketableListing[]>([]);
  const [myPurchases, setMyPurchases] = useState<MarketableListing[]>([]);
  const [myPending, setMyPending] = useState<PendingPurchase[]>([]);
  const [myItems, setMyItems] = useState<MarketableItem[]>([]);
  const [maxPrice, setMaxPrice] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [skinFileMap, setSkinFileMap] = useState<Record<string, string>>({});

  // Browse filter/search state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"latest" | "earliest" | "cheapest" | "expensive">("latest");
  const [typeFilter, setTypeFilter] = useState<"all" | "sale" | "trade">("all");

  // Create listing form state
  const [createItemType, setCreateItemType] = useState<string>("");
  const [createItemKey, setCreateItemKey] = useState<string>("");
  const [createQty, setCreateQty] = useState<number>(1);
  const [createPrice, setCreatePrice] = useState<number>(1);
  const [createListingType, setCreateListingType] = useState<"sale" | "trade">("sale");
  const [createWantedItems, setCreateWantedItems] = useState<WantedItemRow[]>([{ itemType: "", itemKey: "", quantity: 1 }]);
  const [creating, setCreating] = useState(false);

  const fetchListings = useCallback(async () => {
    try {
      const resp = await fetch(`${serverBaseUrl}/api/marketplace/listings`);
      if (resp.ok) {
        const data = await resp.json();
        setListings(data.listings || []);
      }
    } catch {
      // silent — public endpoint
    }
  }, [serverBaseUrl]);

  const fetchMyData = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [listingsResp, purchasesResp, itemsResp] = await Promise.all([
        fetch(`${serverBaseUrl}/api/marketplace/my-listings?session=${encodeURIComponent(sessionToken)}`),
        fetch(`${serverBaseUrl}/api/marketplace/my-purchases?session=${encodeURIComponent(sessionToken)}`),
        fetch(`${serverBaseUrl}/api/marketplace/my-items?session=${encodeURIComponent(sessionToken)}`),
      ]);
      if (listingsResp.ok) {
        const data = await listingsResp.json();
        setMyListings(data.listings || []);
      }
      if (purchasesResp.ok) {
        const data = await purchasesResp.json();
        setMyPurchases(data.purchases || []);
        setMyPending(data.pending || []);
      }
      if (itemsResp.ok) {
        const data = await itemsResp.json();
        setMyItems(data.items || []);
        if (data.maxPrice) setMaxPrice(data.maxPrice);
      }
    } catch {
      // silent
    }
  }, [serverBaseUrl, sessionToken]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchListings(), fetchMyData()]);
    setLoading(false);
  }, [fetchListings, fetchMyData]);

  // Fetch skin manifest once for image display
  useEffect(() => {
    fetch(`${serverBaseUrl}/api/skins`)
      .then(r => r.json())
      .then((skins: { name: string; file: string }[]) => {
        const map: Record<string, string> = {};
        skins.forEach(s => { map[s.name] = s.file; });
        setSkinFileMap(map);
      })
      .catch(() => {});
  }, [serverBaseUrl]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleBuy = useCallback(async (listingId: string) => {
    if (!sessionToken) return;
    setBuying(listingId);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch(
        `${serverBaseUrl}/api/marketplace/buy?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) }
      );
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Failed to initiate purchase");
        return;
      }
      if (data.paymentUrl) {
        window.open(data.paymentUrl, "_blank", "noopener");
        setSuccess("Payment page opened — complete the transfer to receive your items.");
      }
      await fetchAll();
    } catch {
      setError("Failed to initiate purchase");
    } finally {
      setBuying(null);
    }
  }, [serverBaseUrl, sessionToken, fetchAll]);

  const handleCancel = useCallback(async (listingId: string) => {
    if (!sessionToken) return;
    setCancelling(listingId);
    setError(null);
    try {
      const resp = await fetch(
        `${serverBaseUrl}/api/marketplace/cancel?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) }
      );
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Failed to cancel listing");
        return;
      }
      setSuccess("Listing cancelled — items returned to your account.");
      await fetchAll();
    } catch {
      setError("Failed to cancel listing");
    } finally {
      setCancelling(null);
    }
  }, [serverBaseUrl, sessionToken, fetchAll]);

  const handleAcceptTrade = useCallback(async (listingId: string) => {
    if (!sessionToken) return;
    setAccepting(listingId);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch(
        `${serverBaseUrl}/api/marketplace/accept-trade?session=${encodeURIComponent(sessionToken)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) }
      );
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Trade failed");
        return;
      }
      setSuccess("Trade complete! Items have been exchanged.");
      await fetchAll();
    } catch {
      setError("Trade failed");
    } finally {
      setAccepting(null);
    }
  }, [serverBaseUrl, sessionToken, fetchAll]);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !createItemType || !createItemKey) return;
    if (createListingType === "trade" && createWantedItems.some(w => !w.itemType || !w.itemKey)) {
      setError("Fill in all wanted items or remove empty rows.");
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        itemType: createItemType,
        itemKey: createItemKey,
        quantity: createQty,
        listingType: createListingType,
      };
      if (createListingType === "sale") {
        body.price = createPrice;
      } else {
        body.wantedItems = createWantedItems.map(w => ({
          itemType: w.itemType,
          itemKey: w.itemKey,
          quantity: w.quantity,
        }));
      }
      const resp = await fetch(
        `${serverBaseUrl}/api/marketplace/list?session=${encodeURIComponent(sessionToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Failed to create listing");
        return;
      }
      setSuccess(createListingType === "trade"
        ? "Trade listed! Items held in escrow until someone accepts."
        : "Listing created! Items held in escrow until sold."
      );
      setCreateItemType("");
      setCreateItemKey("");
      setCreateQty(1);
      setCreatePrice(1);
      setCreateListingType("sale");
      setCreateWantedItems([{ itemType: "", itemKey: "", quantity: 1 }]);
      await fetchAll();
      setTab("my-listings");
    } catch {
      setError("Failed to create listing");
    } finally {
      setCreating(false);
    }
  }, [
    serverBaseUrl, sessionToken,
    createItemType, createItemKey, createQty, createPrice,
    createListingType, createWantedItems,
    fetchAll,
  ]);

  // Available keys for the selected item type (from my-items)
  const availableKeys = myItems
    .filter(i => i.itemType === createItemType)
    .sort((a, b) => a.itemKey.localeCompare(b.itemKey));

  const selectedItem = availableKeys.find(i => i.itemKey === createItemKey);
  const maxQty = selectedItem?.amount ?? 0;

  return (
    <div className="mp-overlay" onClick={onClose}>
      <div className="mp-panel" onClick={e => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="mp-header">
          <h2>🏪 Marketplace</h2>
          <button className="mp-close" onClick={onClose}>&times;</button>
        </div>
        <p className="mp-desc">Trade skin tokens, effect tokens, and powerups with other players.</p>

        {/* ── Tabs ── */}
        <div className="mp-tabs">
          <button className={`mp-tab ${tab === "browse" ? "active" : ""}`} onClick={() => setTab("browse")}>Browse</button>
          {sessionToken && (
            <>
              <button className={`mp-tab ${tab === "sell" ? "active" : ""}`} onClick={() => setTab("sell")}>Sell</button>
              <button className={`mp-tab ${tab === "my-listings" ? "active" : ""}`} onClick={() => setTab("my-listings")}>My Listings</button>
              <button className={`mp-tab ${tab === "my-purchases" ? "active" : ""}`} onClick={() => setTab("my-purchases")}>Purchases</button>
            </>
          )}
          <button className="mp-refresh-btn" onClick={fetchAll} disabled={loading} title="Refresh listings">
            {loading ? "⟳" : "⟳"}
          </button>
        </div>

        {/* ── Feedback ── */}
        {error && <div className="mp-error">{error}</div>}
        {success && <div className="mp-success">{success}</div>}

        {loading ? (
          <div className="mp-loading">Loading...</div>
        ) : (
          <div className="mp-body">
            {/* ── Browse Tab ── */}
            {tab === "browse" && (() => {
              // Filter + sort
              const filtered = listings
                .filter(l => {
                  if (typeFilter === "sale" && l.listingType === "trade") return false;
                  if (typeFilter === "trade" && l.listingType !== "trade") return false;
                  if (search) {
                    const q = search.toLowerCase();
                    if (!l.itemName.toLowerCase().includes(q) && !l.sellerUsername.toLowerCase().includes(q)) return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  if (sortBy === "latest") return b.createdAt - a.createdAt;
                  if (sortBy === "earliest") return a.createdAt - b.createdAt;
                  if (sortBy === "cheapest") return (a.price ?? 0) - (b.price ?? 0);
                  if (sortBy === "expensive") return (b.price ?? 0) - (a.price ?? 0);
                  return 0;
                });

              // Best deals: top 3 sale listings with highest savings vs shop
              const bestDeals = listings
                .filter(l => l.listingType !== "trade")
                .map(l => ({ l, score: dealScore(l) ?? -Infinity }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map(x => x.l);

              const renderCard = (l: MarketableListing, badge?: ReactNode) => {
                const isTrade = l.listingType === "trade";
                const score = dealScore(l);
                return (
                  <div key={l.id} className={`mp-grid-card ${isTrade ? "mp-trade-card" : ""}`}>
                    {badge && <div className="mp-deal-badge">{badge}</div>}
                    <div className="mp-grid-icon">
                      {l.itemType === "skin_token"
                        ? <SkinImage serverBaseUrl={serverBaseUrl} skinName={l.itemKey} skinFileMap={skinFileMap} size={56} />
                        : <span className="mp-grid-emoji">{itemIcon(l.itemType, l.itemKey)}</span>
                      }
                    </div>
                    <div className="mp-grid-name">
                      {isTrade && <span className="mp-trade-badge">⇄ TRADE</span>}
                      {l.itemName}
                    </div>
                    <div className="mp-grid-meta">
                      <span>×{l.quantity}</span>
                      <span className="mp-listing-seller">{l.sellerUsername}</span>
                    </div>
                    {isTrade && l.wantedItems && l.wantedItems.length > 0 && (
                      <div className="mp-wants">
                        <span className="mp-wants-label">wants:</span>
                        {l.wantedItems.map((wi, i) => (
                          <span key={i} className="mp-want-chip">
                            {wi.itemType === "skin_token"
                              ? <SkinImage serverBaseUrl={serverBaseUrl} skinName={wi.itemKey} skinFileMap={skinFileMap} size={16} />
                              : itemIcon(wi.itemType, wi.itemKey)}
                            {" "}{wi.itemName} ×{wi.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mp-grid-footer">
                      {!isTrade && (
                        <span className="mp-grid-price">
                          🫘 {l.price}
                          {score !== null && score > 0 && (
                            <span className="mp-save-tag">save {score.toFixed(1)}</span>
                          )}
                        </span>
                      )}
                      {sessionToken ? (
                        isTrade ? (
                          <button className="mp-trade-btn" onClick={() => handleAcceptTrade(l.id)} disabled={accepting === l.id}>
                            {accepting === l.id ? "..." : "Accept"}
                          </button>
                        ) : (
                          <button className="mp-buy-btn" onClick={() => handleBuy(l.id)} disabled={buying === l.id}>
                            {buying === l.id ? "..." : "Buy"}
                          </button>
                        )
                      ) : (
                        <span className="mp-login-hint">Log in</span>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* Search + filters */}
                  <div className="mp-browse-controls">
                    <input
                      className="mp-search"
                      type="search"
                      placeholder="Search items or sellers…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    <div className="mp-filter-row">
                      <select className="mp-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}>
                        <option value="all">All types</option>
                        <option value="sale">🫘 Sales only</option>
                        <option value="trade">⇄ Trades only</option>
                      </select>
                      <select className="mp-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                        <option value="latest">Latest first</option>
                        <option value="earliest">Earliest first</option>
                        <option value="cheapest">Cheapest first</option>
                        <option value="expensive">Most expensive</option>
                      </select>
                    </div>
                  </div>

                  {/* Best deals */}
                  {bestDeals.length > 0 && !search && typeFilter !== "trade" && (
                    <div className="mp-best-deals">
                      <div className="mp-section-label">⭐ Best Deals</div>
                      <div className="mp-deals-grid">
                        {bestDeals.map((l, i) =>
                          renderCard(l, ["🥇","🥈","🥉"][i])
                        )}
                      </div>
                    </div>
                  )}

                  {/* Main grid */}
                  {filtered.length === 0 ? (
                    <div className="mp-empty">{listings.length === 0 ? "No listings yet — be the first to sell or trade!" : "No listings match your search."}</div>
                  ) : (
                    <div className="mp-browse-grid">
                      {filtered.map(l => renderCard(l))}
                    </div>
                  )}
                </>
              );
            })()}

            {tab === "sell" && sessionToken && (
              <div className="mp-sell">
                {myItems.length === 0 ? (
                  <div className="mp-empty">
                    You have no items to sell.<br />
                    Buy tokens or powerups from the Shop first!
                  </div>
                ) : (
                  <form className="mp-create-form" onSubmit={handleCreate}>
                    {/* Listing type toggle */}
                    <div className="mp-listing-type-toggle">
                      <button
                        type="button"
                        className={`mp-type-btn ${createListingType === "sale" ? "active" : ""}`}
                        onClick={() => setCreateListingType("sale")}
                      >🫘 Sell for Beans</button>
                      <button
                        type="button"
                        className={`mp-type-btn ${createListingType === "trade" ? "active" : ""}`}
                        onClick={() => setCreateListingType("trade")}
                      >⇄ Trade for Items</button>
                    </div>

                    <div className="mp-form-row">
                      <label>Item type</label>
                      <select
                        value={createItemType}
                        onChange={e => { setCreateItemType(e.target.value); setCreateItemKey(""); }}
                        required
                      >
                        <option value="">— choose —</option>
                        {Array.from(new Set(myItems.map(i => i.itemType))).map(t => (
                          <option key={t} value={t}>{ITEM_TYPE_LABELS[t] ?? t}</option>
                        ))}
                      </select>
                    </div>

                    {createItemType && (
                      <div className="mp-form-row">
                        <label>Item</label>
                        <select
                          value={createItemKey}
                          onChange={e => setCreateItemKey(e.target.value)}
                          required
                        >
                          <option value="">— choose —</option>
                          {availableKeys.map(i => (
                            <option key={i.itemKey} value={i.itemKey}>
                              {i.name} (you have {i.amount})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {createItemKey && (
                      <>
                        <div className="mp-form-row">
                          <label>Quantity <span className="mp-hint">(max {maxQty})</span></label>
                          <input
                            type="number"
                            min={1}
                            max={maxQty}
                            value={createQty}
                            onChange={e => setCreateQty(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
                            required
                          />
                        </div>

                        {createListingType === "sale" ? (
                          <div className="mp-form-row">
                            <label>Price <span className="mp-hint">(1–{maxPrice} beans)</span></label>
                            <input
                              type="number"
                              min={1}
                              max={maxPrice}
                              value={createPrice}
                              onChange={e => setCreatePrice(Math.max(1, Math.min(maxPrice, parseInt(e.target.value) || 1)))}
                              required
                            />
                          </div>
                        ) : (
                          <div className="mp-wanted-section">
                            <div className="mp-wanted-header">
                              <label>What I want in return</label>
                              <button
                                type="button"
                                className="mp-add-want-btn"
                                onClick={() => setCreateWantedItems(prev => [...prev, { itemType: "", itemKey: "", quantity: 1 }])}
                              >+ Add item</button>
                            </div>
                            {createWantedItems.map((wi, idx) => (
                              <div key={idx} className="mp-want-row">
                                <select
                                  value={wi.itemType}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setCreateWantedItems(prev => prev.map((r, i) => i === idx ? { ...r, itemType: v, itemKey: "" } : r));
                                  }}
                                  required
                                >
                                  <option value="">Type</option>
                                  <option value="skin_token">🎨 Skin Token</option>
                                  <option value="effect_token">✦ Effect Token</option>
                                  <option value="powerup">⚡ Powerup</option>
                                </select>

                                {wi.itemType === "skin_token" ? (
                                  <select
                                    value={wi.itemKey}
                                    onChange={e => setCreateWantedItems(prev => prev.map((r, i) => i === idx ? { ...r, itemKey: e.target.value } : r))}
                                    required
                                  >
                                    <option value="">Skin</option>
                                    {Object.keys(skinFileMap).map(name => (
                                      <option key={name} value={name}>{name}</option>
                                    ))}
                                  </select>
                                ) : wi.itemType === "powerup" ? (
                                  <select
                                    value={wi.itemKey}
                                    onChange={e => setCreateWantedItems(prev => prev.map((r, i) => i === idx ? { ...r, itemKey: e.target.value } : r))}
                                    required
                                  >
                                    <option value="">Powerup</option>
                                    {Object.entries(POWERUP_LABELS).map(([key, label]) => (
                                      <option key={key} value={key}>{POWERUP_ICONS[key]} {label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    placeholder="effect name"
                                    value={wi.itemKey}
                                    onChange={e => setCreateWantedItems(prev => prev.map((r, i) => i === idx ? { ...r, itemKey: e.target.value } : r))}
                                    required={wi.itemType !== ""}
                                  />
                                )}

                                <input
                                  type="number"
                                  min={1}
                                  value={wi.quantity}
                                  onChange={e => setCreateWantedItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Math.max(1, parseInt(e.target.value) || 1) } : r))}
                                  className="mp-want-qty"
                                />

                                {createWantedItems.length > 1 && (
                                  <button
                                    type="button"
                                    className="mp-remove-want-btn"
                                    onClick={() => setCreateWantedItems(prev => prev.filter((_, i) => i !== idx))}
                                  >×</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mp-form-summary">
                          {createListingType === "sale" ? (
                            <>Listing: <strong>{createQty}× {selectedItem?.name}</strong> for <strong>🫘 {createPrice}</strong></>
                          ) : (
                            <>Trade: <strong>{createQty}× {selectedItem?.name}</strong> for the items listed above</>
                          )}
                          <br />
                          <span className="mp-hint">Items are held in escrow until traded or cancelled.</span>
                        </div>

                        <button className="mp-create-btn" type="submit" disabled={creating}>
                          {creating ? "Creating..." : createListingType === "trade" ? "List for Trade" : "List for Sale"}
                        </button>
                      </>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* ── My Listings Tab ── */}
            {tab === "my-listings" && sessionToken && (
              <div className="mp-listings">
                {myListings.length === 0 ? (
                  <div className="mp-empty">You haven&apos;t listed anything yet.</div>
                ) : (
                  myListings.map(l => {
                    const isTrade = l.listingType === "trade";
                    return (
                    <div key={l.id} className={`mp-listing-card mp-mine ${l.status}`}>
                      <div className="mp-listing-icon">
                        {l.itemType === "skin_token"
                          ? <SkinImage serverBaseUrl={serverBaseUrl} skinName={l.itemKey} skinFileMap={skinFileMap} />
                          : <span className="mp-listing-emoji">{itemIcon(l.itemType, l.itemKey)}</span>
                        }
                      </div>
                      <div className="mp-listing-info">
                        <div className="mp-listing-name">
                          {isTrade && <span className="mp-trade-badge">⇄</span>}
                          {l.itemName} ×{l.quantity}
                        </div>
                        <div className="mp-listing-meta">
                          <span className={`mp-status-badge mp-status-${l.status}`}>{l.status}</span>
                          {l.status === "sold" && l.buyerUsername && (
                            <span className="mp-listing-buyer">{isTrade ? "traded with" : "sold to"} {l.buyerUsername}</span>
                          )}
                          {l.status === "sold" && l.payoutErr && (
                            <span className="mp-payout-err" title={l.payoutErr}>⚠️ payout failed</span>
                          )}
                          {l.status === "reversed" && (
                            <span className="mp-listing-buyer">reversed</span>
                          )}
                          <span className="mp-listing-time">{timeAgo(l.createdAt)}</span>
                        </div>
                        {isTrade && l.wantedItems && l.wantedItems.length > 0 && l.status === "active" && (
                          <div className="mp-wants">
                            <span className="mp-wants-label">wants:</span>
                            {l.wantedItems.map((wi, i) => (
                              <span key={i} className="mp-want-chip">{wi.itemName} ×{wi.quantity}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!isTrade && <div className="mp-listing-price">🫘 {l.price}</div>}
                      {l.status === "active" && (
                        <button
                          className="mp-cancel-btn"
                          onClick={() => handleCancel(l.id)}
                          disabled={cancelling === l.id}
                          title="Cancel listing (returns items)"
                        >
                          {cancelling === l.id ? "..." : "Cancel"}
                        </button>
                      )}
                    </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── My Purchases Tab ── */}
            {tab === "my-purchases" && sessionToken && (
              <div className="mp-listings">
                {/* Pending payments */}
                {myPending.length > 0 && (
                  <>
                    <div className="mp-section-label">⏳ Pending Payment</div>
                    {myPending.map(p => {
                      // Find matching listing for display
                      const listing = [...listings, ...myListings, ...myPurchases]
                        .find(l => l.id === p.listingId);
                      return (
                        <div key={p.id} className="mp-listing-card mp-pending-purchase">
                          <div className="mp-listing-icon">
                            {listing
                              ? listing.itemType === "skin_token"
                                ? <SkinImage serverBaseUrl={serverBaseUrl} skinName={listing.itemKey} skinFileMap={skinFileMap} />
                                : <span className="mp-listing-emoji">{itemIcon(listing.itemType, listing.itemKey)}</span>
                              : <span className="mp-listing-emoji">📦</span>
                            }
                          </div>
                          <div className="mp-listing-info">
                            <div className="mp-listing-name">
                              {listing ? `${listing.itemName} ×${listing.quantity}` : "Unknown item"}
                            </div>
                            <div className="mp-listing-meta">
                              <span className="mp-status-badge mp-status-pending">pending payment</span>
                              <span className="mp-listing-time">{timeAgo(p.createdAt)}</span>
                            </div>
                          </div>
                          <div className="mp-listing-price">🫘 {p.amount}</div>
                          <button
                            className="mp-pay-btn"
                            onClick={() => {
                              if (listing) {
                                // Re-open payment by calling buy again
                                handleBuy(p.listingId);
                              }
                            }}
                            title="Open payment page"
                          >Pay</button>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Completed purchases */}
                {myPurchases.length === 0 && myPending.length === 0 ? (
                  <div className="mp-empty">No purchases yet.</div>
                ) : myPurchases.length > 0 && (
                  <>
                    <div className="mp-section-label">History</div>
                    {myPurchases.map(l => (
                      <div key={l.id} className={`mp-listing-card mp-mine ${l.status}`}>
                        <div className="mp-listing-icon">
                          {l.itemType === "skin_token"
                            ? <SkinImage serverBaseUrl={serverBaseUrl} skinName={l.itemKey} skinFileMap={skinFileMap} />
                            : <span className="mp-listing-emoji">{itemIcon(l.itemType, l.itemKey)}</span>
                          }
                        </div>
                        <div className="mp-listing-info">
                          <div className="mp-listing-name">{l.itemName} ×{l.quantity}</div>
                          <div className="mp-listing-meta">
                            <span className={`mp-status-badge mp-status-${l.status}`}>{l.status}</span>
                            <span className="mp-listing-seller">from {l.sellerUsername}</span>
                            {l.soldAt && <span className="mp-listing-time">{timeAgo(l.soldAt)}</span>}
                          </div>
                        </div>
                        {l.listingType !== "trade" && <div className="mp-listing-price">🫘 {l.price}</div>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
