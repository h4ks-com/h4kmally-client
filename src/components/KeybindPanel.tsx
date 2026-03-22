import { useState, useEffect, useCallback } from "react";
import type { Keybinds } from "../game/keybinds";
import {
  DEFAULT_KEYBINDS,
  KEYBIND_ACTIONS,
  actionLabel,
  bindingLabel,
  keyToBinding,
  mouseButtonToBinding,
} from "../game/keybinds";
import "./KeybindPanel.css";

interface KeybindPanelProps {
  keybinds: Keybinds;
  onChange: (k: Keybinds) => void;
  onClose: () => void;
}

export function KeybindPanel({ keybinds, onChange, onClose }: KeybindPanelProps) {
  // Which action is currently being rebound (waiting for key/click)
  const [listening, setListening] = useState<keyof Keybinds | null>(null);

  const bind = useCallback(
    (action: keyof Keybinds, value: string | null) => {
      onChange({ ...keybinds, [action]: value });
      setListening(null);
    },
    [keybinds, onChange],
  );

  // Listen for key/mouse when rebinding
  useEffect(() => {
    if (!listening) return;

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        // Cancel rebind
        setListening(null);
        return;
      }
      bind(listening, keyToBinding(e.key));
    };

    const onMouse = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      bind(listening, mouseButtonToBinding(e.button));
    };

    const onContext = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Use capture phase to intercept before anything else
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("contextmenu", onContext, true);

    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      window.removeEventListener("contextmenu", onContext, true);
    };
  }, [listening, bind]);

  const resetAll = () => {
    onChange({ ...DEFAULT_KEYBINDS });
  };

  return (
    <div className="keybind-overlay" onClick={listening ? undefined : onClose}>
      <div className="keybind-panel" onClick={(e) => e.stopPropagation()}>
        <div className="keybind-header">
          <h2>Keybinds</h2>
          <button className="keybind-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="keybind-list">
          {KEYBIND_ACTIONS.map((action) => (
            <div
              className={`keybind-row${listening === action ? " keybind-row--listening" : ""}`}
              key={action}
            >
              <span className="keybind-action">{actionLabel(action)}</span>
              <div className="keybind-btns">
                <button
                  className={`keybind-key${listening === action ? " keybind-key--active" : ""}`}
                  onClick={() => setListening(listening === action ? null : action)}
                >
                  {listening === action ? "Press key…" : bindingLabel(keybinds[action])}
                </button>
                <button
                  className="keybind-unbind"
                  title="Unbind"
                  onClick={() => bind(action, null)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="keybind-footer">
          <button className="keybind-reset" onClick={resetAll}>
            Reset Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
