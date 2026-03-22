import type { Keybinds } from "../game/keybinds";
import { bindingLabel } from "../game/keybinds";
import "./HowToPlay.css";

interface HowToPlayProps {
  keybinds: Keybinds;
  onClose: () => void;
}

export function HowToPlay({ keybinds, onClose }: HowToPlayProps) {
  const k = (action: keyof Keybinds) => bindingLabel(keybinds[action]);

  return (
    <div className="htp-overlay" onClick={onClose}>
      <div className="htp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="htp-header">
          <h2>How to Play</h2>
          <button className="htp-close" onClick={onClose}>&times;</button>
        </div>

        <div className="htp-content">
          <section className="htp-section">
            <h3>Basics</h3>
            <p>You are a cell. Move your mouse to steer. Eat food pellets and smaller players to grow. Avoid being eaten by bigger players.</p>
            <p>Your goal is to become the biggest cell on the leaderboard. The bigger you are, the slower you move — so size is both your strength and weakness.</p>
          </section>

          <section className="htp-section">
            <h3>Controls</h3>
            <div className="htp-keys">
              <div className="htp-key-row">
                <kbd>{k("split")}</kbd>
                <span>Split — divide your cell in two, launching half forward</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("doubleSplit")}</kbd>
                <span>Double split — split twice rapidly</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("tripleSplit")}</kbd>
                <span>Triple split — split three times</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("quadSplit")}</kbd>
                <span>Quad split — split four times</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("fastEject")}</kbd>
                <span>Fast eject (hold) — rapidly shoot mass at 25/sec</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("slowEject")}</kbd>
                <span>Slow eject (hold) — shoot mass at 4/sec</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("freeze")}</kbd>
                <span>Freeze (hold) — lock your cell in place</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("directionLock")}</kbd>
                <span>Direction lock (hold) — keep moving in one direction</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("multiboxSwitch")}</kbd>
                <span>Multibox switch — swap between your two cell groups</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("mouseEject")}</kbd>
                <span>Mouse eject (hold) — rapid eject via mouse button</span>
              </div>
              <div className="htp-key-row">
                <kbd>{k("mouseSplit")}</kbd>
                <span>Mouse split — split via mouse button</span>
              </div>
              <div className="htp-key-row">
                <kbd>Esc</kbd>
                <span>Open/close options menu</span>
              </div>
              <div className="htp-key-row">
                <kbd>Scroll</kbd>
                <span>Zoom in / out</span>
              </div>
            </div>
          </section>

          <section className="htp-section">
            <h3>Spectator Mode</h3>
            <p>Click <strong>Spectate</strong> to watch the game. Press <kbd>{k("spectatorFollow")}</kbd> to follow the top player. Press <strong>Esc</strong> to return to the lobby.</p>
          </section>

          <section className="htp-section">
            <h3>Splitting</h3>
            <p>Splitting launches half your mass forward at high speed. Use it to catch smaller players who think they're safe. Each split doubles your cell count (up to a cap of 16). Your cells will slowly merge back together over time.</p>
            <p>Multi-splits (double, triple, quad) fire off multiple splits in rapid succession — useful for reaching distant targets or creating pressure.</p>
          </section>

          <section className="htp-section">
            <h3>Ejecting Mass</h3>
            <p>Ejecting shoots small pellets of mass in your mouse direction. Use it to feed teammates, bait other players, or push viruses. Fast eject is great for rapid feeding; slow eject gives more control.</p>
          </section>

          <section className="htp-section">
            <h3>Viruses</h3>
            <p>The green spiky circles are viruses. If you're bigger than a virus and touch it, you'll pop into many small pieces. Smaller cells can hide behind viruses for protection. You can shoot mass into a virus to push it or make it split toward an enemy.</p>
          </section>

          <section className="htp-section">
            <h3>Strategies</h3>
            <ul>
              <li><strong>Early game:</strong> Eat food pellets and small cells. Stay away from anyone much bigger than you. Use viruses as shields.</li>
              <li><strong>Split kills:</strong> If you're at least 2.5× someone's size, you can split onto them. Judge the distance carefully — a missed split leaves you vulnerable.</li>
              <li><strong>Virus play:</strong> Shoot 7 mass pellets into a virus to launch a new one. Use it to pop big players or defend yourself.</li>
              <li><strong>Baiting:</strong> Eject a little mass to lure greedy players into range of a split kill.</li>
              <li><strong>Corner traps:</strong> Push enemies toward map edges or corners where they can't escape, then split.</li>
              <li><strong>Team play:</strong> In a clan, coordinate with teammates. Feed mass to your biggest player, and use splits to pop enemies for your teammates to eat.</li>
              <li><strong>Patience:</strong> Sometimes the best move is to wait. Let others fight, then clean up the pieces.</li>
              <li><strong>Freeze trick:</strong> Use freeze to suddenly stop and juke pursuers. They'll overshoot and you can escape.</li>
            </ul>
          </section>

          <section className="htp-section">
            <h3>Clans</h3>
            <p>Join or create a clan to team up with other players. Clanmates appear on your minimap and have colored tags above their names. Coordinate in clan chat to dominate the server together.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
