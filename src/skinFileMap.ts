/**
 * Global mapping of skin name → actual filename (e.g. "Earth" → "Earth.gif").
 * Populated from the /api/skins/access response.
 * Used by the renderer and UI components to construct correct skin URLs
 * (not all skins are .png — some are .gif, .webp, etc.).
 */
const skinFileMap = new Map<string, string>();

/** Get the skin filename for a given skin name, falling back to name + ".png". */
export function getSkinFile(name: string): string {
  return skinFileMap.get(name) || `${name}.png`;
}

/** Populate the map from an array of { name, file } objects. */
export function setSkinFiles(skins: { name: string; file: string }[]) {
  skinFileMap.clear();
  for (const s of skins) {
    skinFileMap.set(s.name, s.file);
  }
}
