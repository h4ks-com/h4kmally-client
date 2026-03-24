import "./PowerupHUD.css";
import { POWERUP_ICONS } from "./PowerupIcons";

interface PowerupHUDProps {
  inventory: Record<string, number>;
}

// Ordered list of all 6 powerup slots
const POWERUP_SLOTS = [
  { type: "virus_layer", label: "Virus Layer", key: "1" },
  { type: "speed_boost", label: "Speed Boost", key: "2" },
  { type: "ghost_mode", label: "Ghost Mode", key: "3" },
  { type: "mass_magnet", label: "Mass Magnet", key: "4" },
  { type: "freeze_splitter", label: "Freeze Splitter", key: "5" },
  { type: "recombine", label: "Recombine", key: "6" },
];

export function PowerupHUD({ inventory }: PowerupHUDProps) {
  // Only show slots that have charges
  const activeSlots = POWERUP_SLOTS.filter((s) => (inventory[s.type] || 0) > 0);
  if (activeSlots.length === 0) return null;

  return (
    <div className="powerup-hud">
      {activeSlots.map((slot) => {
        const charges = inventory[slot.type] || 0;
        const IconComponent = POWERUP_ICONS[slot.type];
        return (
          <div key={slot.type} className="pu-slot active">
            <div className="pu-key-badge">{slot.key}</div>
            <div className="pu-icon-wrap">
              {IconComponent ? <IconComponent size={36} /> : null}
            </div>
            <div className="pu-details">
              <div className="pu-name">{slot.label}</div>
              <div className="pu-charges-row">
                <span className="pu-charge-num">{charges}</span>
                <span className="pu-charge-label">{charges === 1 ? "charge" : "charges"}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
