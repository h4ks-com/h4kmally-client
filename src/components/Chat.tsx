import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatEntry } from "../game";
import "./Chat.css";

interface ChatProps {
  messages: ChatEntry[];
  clanMessages: ChatEntry[];
  inClan: boolean;
  onSend: (text: string) => void;
  onClanSend: (text: string) => void;
}

export function Chat({ messages, clanMessages, inClan, onSend, onClanSend }: ChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"global" | "clan">("global");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeMessages = tab === "clan" ? clanMessages : messages;
  const activeSend = tab === "clan" ? onClanSend : onSend;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && input.trim()) {
        activeSend(input.trim());
        setInput("");
        setOpen(false);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setInput("");
      }
      e.stopPropagation(); // prevent game controls
    },
    [input, activeSend]
  );

  // Global Enter to open chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !open) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Auto-scroll to bottom (deferred to after layout for multiline messages)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Double rAF ensures the browser has completed layout for wrapped text
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [activeMessages]);

  return (
    <div className="chat-container">
      {inClan && (
        <div className="chat-tabs">
          <button
            className={`chat-tab ${tab === "global" ? "chat-tab-active" : ""}`}
            onClick={() => setTab("global")}
          >
            Global
          </button>
          <button
            className={`chat-tab ${tab === "clan" ? "chat-tab-active" : ""}`}
            onClick={() => setTab("clan")}
          >
            Clan
          </button>
        </div>
      )}
      <div className="chat-messages" ref={listRef}>
        {activeMessages.map((m, i) => (
          <div key={i} className="chat-msg">
            <span
              className="chat-name"
              style={{ color: `rgb(${m.color.r},${m.color.g},${m.color.b})` }}
            >
              {m.name || "unnamed"}:
            </span>{" "}
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      {open && (
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tab === "clan" ? "Clan message..." : "Type a message..."}
          maxLength={200}
        />
      )}
      {!open && activeMessages.length > 0 && (
        <div className="chat-hint">Press Enter to chat</div>
      )}
    </div>
  );
}
