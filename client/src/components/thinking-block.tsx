"use client";

import { useState } from "react";
import type { ThinkingStep } from "@/types/chat";

function ChevronDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface ThinkingBlockProps {
  steps: ThinkingStep[];
  isThinking: boolean;
  durationMs: number;
}

export function ThinkingBlock({ steps, isThinking, durationMs }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const seconds = (durationMs / 1000).toFixed(1);
  const label = isThinking ? `Thinking... ${seconds}s` : `Thought for ${seconds}s`;

  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#202022", border: "1px solid #2E2E31" }}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left"
        style={{ color: "#888" }}
      >
        <span style={{ color: "#FF2D7A" }}>{expanded ? <ChevronDown /> : <ChevronRight />}</span>
        <span className="text-xs" style={{ color: "#FF2D7A" }}>{label}</span>
      </button>

      {expanded && steps.length > 0 && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-2 text-xs leading-5" style={{ color: "#888" }}>
              <span style={{ color: "#FF2D7A", fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
              <span>{step.text}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes vibe-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }`}</style>
    </div>
  );
}
