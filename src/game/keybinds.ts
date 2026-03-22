/**
 * Keybind configuration — persisted to localStorage.
 *
 * Each action maps to a "binding string":
 *   - Keyboard: the KeyboardEvent.key value, e.g. "q", " ", "Shift", "Tab"
 *   - Mouse:    "Mouse0" (left), "Mouse1" (middle), "Mouse2" (right)
 *   - null:     unbound
 */

export type BindingKey = string | null;

export interface Keybinds {
  // Core
  split: BindingKey;
  doubleSplit: BindingKey;
  tripleSplit: BindingKey;
  quadSplit: BindingKey;
  fastEject: BindingKey;        // hold: 25/sec
  slowEject: BindingKey;        // hold: 4/sec
  freeze: BindingKey;           // hold
  directionLock: BindingKey;    // hold
  multiboxSwitch: BindingKey;

  // Mouse
  mouseSplit: BindingKey;       // mouse button for split
  mouseEject: BindingKey;       // mouse button for rapid eject

  // Spectator
  spectatorFollow: BindingKey;
}

const STORAGE_KEY = "h4kmally-keybinds";

export const DEFAULT_KEYBINDS: Keybinds = {
  split: " ",
  doubleSplit: "a",
  tripleSplit: "s",
  quadSplit: "d",
  fastEject: "q",
  slowEject: "w",
  freeze: "x",
  directionLock: "Shift",
  multiboxSwitch: "Tab",

  mouseSplit: "Mouse2",
  mouseEject: "Mouse0",

  spectatorFollow: "f",
};

/** Human-readable label for a binding key */
export function bindingLabel(key: BindingKey): string {
  if (key === null) return "None";
  if (key === " ") return "Space";
  if (key === "Mouse0") return "Left Click";
  if (key === "Mouse1") return "Middle Click";
  if (key === "Mouse2") return "Right Click";
  if (key === "Shift") return "Shift";
  if (key === "Tab") return "Tab";
  if (key === "Escape") return "Escape";
  if (key === "Control") return "Ctrl";
  if (key === "Alt") return "Alt";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Human-readable label for an action */
export function actionLabel(action: keyof Keybinds): string {
  switch (action) {
    case "split": return "Split";
    case "doubleSplit": return "Double Split";
    case "tripleSplit": return "Triple Split";
    case "quadSplit": return "Quad Split";
    case "fastEject": return "Fast Eject (hold)";
    case "slowEject": return "Slow Eject (hold)";
    case "freeze": return "Freeze (hold)";
    case "directionLock": return "Direction Lock (hold)";
    case "multiboxSwitch": return "Multibox Switch";
    case "mouseSplit": return "Mouse Split";
    case "mouseEject": return "Mouse Eject (hold)";
    case "spectatorFollow": return "Spectator Follow";
  }
}

export function loadKeybinds(): Keybinds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_KEYBINDS, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_KEYBINDS };
}

export function saveKeybinds(k: Keybinds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(k));
  } catch {
    // ignore
  }
}

/**
 * Convert a MouseEvent button number to our binding string.
 */
export function mouseButtonToBinding(button: number): string {
  return `Mouse${button}`;
}

/**
 * Normalize a KeyboardEvent.key to our binding string.
 * Case-insensitive for letters: always stores lowercase.
 */
export function keyToBinding(key: string): string {
  if (key.length === 1 && key >= "A" && key <= "Z") return key.toLowerCase();
  return key;
}

/** All keybind action keys in display order */
export const KEYBIND_ACTIONS: (keyof Keybinds)[] = [
  "split",
  "doubleSplit",
  "tripleSplit",
  "quadSplit",
  "fastEject",
  "slowEject",
  "freeze",
  "directionLock",
  "multiboxSwitch",
  "mouseSplit",
  "mouseEject",
  "spectatorFollow",
];

/** Check if a binding is a mouse binding */
export function isMouseBinding(key: BindingKey): boolean {
  return key !== null && key.startsWith("Mouse");
}
