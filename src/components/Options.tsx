import type { Settings } from "../game/settings";
import "./Options.css";

interface OptionsProps {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onOpenKeybinds?: () => void;
}

export function Options({ settings, onChange, onClose, onOpenKeybinds }: OptionsProps) {
  const toggle = (key: keyof Settings) => {
    onChange({ ...settings, [key]: !settings[key] });
  };

  return (
    <div className="options-overlay" onClick={onClose}>
      <div className="options-panel" onClick={(e) => e.stopPropagation()}>
        <div className="options-header">
          <h2>Options</h2>
          <button className="options-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="options-section">
          <h3>Show</h3>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.darkMode}
              onChange={() => toggle("darkMode")}
            />
            <span className="toggle-slider" />
            Dark Mode
          </label>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.showMass}
              onChange={() => toggle("showMass")}
            />
            <span className="toggle-slider" />
            Mass
          </label>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.showBorder}
              onChange={() => toggle("showBorder")}
            />
            <span className="toggle-slider" />
            Border
          </label>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.showGrid}
              onChange={() => toggle("showGrid")}
            />
            <span className="toggle-slider" />
            Grid
          </label>
        </div>

        <div className="options-section">
          <h3>Effects</h3>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.showEffects}
              onChange={() => toggle("showEffects")}
            />
            <span className="toggle-slider" />
            Cell Effects
          </label>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.showTrails}
              onChange={() => toggle("showTrails")}
            />
            <span className="toggle-slider" />
            Trails
          </label>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.showCrowns}
              onChange={() => toggle("showCrowns")}
            />
            <span className="toggle-slider" />
            #1 Crown
          </label>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.showCursorLines}
              onChange={() => toggle("showCursorLines")}
            />
            <span className="toggle-slider" />
            Cursor Lines
          </label>
        </div>

        <div className="options-section">
          <h3>Play</h3>
          <label className="options-toggle">
            <input
              type="checkbox"
              checked={settings.autoRespawn}
              onChange={() => toggle("autoRespawn")}
            />
            <span className="toggle-slider" />
            Auto Respawn
          </label>
        </div>

        {onOpenKeybinds && (
          <div className="options-section">
            <button className="options-keybinds-btn" onClick={onOpenKeybinds}>
              Keybinds
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
