import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatEntry } from "../game";
import "./Chat.css";

interface ChatProps {
  messages: ChatEntry[];
  onSend: (text: string) => void;
}

export function Chat({ messages, onSend }: ChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && input.trim()) {
        onSend(input.trim());
        setInput("");
        setOpen(false);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setInput("");
      }
      e.stopPropagation(); // prevent game controls
    },
    [input, onSend]
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

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="chat-container">
      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
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
          placeholder="Type a message..."
          maxLength={200}
        />
      )}
      {!open && messages.length > 0 && (
        <div className="chat-hint">Press Enter to chat</div>
      )}
    </div>
  );
}
