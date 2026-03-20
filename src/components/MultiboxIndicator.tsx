import "./MultiboxIndicator.css";

interface MultiboxIndicatorProps {
  activeSlot: number;
  multiAlive: boolean;
}

export function MultiboxIndicator({ activeSlot, multiAlive }: MultiboxIndicatorProps) {
  const slotLabel = activeSlot === 0 ? "Main" : "Multi";
  const multiStatus = multiAlive ? "alive" : "respawning…";

  return (
    <div className="multibox-indicator">
      <div className="multibox-active">
        <span className="multibox-icon">⌨</span>
        <span className={`multibox-slot ${activeSlot === 0 ? "slot-main" : "slot-multi"}`}>
          {slotLabel}
        </span>
      </div>
      <div className="multibox-status">
        <span className={`multibox-dot ${multiAlive ? "dot-alive" : "dot-dead"}`} />
        <span className="multibox-label">Multi: {multiStatus}</span>
      </div>
      <div className="multibox-hint">Tab to switch</div>
    </div>
  );
}
