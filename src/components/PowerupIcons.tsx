import React from "react";

interface IconProps {
  size?: number;
}

export function VirusLayerIcon({ size = 32 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Spiky virus body */}
      <circle cx="32" cy="32" r="16" fill="#4caf50" />
      <circle cx="32" cy="32" r="10" fill="#66bb6a" />
      {/* Spikes */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 32 + Math.cos(rad) * 16;
        const y1 = 32 + Math.sin(rad) * 16;
        const x2 = 32 + Math.cos(rad) * 24;
        const y2 = 32 + Math.sin(rad) * 24;
        return (
          <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4caf50" strokeWidth="4" strokeLinecap="round" />
        );
      })}
      {/* Spike tips */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const cx = 32 + Math.cos(rad) * 24;
        const cy = 32 + Math.sin(rad) * 24;
        return <circle key={angle} cx={cx} cy={cy} r="3" fill="#81c784" />;
      })}
      {/* Nucleus */}
      <circle cx="32" cy="32" r="5" fill="#2e7d32" opacity="0.6" />
    </svg>
  );
}

export function SpeedBoostIcon({ size = 32 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Lightning bolt */}
      <polygon
        points="36,4 18,34 28,34 24,60 46,26 34,26"
        fill="#ffd740"
        stroke="#ff8f00"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Inner highlight */}
      <polygon points="34,12 24,32 30,32 27,52 40,28 34,28" fill="#fff176" opacity="0.6" />
    </svg>
  );
}

export function GhostModeIcon({ size = 32 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ghost body */}
      <path
        d="M32 8C20 8 12 18 12 28V50C12 50 16 44 20 50C24 56 28 44 32 50C36 56 40 44 44 50C48 56 52 44 52 50V28C52 18 44 8 32 8Z"
        fill="rgba(200,200,255,0.7)"
        stroke="rgba(150,150,220,0.8)"
        strokeWidth="2"
      />
      {/* Eyes */}
      <ellipse cx="25" cy="28" rx="4" ry="5" fill="#1a1a2e" />
      <ellipse cx="39" cy="28" rx="4" ry="5" fill="#1a1a2e" />
      {/* Eye highlights */}
      <circle cx="26.5" cy="26" r="1.5" fill="white" />
      <circle cx="40.5" cy="26" r="1.5" fill="white" />
    </svg>
  );
}

export function MassMagnetIcon({ size = 32 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Magnet U-shape */}
      <path
        d="M16 12V36C16 44.8 23.2 52 32 52C40.8 52 48 44.8 48 36V12"
        stroke="#e53935"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Red/silver tips */}
      <rect x="12" y="8" width="12" height="12" rx="2" fill="#e53935" />
      <rect x="40" y="8" width="12" height="12" rx="2" fill="#e53935" />
      <rect x="12" y="16" width="12" height="6" rx="1" fill="#90a4ae" />
      <rect x="40" y="16" width="12" height="6" rx="1" fill="#90a4ae" />
      {/* Field lines */}
      <path d="M26 36C26 32.7 28.7 30 32 30C35.3 30 38 32.7 38 36" stroke="#ff8a80" strokeWidth="1.5" fill="none" strokeDasharray="3 2" />
      <path d="M22 40C22 34.5 26.5 30 32 30C37.5 30 42 34.5 42 40" stroke="#ff8a80" strokeWidth="1" fill="none" strokeDasharray="3 2" />
    </svg>
  );
}

export function FreezeSplitterIcon({ size = 32 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Snowflake / ice crystal with crosshair feel */}
      {/* Main axes */}
      <line x1="32" y1="8" x2="32" y2="56" stroke="#4fc3f7" strokeWidth="3" strokeLinecap="round" />
      <line x1="8" y1="32" x2="56" y2="32" stroke="#4fc3f7" strokeWidth="3" strokeLinecap="round" />
      <line x1="15" y1="15" x2="49" y2="49" stroke="#4fc3f7" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="49" y1="15" x2="15" y2="49" stroke="#4fc3f7" strokeWidth="2.5" strokeLinecap="round" />
      {/* Branches on main axes */}
      <line x1="32" y1="14" x2="26" y2="20" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="14" x2="38" y2="20" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="50" x2="26" y2="44" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="50" x2="38" y2="44" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="32" x2="20" y2="26" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="32" x2="20" y2="38" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="32" x2="44" y2="26" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="32" x2="44" y2="38" stroke="#81d4fa" strokeWidth="2" strokeLinecap="round" />
      {/* Center diamond */}
      <circle cx="32" cy="32" r="4" fill="#b3e5fc" stroke="#4fc3f7" strokeWidth="1.5" />
    </svg>
  );
}

export function RecombineIcon({ size = 32 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Four cells merging inward */}
      <circle cx="22" cy="22" r="10" fill="#7e57c2" opacity="0.7" />
      <circle cx="42" cy="22" r="10" fill="#7e57c2" opacity="0.7" />
      <circle cx="22" cy="42" r="10" fill="#7e57c2" opacity="0.7" />
      <circle cx="42" cy="42" r="10" fill="#7e57c2" opacity="0.7" />
      {/* Center merged cell */}
      <circle cx="32" cy="32" r="12" fill="#b39ddb" opacity="0.9" />
      {/* Inward arrows */}
      <path d="M14 14L26 26" stroke="#ede7f6" strokeWidth="2" strokeLinecap="round" markerEnd="url(#arrowR)" />
      <path d="M50 14L38 26" stroke="#ede7f6" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 50L26 38" stroke="#ede7f6" strokeWidth="2" strokeLinecap="round" />
      <path d="M50 50L38 38" stroke="#ede7f6" strokeWidth="2" strokeLinecap="round" />
      {/* Center glow */}
      <circle cx="32" cy="32" r="5" fill="#d1c4e9" />
    </svg>
  );
}

// Map powerup type to icon component
export const POWERUP_ICONS: Record<string, React.FC<IconProps>> = {
  virus_layer: VirusLayerIcon,
  speed_boost: SpeedBoostIcon,
  ghost_mode: GhostModeIcon,
  mass_magnet: MassMagnetIcon,
  freeze_splitter: FreezeSplitterIcon,
  recombine: RecombineIcon,
};
