import { useRef, useEffect, useState, useCallback } from "react";
import { useLogto } from "@logto/react";
import { Connection } from "./protocol";
import type { ConnectionState, LeaderboardEntry } from "./protocol";
import { GameState, Renderer, loadSettings, saveSettings } from "./game";
import type { ChatEntry, Settings } from "./game";
import { loadKeybinds, saveKeybinds, keyToBinding, mouseButtonToBinding } from "./game/keybinds";
import type { Keybinds } from "./game/keybinds";
import { Lobby } from "./components/Lobby";
import { HUD } from "./components/HUD";
import { Minimap } from "./components/Minimap";
import { Chat } from "./components/Chat";
import { Options } from "./components/Options";
import { KeybindPanel } from "./components/KeybindPanel";
import { HowToPlay } from "./components/HowToPlay";
import { Callback } from "./components/Callback";
import { AdminPanel } from "./components/AdminPanel";
import { Shop } from "./components/Shop";
import { Marketplace } from "./components/Marketplace";
import { DailyGift } from "./components/DailyGift";
import { PowerupHUD } from "./components/PowerupHUD";
import { MultiboxIndicator } from "./components/MultiboxIndicator";
import { ClanPanel } from "./components/ClanPanel";
import { CustomCursor } from "./components/CustomCursor";
import { TankLobby } from "./components/TankLobby";
import DeathCard from "./components/DeathCard";
import type { TankLobbyState, TankCursorInfo } from "./protocol";
import { onBRUpdate, onBRDeath, stopAllBRSounds } from "./game/sounds";
import "./App.css";

/** User profile returned by our server's /api/auth/me */
export interface UserProfile {
  sub: string;
  name: string;
  picture: string;
  points: number;
  gamesPlayed: number;
  topScore: number;
  isAdmin?: boolean;
  clanID?: string;
}

export default function App() {
  // Handle OAuth callback route
  if (window.location.pathname === "/auth/callback") {
    return <Callback />;
  }

  // Handle post-logout redirect (Logto redirects here after sign-out)
  if (window.location.pathname === "/auth/logout" || window.location.pathname === "/auth/sign-out") {
    // Clear any leftover auth state and redirect to homepage
    window.location.href = "/";
    return null;
  }

  return <GameApp />;
}

function GameApp() {
  const { isAuthenticated, isLoading: authLoading, signIn, signOut, getAccessToken, getIdTokenClaims, fetchUserInfo } =
    useLogto();

  const [authProvider, setAuthProvider] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [displayPicture, setDisplayPicture] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const connRef = useRef<Connection | null>(null);
  const stateRef = useRef<GameState>(new GameState());
  const rendererRef = useRef<Renderer | null>(null);
  const mouseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpawnRef = useRef<{ name: string; skin: string; effect: string }>({ name: "unnamed", skin: "", effect: "" });
  const wsBaseUrlRef = useRef<string>("");
  const prevScoreRef = useRef<number>(0);
  const authFailedRef = useRef(false);

  // UI state
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [serverBaseUrl, setServerBaseUrl] = useState("");
  const [alive, setAlive] = useState(false);
  const [showLobby, setShowLobby] = useState(true);
  const [showDeathCard, setShowDeathCard] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [showClanPanel, setShowClanPanel] = useState(false);
  const [score, setScore] = useState(0);
  const [latency, setLatency] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [clanChatMessages, setClanChatMessages] = useState<ChatEntry[]>([]);
  const [inClan, setInClan] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [keybinds, setKeybinds] = useState<Keybinds>(loadKeybinds);
  const keybindsRef = useRef<Keybinds>(keybinds);
  const [showKeybinds, setShowKeybinds] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Auth state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userLevel, setUserLevel] = useState(1);
  const [xpCurrent, setXpCurrent] = useState(0);
  const [xpNeeded, setXpNeeded] = useState(1);
  const [pendingTokens, setPendingTokens] = useState<Array<{skinName: string}>>([]);
  const [pendingEffectTokens, setPendingEffectTokens] = useState<Array<{effectName: string}>>([]);
  const [, setShowTokenReveal] = useState(false);
  const tokenRevealShownRef = useRef(false);
  const effectTokenRevealShownRef = useRef(false);
  const [levelUpText, setLevelUpText] = useState<string | null>(null);

  // Multibox state
  const [multiboxEnabled, setMultiboxEnabled] = useState(false);
  const [multiboxSlot, setMultiboxSlot] = useState(0);
  const [multiAlive, setMultiAlive] = useState(false);
  const multiboxEnabledRef = useRef(false);
  const [multiboxWanted, setMultiboxWanted] = useState(false);
  const multiboxWantedRef = useRef(false);

  // Powerup state (received via WebSocket)
  const [powerupInventory, setPowerupInventory] = useState<Record<string, number>>({});

  // Tank state
  const [showTankLobby, setShowTankLobby] = useState(false);
  const [tankState, setTankState] = useState<TankLobbyState | null>(null);
  const tankCursorsRef = useRef<TankCursorInfo[]>([]);

  // Fetch display info from Logto after authentication (name, picture, provider).
  // Server profile + session token are fetched by the connect effect below.
  useEffect(() => {
    if (!isAuthenticated) {
      setUserProfile(null);
      setSessionToken(null);
      setDisplayName(null);
      setDisplayPicture(null);
      setAuthProvider(null);
      return;
    }

    (async () => {
      try {
        const claims = await getIdTokenClaims();

        // Fetch user info to get identity provider and display name
        try {
          const info = await fetchUserInfo();
          const name = info?.name || info?.username || (info as Record<string, unknown>)?.email as string || claims?.name || claims?.username || null;
          setDisplayName(name);
          setDisplayPicture((info?.picture || claims?.picture || null) as string | null);

          if (info?.identities) {
            const providers = Object.keys(info.identities);
            if (providers.length > 0) {
              setAuthProvider(providers[0] ?? null);
            }
          }
        } catch {
          const name = claims?.name || claims?.username || null;
          setDisplayName(name);
          setDisplayPicture((claims?.picture || null) as string | null);
        }
      } catch (err) {
        console.warn("[Auth] Error fetching display info:", err);
      }
    })();
  }, [isAuthenticated, getIdTokenClaims, fetchUserInfo]);

  // Periodically refresh user profile (points, topScore, etc.) every 5 seconds
  useEffect(() => {
    if (!sessionToken || !serverBaseUrl) return;

    const refresh = async () => {
      try {
        const resp = await fetch(
          `${serverBaseUrl}/api/auth/profile?session=${encodeURIComponent(sessionToken)}`
        );
        if (resp.ok) {
          const data = await resp.json();
          setUserProfile(data.user);
          setInClan(!!data.user?.clanId);
          if (data.level) setUserLevel(data.level);
          if (data.xpCurrent !== undefined) setXpCurrent(data.xpCurrent);
          if (data.xpNeeded !== undefined) setXpNeeded(data.xpNeeded);
          // Show token reveal if there are pending tokens (only once per batch)
          if (data.user?.pendingTokens?.length > 0 && !tokenRevealShownRef.current) {
            tokenRevealShownRef.current = true;
            setPendingTokens(data.user.pendingTokens);
            // Show level-up text in HUD (don't interrupt gameplay with modal)
            setLevelUpText("Level up!");
            setTimeout(() => setLevelUpText(null), 4000);
          }
          // Show effect token reveal if there are pending effect tokens
          if (data.user?.pendingEffectTokens?.length > 0 && !effectTokenRevealShownRef.current) {
            effectTokenRevealShownRef.current = true;
            setPendingEffectTokens(data.user.pendingEffectTokens);
          }
        }
      } catch {
        // ignore network errors
      }
    };

    // Fetch immediately once, then every 5s
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [sessionToken, serverBaseUrl]); // intentionally omit showTokenReveal to prevent re-trigger

  const handleSignIn = useCallback(() => {
    authFailedRef.current = false;
    signIn(window.location.origin + "/auth/callback");
  }, [signIn]);

  const handleSignOut = useCallback(() => {
    authFailedRef.current = false;
    setUserProfile(null);
    setSessionToken(null);
    setDisplayName(null);
    setDisplayPicture(null);
    setAuthProvider(null);
    signOut(window.location.origin + "/auth/logout");
  }, [signOut]);

  // Set up connection callbacks (stable ref)
  const setupConnection = useCallback(() => {
    const gs = stateRef.current;

    const conn = new Connection({
      onState: (s) => {
        setConnectionState(s);
        if (s === "disconnected") {
          stopAllBRSounds();
          setAlive(false);
          setShowLobby(true);
          // Reset multibox server state — server doesn't know about us anymore
          setMultiboxEnabled(false);
          multiboxEnabledRef.current = false;
          setMultiboxSlot(0);
          setMultiAlive(false);
          if (rendererRef.current) {
            rendererRef.current.multiboxSlot = 0;
          }
          // Reset tank state
          setShowTankLobby(false);
          setTankState(null);
          tankCursorsRef.current = [];
        }
      },
      onWorldUpdate: (ev) => {
        gs.onWorldUpdate(ev);
        const newScore = gs.score;
        if (newScore !== prevScoreRef.current) {
          prevScoreRef.current = newScore;
          setScore(newScore);
        }
      },
      onCamera: (cam) => gs.onCamera(cam),
      onBorder: (b) => gs.onBorder(b),
      onAddMyCell: (id) => {
        gs.onAddMyCell(id);
        setAlive(true);
        setShowLobby(false);
        // If user wants multibox but it's not enabled yet, send toggle now that we're alive
        if (multiboxWantedRef.current && !multiboxEnabledRef.current) {
          connRef.current?.sendMultiboxToggle();
        }
      },
      onAddMultiCell: (id) => {
        gs.onAddMultiCell(id);
      },
      onClearAll: () => gs.onClearAll(),
      onClearMine: () => {
        // Play random death sound if we died during an active BR
        if (gs.battleRoyale && gs.battleRoyale.state === 2) {
          onBRDeath();
        }
        gs.onClearMine();
        setAlive(false);

        // Reset tank state on death
        setTankState(null);
        tankCursorsRef.current = [];

        // Auto-respawn: re-spawn after a short delay if setting enabled
        // (Skip during multibox — the server handles respawning individual slots.
        //  ClearMine during multibox means both players are truly dead.)
        if (multiboxEnabledRef.current) {
          setShowLobby(true);
          return;
        }
        const currentSettings = JSON.parse(localStorage.getItem("h4kmally-settings") || "{}");
        if (currentSettings.autoRespawn && connRef.current?.connected) {
          setTimeout(() => {
            const sp = lastSpawnRef.current;
            connRef.current?.sendSpawn(sp.name, sp.skin, sp.effect);
          }, 1500);
        } else {
          // Show death card if there are meaningful stats
          if (gs.lastDeathStats && gs.lastDeathStats.peakMass > 0) {
            setShowDeathCard(true);
          } else {
            setShowLobby(true);
          }
        }
      },
      onLeaderboard: (entries) => {
        gs.onLeaderboard(entries);
        setLeaderboard([...entries]);
      },
      onSpawnResult: (accepted) => {
        gs.onSpawnResult(accepted);
      },
      onChat: (msg) => {
        gs.onChat(msg);
        setChatMessages([...gs.chatHistory]);
      },
      onClanChat: (msg) => {
        gs.onClanChat(msg);
        setClanChatMessages([...gs.clanChatHistory]);
      },
      onClanPositions: (members) => {
        gs.onClanPositions(members);
      },
      onBattleRoyale: (br) => {
        gs.onBattleRoyale(br);
        onBRUpdate(
          br.state,
          br.timeRemaining,
          br.winnerName,
          lastSpawnRef.current.name,
          gs.alive,
        );
        // Confetti for the winner
        if (br.state === 3 && br.winnerName && br.winnerName === lastSpawnRef.current.name) {
          rendererRef.current?.triggerConfetti();
        }
      },
      onPingReply: (ms) => {
        gs.latency = ms;
        setLatency(ms);
      },
      onMultiboxState: (s) => {
        setMultiboxEnabled(s.enabled);
        multiboxEnabledRef.current = s.enabled;
        setMultiboxSlot(s.activeSlot);
        setMultiAlive(s.multiAlive);
        // Keep the renderer's slot in sync so drawCell highlights correctly
        if (rendererRef.current) {
          rendererRef.current.multiboxSlot = s.activeSlot;
        }
      },
      onPowerupState: (inventory) => {
        setPowerupInventory(inventory);
      },
      onTankLobby: (state) => {
        setTankState(state);
        if (state.state === "playing") {
          setShowTankLobby(false);
          setAlive(true);
          setShowLobby(false);
        }
        if (state.state === "ended") {
          setTankState(null);
          tankCursorsRef.current = [];
        }
      },
      onTankCursors: (cursors) => {
        tankCursorsRef.current = cursors;
      },
    });

    connRef.current = conn;
    return conn;
  }, []);

  // Initialize renderer (no connection yet — that happens after auth resolves)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gs = stateRef.current;
    const renderer = new Renderer(canvas, gs, loadSettings());
    rendererRef.current = renderer;
    const stop = renderer.start();

    setupConnection();

    // Derive server base URL from WS URL
    const defaultWs = import.meta.env.VITE_DEFAULT_WS || "ws://localhost:3001/ws/";
    wsBaseUrlRef.current = defaultWs;
    try {
      const u = new URL(defaultWs);
      u.protocol = u.protocol === "wss:" ? "https:" : "http:";
      u.pathname = "";
      const base = u.origin;
      setServerBaseUrl(base);
      if (rendererRef.current) {
        rendererRef.current.serverBaseUrl = base;
      }
    } catch { /* ignore */ }

    return () => {
      stop();
      connRef.current?.disconnect();
    };
  }, [setupConnection]);

  // Single unified connect: wait for auth to finish loading, then connect once
  // with or without a session token.
  useEffect(() => {
    if (authLoading) return; // still resolving auth state
    const conn = connRef.current;
    const baseWs = wsBaseUrlRef.current;
    if (!conn || !baseWs) return;

    // Already connected (e.g. hot-reload) — skip
    if (conn.connected) return;

    if (!isAuthenticated || !serverBaseUrl || authFailedRef.current) {
      // Guest — connect without session
      console.log("[WS] Connecting as guest");
      conn.connect(baseWs);
      return;
    }

    // Authenticated — fetch session token first, then connect with it
    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.log("[WS] No access token, connecting as guest");
          authFailedRef.current = true;
          conn.connect(baseWs);
          return;
        }
        const resp = await fetch(`${serverBaseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          setUserProfile(data.user);
          setInClan(!!data.user?.clanId);
          setSessionToken(data.session);
          const wsUrl = baseWs + (baseWs.includes("?") ? "&" : "?") +
            "session=" + encodeURIComponent(data.session);
          console.log("[WS] Connecting with session token");
          conn.connect(wsUrl);
        } else {
          console.warn("[WS] /api/auth/me failed, connecting as guest");
          conn.connect(baseWs);
        }
      } catch (err) {
        console.warn("[WS] Auth error, connecting as guest:", err);
        authFailedRef.current = true;
        conn.connect(baseWs);
      }
    })();
  }, [authLoading, isAuthenticated, serverBaseUrl, getAccessToken]);

  // Mouse tracking → send MOUSE updates at 30Hz
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const onMouseMove = (e: MouseEvent) => {
      renderer.updateMouse(e);
    };
    const onWheel = (e: WheelEvent) => {
      renderer.handleWheel(e);
    };
    const onClick = (e: MouseEvent) => {
      renderer.handleClick(e);
    };
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onClick);

    // Send mouse position to server at ~30Hz (alive or spectating)
    const interval = setInterval(() => {
      if (connRef.current?.connected) {
        renderer.refreshMouseWorld();
        connRef.current.sendMouse(renderer.mouseWorldX, renderer.mouseWorldY);
      }
      // Push tank cursors to renderer
      renderer.tankCursors = tankCursorsRef.current;
    }, 33);
    mouseIntervalRef.current = interval;

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      clearInterval(interval);
    };
  }, [alive]);

  // Keyboard + mouse controls (uses keybindsRef for latest bindings)
  useEffect(() => {
    keybindsRef.current = keybinds;
  }, [keybinds]);

  useEffect(() => {
    let ejectInterval: ReturnType<typeof setInterval> | null = null;
    const activeEjectKeys = new Set<string>();

    const startEject = (tag: string, rateMs: number) => {
      if (activeEjectKeys.has(tag)) return;
      activeEjectKeys.add(tag);
      if (ejectInterval) clearInterval(ejectInterval);
      const conn = connRef.current;
      if (conn?.connected) conn.sendEject();
      ejectInterval = setInterval(() => {
        const c = connRef.current;
        if (c?.connected) c.sendEject();
      }, rateMs);
    };

    const stopEject = (tag: string) => {
      activeEjectKeys.delete(tag);
      if (activeEjectKeys.size === 0 && ejectInterval) {
        clearInterval(ejectInterval);
        ejectInterval = null;
      }
    };

    /** Check if a keyboard key matches a keybind action */
    const keyMatches = (eventKey: string, action: keyof Keybinds): boolean => {
      const bound = keybindsRef.current[action];
      if (bound === null) return false;
      return keyToBinding(eventKey) === bound;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Escape is always hardcoded: toggle options / exit spectator
      if (e.key === "Escape") {
        if (!alive && !showLobby) {
          setShowLobby(true);
          return;
        }
        setShowOptions((prev) => !prev);
        return;
      }

      // Spectator follow
      if (!alive && !showLobby) {
        if (keyMatches(e.key, "spectatorFollow")) {
          const conn = connRef.current;
          if (conn?.connected) conn.sendSpectatorFollow();
        }
        return;
      }

      const conn = connRef.current;
      if (!conn?.connected || !alive) return;

      if (keyMatches(e.key, "split")) {
        e.preventDefault();
        conn.sendSplit();
      }
      if (keyMatches(e.key, "doubleSplit")) {
        e.preventDefault();
        for (let i = 0; i < 2; i++) conn.sendSplit();
      }
      if (keyMatches(e.key, "tripleSplit")) {
        e.preventDefault();
        for (let i = 0; i < 3; i++) conn.sendSplit();
      }
      if (keyMatches(e.key, "quadSplit")) {
        e.preventDefault();
        for (let i = 0; i < 4; i++) conn.sendSplit();
      }
      if (keyMatches(e.key, "fastEject")) {
        startEject("fastEject", 40);
      }
      if (keyMatches(e.key, "slowEject")) {
        startEject("slowEject", 250);
      }
      if (keyMatches(e.key, "multiboxSwitch")) {
        e.preventDefault();
        conn.sendMultiboxSwitch();
      }
      if (keyMatches(e.key, "directionLock")) {
        e.preventDefault();
        conn.sendDirectionLock(true);
      }
      if (keyMatches(e.key, "freeze")) {
        e.preventDefault();
        conn.sendFreezePosition(true);
      }
      // Powerup use: keys 1-6
      if (e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        conn.sendUsePowerup(parseInt(e.key, 10));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (keyMatches(e.key, "fastEject")) stopEject("fastEject");
      if (keyMatches(e.key, "slowEject")) stopEject("slowEject");
      if (keyMatches(e.key, "directionLock")) {
        const conn = connRef.current;
        if (conn?.connected) conn.sendDirectionLock(false);
      }
      if (keyMatches(e.key, "freeze")) {
        const conn = connRef.current;
        if (conn?.connected) conn.sendFreezePosition(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Mouse controls: configurable via keybinds.mouseEject / keybinds.mouseSplit
    const onMouseDown = (e: MouseEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const conn = connRef.current;
      if (!conn?.connected || !alive) return;

      const mb = mouseButtonToBinding(e.button);
      if (mb === keybindsRef.current.mouseEject) {
        startEject("mouse", 40);
      }
      if (mb === keybindsRef.current.mouseSplit) {
        e.preventDefault();
        conn.sendSplit();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const mb = mouseButtonToBinding(e.button);
      if (mb === keybindsRef.current.mouseEject) stopEject("mouse");
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContextMenu);
      if (ejectInterval) clearInterval(ejectInterval);
    };
  }, [alive, showLobby]);

  // Handlers
  const handleSpawn = useCallback((name: string, skin: string, effect: string) => {
    lastSpawnRef.current = { name, skin, effect };
    const conn = connRef.current;
    if (conn) conn.sendSpawn(name, skin, effect);
  }, []);

  const handleSpectate = useCallback(() => {
    const conn = connRef.current;
    if (conn?.connected) {
      conn.sendSpectate();
      setShowLobby(false);
    }
  }, []);

  const handleOpenAdmin = useCallback(() => {
    setShowAdmin(true);
  }, []);

  const handleOpenShop = useCallback(() => {
    setShowShop(true);
  }, []);

  const handleOpenMarketplace = useCallback(() => {
    setShowMarketplace(true);
  }, []);

  const handleMultiboxToggle = useCallback(() => {
    const newWanted = !multiboxWantedRef.current;
    multiboxWantedRef.current = newWanted;
    setMultiboxWanted(newWanted);
    // If player is alive, send toggle to server immediately
    const conn = connRef.current;
    if (conn?.connected && alive) {
      conn.sendMultiboxToggle();
    }
  }, [alive]);

  const handleOpenTank = useCallback(() => {
    setShowTankLobby(true);
  }, []);

  const handleTankQueue = useCallback((size: number, isPrivate: boolean) => {
    const conn = connRef.current;
    if (!conn?.connected) return;
    const name = localStorage.getItem("h4kmally-name") || "unnamed";
    const skin = localStorage.getItem("h4kmally-skin") || "";
    const effect = localStorage.getItem("h4kmally-effect") || "";
    conn.sendTankQueue(size, isPrivate, name, skin, effect);
  }, []);

  const handleTankJoin = useCallback((code: string) => {
    const conn = connRef.current;
    if (!conn?.connected) return;
    const name = localStorage.getItem("h4kmally-name") || "unnamed";
    const skin = localStorage.getItem("h4kmally-skin") || "";
    const effect = localStorage.getItem("h4kmally-effect") || "";
    conn.sendTankJoin(code, name, skin, effect);
  }, []);

  const handleTankCancel = useCallback(() => {
    const conn = connRef.current;
    if (!conn?.connected) return;
    conn.sendTankCancel();
    setTankState(null);
  }, []);

  const handleTankVote = useCallback((skin: string, effect: string) => {
    const conn = connRef.current;
    if (!conn?.connected) return;
    conn.sendTankVote(skin, effect);
  }, []);

  const handleChatSend = useCallback((text: string) => {
    const conn = connRef.current;
    if (conn) conn.sendChat(text);
  }, []);

  const handleClanChatSend = useCallback((text: string) => {
    const base = serverBaseUrl || wsBaseUrlRef.current?.replace("ws", "http")?.replace(/:\d+$/, ":3002") || "";
    const token = sessionToken;
    if (!base || !token) return;
    fetch(`${base}/api/clans/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  }, [serverBaseUrl, sessionToken]);

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    // Push to renderer immediately
    if (rendererRef.current) {
      rendererRef.current.settings = newSettings;
    }
  }, []);

  const handleKeybindsChange = useCallback((newKeybinds: Keybinds) => {
    setKeybinds(newKeybinds);
    saveKeybinds(newKeybinds);
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />
      <CustomCursor cursorId={settings.cursor} cursorMode={settings.cursorMode} />

      {/* Settings gear button — only visible during gameplay */}
      {alive && (
        <button
          className="settings-btn"
          onClick={() => setShowOptions(true)}
          title="Options (Esc)"
        >
          &#9881;
        </button>
      )}

      {showOptions && (
        <Options
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setShowOptions(false)}
          onOpenKeybinds={() => setShowKeybinds(true)}
        />
      )}

      {showKeybinds && (
        <KeybindPanel
          keybinds={keybinds}
          onChange={handleKeybindsChange}
          onClose={() => setShowKeybinds(false)}
        />
      )}

      {showHowToPlay && (
        <HowToPlay
          keybinds={keybinds}
          onClose={() => setShowHowToPlay(false)}
        />
      )}

      {showDeathCard && stateRef.current?.lastDeathStats && (
        <DeathCard
          peakMass={stateRef.current.lastDeathStats.peakMass}
          cellsEaten={stateRef.current.lastDeathStats.cellsEaten}
          timeAlive={stateRef.current.lastDeathStats.timeAlive}
          onPlayAgain={() => {
            setShowDeathCard(false);
            setShowLobby(true);
          }}
          onSpectate={() => {
            setShowDeathCard(false);
          }}
        />
      )}

      {showLobby && !showOptions && (
        <Lobby
          connectionState={connectionState}
          onSpawn={handleSpawn}
          onSpectate={handleSpectate}
          canSpawn={connectionState === "connected"}
          serverBaseUrl={serverBaseUrl}
          leaderboard={leaderboard}
          isAuthenticated={isAuthenticated}
          userProfile={userProfile}
          authProvider={authProvider}
          displayName={displayName}
          displayPicture={displayPicture}
          isAdmin={!!userProfile?.isAdmin}
          onOpenAdmin={handleOpenAdmin}
          onOpenShop={handleOpenShop}
          onOpenMarketplace={handleOpenMarketplace}
          onOpenClan={() => setShowClanPanel(true)}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          sessionToken={sessionToken}
          userLevel={userLevel}
          xpCurrent={xpCurrent}
          xpNeeded={xpNeeded}
          onOpenOptions={() => setShowOptions(true)}
          onOpenHowToPlay={() => setShowHowToPlay(true)}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          multiboxEnabled={multiboxWanted}
          onMultiboxToggle={handleMultiboxToggle}
          onOpenTank={handleOpenTank}
          pendingTokens={pendingTokens}
          pendingEffectTokens={pendingEffectTokens}
          serverBaseUrlForTokens={serverBaseUrl}
          sessionTokenForTokens={sessionToken}
          onTokenRevealDone={() => {
            setShowTokenReveal(false);
            setPendingTokens([]);
            tokenRevealShownRef.current = false;
          }}
          onEffectTokenRevealDone={() => {
            setPendingEffectTokens([]);
            effectTokenRevealShownRef.current = false;
          }}
        />
      )}

      {showTankLobby && !alive && (
        <TankLobby
          tankState={tankState}
          onQueue={handleTankQueue}
          onJoin={handleTankJoin}
          onCancel={handleTankCancel}
          onVote={handleTankVote}
          onClose={() => { setShowTankLobby(false); setTankState(null); }}
          connectionState={connectionState}
        />
      )}

      {alive && (
        <>
          <HUD score={score} latency={latency} leaderboard={leaderboard} levelUpText={levelUpText} />
          <Minimap state={stateRef.current} />
          {multiboxEnabled && (
            <MultiboxIndicator activeSlot={multiboxSlot} multiAlive={multiAlive} />
          )}
          {tankState?.state === "playing" && tankState.members && (
            <div className="tank-playing-indicator">
              <span className="tank-playing-label">🚀 TANK</span>
              <span className="tank-playing-members">
                {tankState.members.map((m: { name: string }) => m.name).join(" · ")}
              </span>
            </div>
          )}
          {Object.keys(powerupInventory).length > 0 && (
            <PowerupHUD inventory={powerupInventory} />
          )}
        </>
      )}

      {/* Spectator mode: show HUD, minimap, eyes indicator, and admin god-mode toggle */}
      {!alive && !showLobby && (
        <>
          <HUD score={0} latency={latency} leaderboard={leaderboard} />
          <Minimap state={stateRef.current} />
          <div className="spectator-overlay">
            <div className="spectator-eyes">👀</div>
            <div className="spectator-hint">Press F to follow &middot; Esc for lobby</div>
          </div>
        </>
      )}

      {showAdmin && serverBaseUrl && sessionToken && (
        <AdminPanel
          serverBaseUrl={serverBaseUrl}
          sessionToken={sessionToken}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {showShop && serverBaseUrl && sessionToken && (
        <Shop
          serverBaseUrl={serverBaseUrl}
          sessionToken={sessionToken}
          onClose={() => setShowShop(false)}
        />
      )}

      {showMarketplace && serverBaseUrl && (
        <Marketplace
          serverBaseUrl={serverBaseUrl}
          sessionToken={sessionToken}
          onClose={() => setShowMarketplace(false)}
        />
      )}

      {showClanPanel && serverBaseUrl && sessionToken && (
        <ClanPanel
          serverBaseUrl={serverBaseUrl}
          sessionToken={sessionToken}
          isAdmin={!!userProfile?.isAdmin}
          onClose={() => setShowClanPanel(false)}
          onClanChange={() => {
            // Re-fetch profile to update inClan
            fetch(`${serverBaseUrl}/api/auth/profile?session=${encodeURIComponent(sessionToken)}`)
              .then(r => r.json())
              .then(data => {
                if (data.user) {
                  setUserProfile(data.user);
                  setInClan(!!data.user.clanId);
                }
              })
              .catch(() => {});
          }}
        />
      )}

      {isAuthenticated && serverBaseUrl && sessionToken && showLobby && (
        <DailyGift
          serverBaseUrl={serverBaseUrl}
          sessionToken={sessionToken}
        />
      )}

      {connectionState === "connected" && (
        <Chat
          messages={chatMessages}
          clanMessages={clanChatMessages}
          inClan={inClan}
          onSend={handleChatSend}
          onClanSend={handleClanChatSend}
        />
      )}
    </div>
  );
}
