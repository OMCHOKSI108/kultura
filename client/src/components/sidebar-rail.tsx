"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Boxes } from "lucide-react";
import { PixelMLogoBox } from "./brand-logo";
import type { ChatSession } from "@/types/chat";

function IcoPlus() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function IcoClock() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 15.5" /></svg>;
}
function IcoClose() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function IcoTrash() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
}

function RailBtn({
  children,
  onClick,
  label,
  active = false,
  badge,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  badge?: number;
}) {
  const [tip, setTip] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={onClick}
        aria-label={label}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        className="relative flex items-center justify-center rounded-xl transition-all duration-150"
        style={{ width: 38, height: 38, color: active ? "#F0F0F0" : "#777", background: active ? "#2C2C2F" : "transparent" }}
      >
        {children}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-pink-500 text-[10px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center shadow-lg animate-pulse">
            {badge}
          </span>
        )}
      </button>
      {tip && (
        <div className="absolute top-1/2 -translate-y-1/2 z-50 px-2.5 py-1 rounded-lg text-xs whitespace-nowrap pointer-events-none"
          style={{ left: 46, background: "#2C2C2F", color: "#F0F0F0", border: "1px solid #3A3A3D" }}>
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
  activeView?: "chat" | "hub";
  onSelectView?: (view: "chat" | "hub") => void;
  activeDownloadsCount?: number;
}

export function SidebarRail({
  sessions,
  activeSessionId,
  onNewChat,
  onOpenSession,
  onDeleteSession,
  activeView = "chat",
  onSelectView,
  activeDownloadsCount = 0,
}: SidebarRailProps) {
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
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return (
    <div className="flex h-full flex-shrink-0"
      style={{ width: historyOpen ? RAIL_W + panelWidth : RAIL_W, transition: "width 0.18s ease" }}>
      <aside className="flex flex-col items-center py-4 gap-2 h-full flex-shrink-0"
        style={{ width: RAIL_W, background: "transparent", borderRight: "1px solid #222225" }}>
        <button
          onClick={() => {
            onSelectView?.("chat");
            setHistoryOpen((p) => !p);
          }}
          title="Toggle history"
          className="mb-2 mt-0.5 hover:opacity-80"
        >
          <PixelMLogoBox size={34} />
        </button>
        <RailBtn label="New Chat" onClick={() => { onNewChat(); onSelectView?.("chat"); setHistoryOpen(false); }}><IcoPlus /></RailBtn>
        <RailBtn label="History" active={historyOpen} onClick={() => setHistoryOpen((p) => !p)}><IcoClock /></RailBtn>
        <RailBtn
          label="Model Hub"
          active={activeView === "hub"}
          badge={activeDownloadsCount}
          onClick={() => {
            onSelectView?.(activeView === "hub" ? "chat" : "hub");
            setHistoryOpen(false);
          }}
        >
          <Boxes className="w-4 h-4" />
        </RailBtn>
        <div className="flex-1" />
      </aside>

      {historyOpen && (
        <div className="relative flex h-full flex-shrink-0" style={{ width: panelWidth }}>
          <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: "#17171A", borderRight: "1px solid #222225" }}>
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #222225" }}>
              <span className="text-sm font-semibold text-gray-200">Chat History</span>
              <button onClick={() => setHistoryOpen(false)} aria-label="Close" className="text-gray-500 hover:text-white"><IcoClose /></button>
            </div>
            <button onClick={() => { onNewChat(); setHistoryOpen(false); }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm flex-shrink-0 text-left hover:bg-[#1E1E21]"
              style={{ color: "#FF2D7A", borderBottom: "1px solid #222225" }}>
              <IcoPlus /> New Chat
            </button>
            <div className="flex-1 overflow-y-auto py-1">
              {sessions.length === 0 && <p className="px-4 py-4 text-xs text-gray-600">No chats yet.</p>}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { onOpenSession(s); setHistoryOpen(false); }}
                  className="flex items-center justify-between gap-1 px-3 py-2.5 mx-1 rounded-lg cursor-pointer hover:bg-[#1E1E21] group transition-colors"
                  style={{ background: s.id === activeSessionId ? "#252528" : "transparent" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium text-gray-300">{s.title}</p>
                    <p className="text-xs truncate mt-0.5 text-gray-500">{s.preview}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400"
                  >
                    <IcoTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div onMouseDown={onDragStart} className="absolute right-0 top-0 h-full z-20 w-2 cursor-col-resize hover:bg-[#FF2D7A44]" />
        </div>
      )}
    </div>
  );
}
