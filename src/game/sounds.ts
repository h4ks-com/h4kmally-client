/**
 * Battle Royale sound effects.
 *
 * - leadup.mp3:  plays for the final 10 seconds of a BR (stops on death)
 * - drop.mp3:    plays when you win first place
 * - death sounds: random cross-site sound on elimination during a BR
 */

// ── Death sounds (randomised on each death) ────────────────

const DEATH_SOUNDS = [
  "https://www.myinstants.com/media/sounds/super-mario-death-sound-sound-effect.mp3",
  "https://www.myinstants.com/media/sounds/gta-v-wasted-death-sound.mp3",
  "https://www.myinstants.com/media/sounds/roblox-death-sound_ytkBL7X.mp3",
  "https://www.myinstants.com/media/sounds/metal_gear_solid_game_over_screen_clean_background-1.mp3",
  "https://www.myinstants.com/media/sounds/fall2.mp3",
  "https://www.myinstants.com/media/sounds/pacman_death.mp3",
];

// ── Preloaded audio elements ───────────────────────────────
// Created once so the browser fetches & decodes ahead of time.
// On play we just reset currentTime and call play() — instant start.

const preloadedLeadup = new Audio("/sounds/leadup.mp3");
preloadedLeadup.preload = "auto";
preloadedLeadup.volume = 0.7;

const preloadedDrop = new Audio("/sounds/drop.mp3");
preloadedDrop.preload = "auto";
preloadedDrop.volume = 0.8;

// ── State ──────────────────────────────────────────────────

let leadupPlaying = false;

// Track whether the leadup / win sound was already triggered for the current
// BR round so we don't restart them on every 200ms BR update packet.
let leadupTriggeredForRound = false;
let winTriggeredForRound = false;

// ── Helpers ────────────────────────────────────────────────

function playOnce(src: string, volume = 0.6): HTMLAudioElement {
  const a = new Audio(src);
  a.volume = volume;
  a.play().catch(() => {/* user hasn't interacted yet – ignore */});
  return a;
}

// ── Public API ─────────────────────────────────────────────

/**
 * Called on every BR state update (~5 Hz).
 * Starts the leadup sound when exactly ≤10 seconds remain in an active BR
 * and the player is alive.
 */
export function onBRUpdate(
  brState: number,          // 0=inactive,1=countdown,2=active,3=finished
  timeRemaining: number,    // seconds left (negative = sudden death)
  winnerName: string,
  myName: string,
  alive: boolean,
) {
  // ── Reset tracking when BR is not active ──
  if (brState === 0) {
    stopLeadup();
    leadupTriggeredForRound = false;
    winTriggeredForRound = false;
    return;
  }

  // ── Leadup: final 10 seconds of an active BR ──
  if (brState === 2 && alive) {
    // timeRemaining ≤ 10 means we're in the final stretch
    // (timeRemaining can go negative during sudden death — those last 30s
    //  are encoded as negative values, so sudden-death time already < 10)
    if (timeRemaining <= 10 && timeRemaining > 0 && !leadupTriggeredForRound) {
      leadupTriggeredForRound = true;
      startLeadup();
    }
    // Also trigger if we just entered sudden death (timeRemaining < 0)
    // and there are ≤ 10 absolute seconds of sudden death left
    if (timeRemaining < 0 && !leadupTriggeredForRound) {
      // timeRemaining is encoded as -(suddenDeathSecsRemaining) - 1
      const sdRemaining = -(timeRemaining + 1);
      if (sdRemaining <= 10) {
        leadupTriggeredForRound = true;
        startLeadup();
      }
    }
  }

  // ── Winner: play drop.mp3 if I won (once per round) ──
  if (brState === 3 && winnerName && winnerName === myName && !winTriggeredForRound) {
    winTriggeredForRound = true;
    stopLeadup();
    playWin();
  }

  // ── BR finished but I'm not the winner — stop leadup ──
  if (brState === 3 && winnerName !== myName) {
    stopLeadup();
  }
}

/**
 * Called when the player dies (onClearMine) during an active BR.
 */
export function onBRDeath() {
  stopLeadup();
  playDeathSound();
}

/**
 * Force-stop all BR sounds (e.g. on disconnect).
 */
export function stopAllBRSounds() {
  stopLeadup();
  leadupTriggeredForRound = false;
  winTriggeredForRound = false;
}

// ── Internal ───────────────────────────────────────────────

function startLeadup() {
  if (leadupPlaying) return;
  preloadedLeadup.currentTime = 0;
  preloadedLeadup.play().catch(() => {});
  leadupPlaying = true;
}

function stopLeadup() {
  preloadedLeadup.pause();
  preloadedLeadup.currentTime = 0;
  leadupPlaying = false;
}

function playWin() {
  preloadedDrop.currentTime = 0;
  preloadedDrop.play().catch(() => {});
}

function playDeathSound() {
  const url = DEATH_SOUNDS[Math.floor(Math.random() * DEATH_SOUNDS.length)];
  playOnce(url, 0.6);
}
