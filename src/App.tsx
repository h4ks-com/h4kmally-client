import { useRef, useEffect, useState, useCallback } from "react";
import { useLogto } from "@logto/react";
import { Connection } from "./protocol";
import type { ConnectionState, LeaderboardEntry } from "./protocol";
import { GameState, Renderer, loadSettings, saveSettings } from "./game";
import type { ChatEntry, Settings } from "./game";
import { Lobby } from "./components/Lobby";
import { HUD } from "./components/HUD";
import { Minimap } from "./components/Minimap";
import { Chat } from "./components/Chat";
import { Options } from "./components/Options";
import { Callback } from "./components/Callback";
import { AdminPanel } from "./components/AdminPanel";
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
  const lastSpawnRef = useRef<{ name: string; skin: string }>({ name: "unnamed", skin: "" });
  const wsBaseUrlRef = useRef<string>("");

  // UI state
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [serverBaseUrl, setServerBaseUrl] = useState("");
  const [alive, setAlive] = useState(false);
  const [showLobby, setShowLobby] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [score, setScore] = useState(0);
  const [latency, setLatency] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Auth state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userLevel, setUserLevel] = useState(1);
  const [xpCurrent, setXpCurrent] = useState(0);
  const [xpNeeded, setXpNeeded] = useState(1);
  const [pendingTokens, setPendingTokens] = useState<Array<{skinName: string}>>([]);
  const [, setShowTokenReveal] = useState(false);
  const tokenRevealShownRef = useRef(false);
  const [levelUpText, setLevelUpText] = useState<string | null>(null);

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
    signIn(window.location.origin + "/auth/callback");
  }, [signIn]);

  const handleSignOut = useCallback(() => {
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
          setAlive(false);
          setShowLobby(true);
        }
      },
      onWorldUpdate: (ev) => {
        gs.onWorldUpdate(ev);
        setScore(gs.score);
      },
      onCamera: (cam) => gs.onCamera(cam),
      onBorder: (b) => gs.onBorder(b),
      onAddMyCell: (id) => {
        gs.onAddMyCell(id);
        setAlive(true);
        setShowLobby(false);
      },
      onClearAll: () => gs.onClearAll(),
      onClearMine: () => {
        gs.onClearMine();
        setAlive(false);
        // Auto-respawn: re-spawn after a short delay if setting enabled
        const currentSettings = JSON.parse(localStorage.getItem("h4kmally-settings") || "{}");
        if (currentSettings.autoRespawn && connRef.current?.connected) {
          setTimeout(() => {
            const sp = lastSpawnRef.current;
            connRef.current?.sendSpawn(sp.name, sp.skin);
          }, 1500);
        } else {
          setShowLobby(true);
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
      onPingReply: (ms) => {
        gs.latency = ms;
        setLatency(ms);
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

    if (!isAuthenticated || !serverBaseUrl) {
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
          conn.connect(baseWs);
          return;
        }
        const resp = await fetch(`${serverBaseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          setUserProfile(data.user);
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
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Send mouse position to server at ~30Hz (alive or spectating)
    const interval = setInterval(() => {
      if (connRef.current?.connected) {
        renderer.refreshMouseWorld();
        connRef.current.sendMouse(renderer.mouseWorldX, renderer.mouseWorldY);
      }
    }, 33);
    mouseIntervalRef.current = interval;

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      clearInterval(interval);
    };
  }, [alive]);

  // Keyboard controls
  useEffect(() => {
    // Eject intervals: Q = fast (25/sec), W = slow (4/sec)
    let ejectInterval: ReturnType<typeof setInterval> | null = null;
    const activeEjectKeys = new Set<string>();

    const startEject = (key: string, rateMs: number) => {
      if (activeEjectKeys.has(key)) return; // already held
      activeEjectKeys.add(key);
      // If another eject key is already running, stop it — new key takes over
      if (ejectInterval) clearInterval(ejectInterval);
      const conn = connRef.current;
      if (conn?.connected) conn.sendEject(); // immediate first shot
      ejectInterval = setInterval(() => {
        const c = connRef.current;
        if (c?.connected) c.sendEject();
      }, rateMs);
    };

    const stopEject = (key: string) => {
      activeEjectKeys.delete(key);
      if (activeEjectKeys.size === 0 && ejectInterval) {
        clearInterval(ejectInterval);
        ejectInterval = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Escape toggles options modal, or returns to lobby when spectating
      if (e.key === "Escape") {
        if (!alive && !showLobby) {
          // Exit spectator mode back to lobby
          setShowLobby(true);
          return;
        }
        setShowOptions((prev) => !prev);
        return;
      }

      // Spectator: F to toggle follow mode
      if (!alive && !showLobby) {
        if (e.key === "f" || e.key === "F") {
          const conn = connRef.current;
          if (conn?.connected) conn.sendSpectatorFollow();
          return;
        }
        return;
      }

      const conn = connRef.current;
      if (!conn?.connected || !alive) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        conn.sendSplit();
      }
      // Multi-split macros: A=double, S=triple, D=quad
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        for (let i = 0; i < 2; i++) conn.sendSplit();
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        for (let i = 0; i < 3; i++) conn.sendSplit();
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        for (let i = 0; i < 4; i++) conn.sendSplit();
      }
      if (e.key === "q" || e.key === "Q") {
        startEject("q", 40); // 25 per second
      }
      if (e.key === "w" || e.key === "W") {
        startEject("w", 250); // 4 per second
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "Q") stopEject("q");
      if (e.key === "w" || e.key === "W") stopEject("w");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Mouse controls: left-click hold = rapid eject (same as Q), right-click = split
    const onMouseDown = (e: MouseEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const conn = connRef.current;
      if (!conn?.connected || !alive) return;

      if (e.button === 0) {
        // Left mouse button = rapid eject (same as Q)
        startEject("mouse0", 40);
      }
      if (e.button === 2) {
        // Right mouse button = split
        e.preventDefault();
        conn.sendSplit();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) stopEject("mouse0");
    };

    const onContextMenu = (e: MouseEvent) => {
      // Prevent right-click menu on the game canvas
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
  const handleSpawn = useCallback((name: string, skin: string) => {
    lastSpawnRef.current = { name, skin };
    const conn = connRef.current;
    if (conn) conn.sendSpawn(name, skin);
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

  const handleChatSend = useCallback((text: string) => {
    const conn = connRef.current;
    if (conn) conn.sendChat(text);
  }, []);

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    // Push to renderer immediately
    if (rendererRef.current) {
      rendererRef.current.settings = newSettings;
    }
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />

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
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          sessionToken={sessionToken}
          userLevel={userLevel}
          xpCurrent={xpCurrent}
          xpNeeded={xpNeeded}
          onOpenOptions={() => setShowOptions(true)}
          pendingTokens={pendingTokens}
          serverBaseUrlForTokens={serverBaseUrl}
          sessionTokenForTokens={sessionToken}
          onTokenRevealDone={() => {
            setShowTokenReveal(false);
            setPendingTokens([]);
            tokenRevealShownRef.current = false;
          }}
        />
      )}

      {alive && (
        <>
          <HUD score={score} latency={latency} leaderboard={leaderboard} levelUpText={levelUpText} />
          <Minimap state={stateRef.current} />
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
            {!!userProfile?.isAdmin && (
              <button
                className="spectator-godmode"
                onClick={() => {
                  const conn = connRef.current;
                  if (conn?.connected) conn.sendGodMode();
                }}
              >
                🌐 God Mode
              </button>
            )}
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

      {connectionState === "connected" && (
        <Chat messages={chatMessages} onSend={handleChatSend} />
      )}
    </div>
  );
}
