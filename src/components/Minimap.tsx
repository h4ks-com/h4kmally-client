import React from "react";
import { GameState } from "../game";
import "./Minimap.css";

interface MinimapProps {
  state: GameState;
}

const MINIMAP_SIZE = 180;
const GRID_CELL_TARGET = 4000; // world units per grid cell (5×5 at map 20000)

// Skin URL builder - matches the game's skin asset path
function skinUrl(skin: string): string {
  if (!skin) return "";
  // If it's already a URL, use it directly
  if (skin.startsWith("http")) return skin;
  return `/skins/${skin}.png`;
}

export function Minimap({ state }: MinimapProps) {
  const { border } = state;
  const mapW = border.right - border.left;
  const mapH = border.bottom - border.top;
  if (mapW <= 0 || mapH <= 0) return null;

  // Compute grid dimensions (scales with map size)
  const cols = Math.max(1, Math.round(mapW / GRID_CELL_TARGET));
  const rows = Math.max(1, Math.round(mapH / GRID_CELL_TARGET));
  const cellW = MINIMAP_SIZE / cols;
  const cellH = MINIMAP_SIZE / rows;

  // Build grid lines + labels
  const gridLines: React.JSX.Element[] = [];
  const gridLabels: React.JSX.Element[] = [];

  // Vertical lines
  for (let c = 1; c < cols; c++) {
    const x = c * cellW;
    gridLines.push(
      <line key={`v${c}`} x1={x} y1={0} x2={x} y2={MINIMAP_SIZE}
        stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} />
    );
  }
  // Horizontal lines
  for (let r = 1; r < rows; r++) {
    const y = r * cellH;
    gridLines.push(
      <line key={`h${r}`} x1={0} y1={y} x2={MINIMAP_SIZE} y2={y}
        stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} />
    );
  }
  // Cell labels (A1, B2, etc.)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const label = String.fromCharCode(65 + c) + (r + 1);
      gridLabels.push(
        <text key={`l${r}_${c}`}
          x={c * cellW + cellW / 2}
          y={r * cellH + cellH / 2}
          fill="rgba(255,255,255,0.25)"
          fontSize={Math.min(cellW, cellH) * 0.35}
          fontFamily="Arial, sans-serif"
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="central"
        >{label}</text>
      );
    }
  }

  // Collect my cell positions + sizes for proportional dots
  const myDots: { nx: number; ny: number; nr: number }[] = [];
  for (const id of state.myCellIds) {
    const c = state.cells.get(id);
    if (c) {
      const nx = ((c.x - border.left) / mapW) * MINIMAP_SIZE;
      const ny = ((c.y - border.top) / mapH) * MINIMAP_SIZE;
      // Scale size proportionally: cell radius in world → minimap pixels
      const worldRadius = c.size;
      const nr = Math.max(1.5, (worldRadius / mapW) * MINIMAP_SIZE);
      myDots.push({ nx, ny, nr });
    }
  }

  // Clan member positions (from server CLAN_POSITIONS packet)
  const clanDots: { nx: number; ny: number; nr: number; skin: string; name: string }[] = [];
  for (const m of state.clanPositions) {
    const nx = ((m.x - border.left) / mapW) * MINIMAP_SIZE;
    const ny = ((m.y - border.top) / mapH) * MINIMAP_SIZE;
    const nr = Math.max(2, (m.size / mapW) * MINIMAP_SIZE);
    clanDots.push({ nx, ny, nr, skin: m.skin, name: m.name });
  }

  return (
    <div className="minimap" style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}>
      <svg width={MINIMAP_SIZE} height={MINIMAP_SIZE}>
        <defs>
          {clanDots.map((dot, i) =>
            dot.skin ? (
              <clipPath key={`clip-c${i}`} id={`clan-clip-${i}`}>
                <circle cx={dot.nx} cy={dot.ny} r={Math.max(dot.nr, 4)} />
              </clipPath>
            ) : null
          )}
        </defs>
        <rect width="100%" height="100%" fill="#111" />
        {gridLines}
        {gridLabels}

        {/* Clan member dots */}
        {clanDots.map((dot, i) => (
          <g key={`clan-${i}`}>
            {dot.skin ? (
              <>
                <image
                  href={skinUrl(dot.skin)}
                  x={dot.nx - Math.max(dot.nr, 4)}
                  y={dot.ny - Math.max(dot.nr, 4)}
                  width={Math.max(dot.nr, 4) * 2}
                  height={Math.max(dot.nr, 4) * 2}
                  clipPath={`url(#clan-clip-${i})`}
                />
                <circle
                  cx={dot.nx}
                  cy={dot.ny}
                  r={Math.max(dot.nr, 4)}
                  fill="none"
                  stroke="rgba(100,200,255,0.7)"
                  strokeWidth={0.8}
                />
              </>
            ) : (
              <circle
                cx={dot.nx}
                cy={dot.ny}
                r={Math.max(dot.nr, 3)}
                fill="rgba(100,200,255,0.6)"
                stroke="rgba(100,200,255,0.9)"
                strokeWidth={0.5}
              />
            )}
            {/* Clan member name label */}
            <text
              x={dot.nx}
              y={dot.ny + Math.max(dot.nr, 4) + 7}
              fill="rgba(100,200,255,0.8)"
              fontSize={6}
              fontFamily="Arial, sans-serif"
              textAnchor="middle"
            >{dot.name}</text>
          </g>
        ))}

        {/* My dots (on top) */}
        {myDots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.nx}
            cy={dot.ny}
            r={dot.nr}
            fill="#43a952"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={0.5}
          />
        ))}
      </svg>
    </div>
  );
}
