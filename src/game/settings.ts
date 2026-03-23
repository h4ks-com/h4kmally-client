/** Game settings — persisted to localStorage. */

export interface Settings {
  // Show
  showMass: boolean;
  showBorder: boolean;
  showGrid: boolean;

  // Effects
  showEffects: boolean;
  showTrails: boolean;
  showCrowns: boolean;

  // Theme
  darkMode: boolean;

  // Play
  autoRespawn: boolean;
}

const STORAGE_KEY = "h4kmally-settings";

const DEFAULTS: Settings = {
  showMass: true,
  showBorder: true,
  showGrid: false,
  showEffects: true,
  showTrails: true,
  showCrowns: true,
  darkMode: true,
  autoRespawn: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
