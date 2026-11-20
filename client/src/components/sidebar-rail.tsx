"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { PixelMLogoBox } from "./brand-logo";import type { ChatSession } from "@/types/chat";

/* ── SVG Icons ── */
function IcoPlus() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IcoClock() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 15.5" />
    </svg>
  );
}
function IcoClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IcoTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

/* ── Rail button with tooltip ── */
function RailBtn({ children, onClick, label, active = false }: {
  children: React.ReactNode; onClick: () => void; label: string; active?: boolean;
}) {
  const [tip, setTip] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        className="flex items-center justify-center rounded-xl transition-all duration-150"
        style={{ width: 38, height: 38, color: active ? "#F0F0F0" : "#666", background: active ? "#2C2C2F" : "transparent" }}
        onMouseOver={(e) => { if (!active) e.currentTarget.style.color = "#CCC"; }}
        onMouseOut={(e) => { if (!active) e.currentTarget.style.color = "#666"; }}
      >
        {children}
      </button>
      {tip && (
        <div className="absolute top-1/2 -translate-y-1/2 z-50 px-2.5 py-1 rounded-lg text-xs whitespace-nowrap pointer-events-none"
          style={{ left: 46, background: "#2C2C2F", color: "#F0F0F0", border: "1px solid #3A3A3D", boxShadow: "0 4px 16px #00000066" }}>
          {label}
        </div>
      )}
    </div>
  );
}

const RAIL_W = 54;
const PANEL_MIN = 220;
const PANEL_MAX = 480;
const PANEL_DEFAULT = 268;

interface SidebarRailProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onOpenSession: (session: ChatSession) => void;
  onDeleteSession: (id: string) => void;
}

export function SidebarRail({ sessions, activeSessionId, onNewChat, onOpenSession, onDeleteSession }: SidebarRailProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(PANEL_DEFAULT);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPanelWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW.current + (e.clientX - startX.current))));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  function toggleHistory() { setHistoryOpen(p => !p); }
  function handleNewChat() { onNewChat(); setHistoryOpen(false); }

  return (
    <div className="flex h-full flex-shrink-0"
      style={{ width: historyOpen ? RAIL_W + panelWidth : RAIL_W, transition: "width 0.18s ease" }}>

      {/* Rail */}
      <aside className="flex flex-col items-center py-4 gap-2 h-full flex-shrink-0"
        style={{ width: RAIL_W, background: "transparent", borderRight: "1px solid #222225" }}>

        {/* M logo — clicks open sidebar */}
        <button onClick={toggleHistory} title="Toggle history"
          className="mb-2 mt-0.5 rounded-lg transition-opacity hover:opacity-80">
          <PixelMLogoBox size={34} />
        </button>

        <RailBtn label="New Chat" onClick={handleNewChat}><IcoPlus /></RailBtn>
        <RailBtn label="History" active={historyOpen} onClick={toggleHistory}><IcoClock /></RailBtn>

        <div className="flex-1" />
      </aside>

      {/* History panel */}
      {historyOpen && (
        <div className="relative flex h-full flex-shrink-0" style={{ width: panelWidth }}>
          <div className="flex flex-col h-full w-full overflow-hidden"
            style={{ background: "#17171A", borderRight: "1px solid #222225" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: "1px solid #222225" }}>
              <span className="text-sm font-semibold" style={{ color: "#F0F0F0" }}>Chat History</span>
              <button onClick={toggleHistory} style={{ color: "#555" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#F0F0F0")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}>
                <IcoClose />
              </button>
            </div>

            {/* New chat row */}
            <button onClick={handleNewChat}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm flex-shrink-0 text-left transition-colors"
              style={{ color: "#FF2D7A", borderBottom: "1px solid #222225" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1E1E21")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <IcoPlus />
              New Chat
            </button>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto py-1">
              {sessions.length === 0 && (
                <p className="px-4 py-4 text-xs" style={{ color: "#444" }}>No chats yet.</p>
              )}
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isActive={s.id === activeSessionId}
                  onOpen={() => { onOpenSession(s); setHistoryOpen(false); }}
                  onDelete={() => onDeleteSession(s.id)}
                />
              ))}
            </div>
          </div>

          {/* Drag handle */}
          <div onMouseDown={onDragStart} className="absolute right-0 top-0 h-full z-20 group"
            style={{ width: 8, cursor: "col-resize" }}>
            <div className="absolute right-0 top-0 h-full w-px transition-colors duration-150 group-hover:bg-orange-500"
              style={{ background: "#222225" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRow({ session, isActive, onOpen, onDelete }: {
  session: ChatSession; isActive: boolean; onOpen: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-1 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors"
      style={{ background: isActive ? "#252528" : hovered ? "#1E1E21" : "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium" style={{ color: isActive ? "#F0F0F0" : "#D0D0D0" }}>
          {session.title}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: "#555" }}>{session.preview}</p>
      </div>

      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex-shrink-0 p-1 rounded ml-1"
          style={{ color: "#555" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#FF6B6B")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
        >
          <IcoTrash />
        </button>
      )}
    </div>
  );
}
