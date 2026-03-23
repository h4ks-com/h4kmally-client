import { useEffect, useRef } from "react";
import type { CursorDef } from "../game/cursors";
import { getCursorDef, renderCursorToDataURL } from "../game/cursors";
import "./CustomCursor.css";

const CURSOR_SIZE = 40;

interface CustomCursorProps {
  cursorId: string; // "" = no custom cursor
  cursorMode: "real" | "canvas" | "both";
}

/**
 * Custom cursor system supporting three modes:
 * - "real": Sets the OS cursor via CSS `cursor: url(...)` for zero-lag. No canvas overlay.
 * - "canvas": Canvas overlay following mouse (visible in screen recordings).
 * - "both": OS cursor + canvas overlay together.
 */
export function CustomCursor({ cursorId, cursorMode }: CustomCursorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const defRef = useRef<CursorDef | undefined>(undefined);

  // Set the real OS cursor when mode is "real" or "both"
  useEffect(() => {
    const useReal = cursorMode === "real" || cursorMode === "both";
    if (!useReal || !cursorId) {
      // Remove any custom CSS cursor
      document.documentElement.style.removeProperty("cursor");
      document.documentElement.classList.remove("custom-cursor-real");
      return;
    }

    const dataURL = renderCursorToDataURL(cursorId, CURSOR_SIZE);
    if (dataURL) {
      const hotspot = CURSOR_SIZE / 2;
      document.documentElement.style.cursor = `url(${dataURL}) ${hotspot} ${hotspot}, auto`;
      document.documentElement.classList.add("custom-cursor-real");
    }

    return () => {
      document.documentElement.style.removeProperty("cursor");
      document.documentElement.classList.remove("custom-cursor-real");
    };
  }, [cursorId, cursorMode]);

  // Pre-render canvas overlay cursor when mode is "canvas" or "both"
  useEffect(() => {
    const useCanvas = cursorMode === "canvas" || cursorMode === "both";
    const def = (useCanvas && cursorId) ? getCursorDef(cursorId) : undefined;
    defRef.current = def;
    const canvas = canvasRef.current;

    if (!def || !canvas) {
      // Hide canvas cursor in "real" mode
      document.documentElement.classList.remove("custom-cursor-canvas-active");
      if (canvas) canvas.style.display = "none";
      return;
    }

    // In pure "canvas" mode, hide the real cursor
    if (cursorMode === "canvas") {
      document.documentElement.classList.add("custom-cursor-canvas-active");
    } else {
      document.documentElement.classList.remove("custom-cursor-canvas-active");
    }

    canvas.width = CURSOR_SIZE;
    canvas.height = CURSOR_SIZE;
    canvas.style.display = "block";

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, CURSOR_SIZE, CURSOR_SIZE);
      def.draw(ctx, CURSOR_SIZE);
    }

    return () => {
      document.documentElement.classList.remove("custom-cursor-canvas-active");
    };
  }, [cursorId, cursorMode]);

  // Track mouse — update transform directly in the event handler (no RAF)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const half = CURSOR_SIZE / 2;

    const onMove = (e: MouseEvent) => {
      if (!defRef.current) return;
      canvas.style.transform = `translate3d(${e.clientX - half}px,${e.clientY - half}px,0)`;
      canvas.style.display = "block";
    };

    const onLeave = () => { canvas.style.display = "none"; };
    const onEnter = (e: MouseEvent) => {
      if (!defRef.current) return;
      canvas.style.transform = `translate3d(${e.clientX - half}px,${e.clientY - half}px,0)`;
      canvas.style.display = "block";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="custom-cursor-canvas"
      width={CURSOR_SIZE}
      height={CURSOR_SIZE}
      style={{ display: "none" }}
    />
  );
}
