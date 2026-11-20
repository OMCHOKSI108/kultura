"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/types/chat";
import { ThinkingBlock } from "./thinking-block";

/* ── Icons ── */
function IcoCopy() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
}
function IcoCheck() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IcoTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}

/* ── Markdown ── */
function MarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-7 text-sm" style={{ color: "#D0D0D0" }}>{children}</p>,
        strong: ({ children }) => <strong className="font-semibold" style={{ color: "#F0F0F0" }}>{children}</strong>,
        em: ({ children }) => <em style={{ color: "#AAA" }}>{children}</em>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-5" style={{ color: "#F0F0F0" }}>{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-4" style={{ color: "#F0F0F0" }}>{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-2 mt-3" style={{ color: "#F0F0F0" }}>{children}</h3>,
        ul: ({ children }) => <ul className="mb-3 ml-4 space-y-1 text-sm" style={{ listStyleType: "disc", color: "#D0D0D0" }}>{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 ml-4 space-y-1 text-sm" style={{ listStyleType: "decimal", color: "#D0D0D0" }}>{children}</ol>,
        li: ({ children }) => <li className="leading-7">{children}</li>,
        code: ({ children, className }) => {
          const block = className?.includes("language-");
          return block ? (
            <code className="block rounded-lg p-3 my-3 text-xs overflow-x-auto leading-5"
              style={{ background: "#111113", color: "#D0D0D0", border: "1px solid #2A2A2D", fontFamily: "var(--font-geist-mono)" }}>
              {children}
            </code>
          ) : (
            <code className="rounded px-1.5 py-0.5 text-xs"
              style={{ background: "#1A1A1D", color: "#FF6BA8", fontFamily: "var(--font-geist-mono)", border: "1px solid #2A2A2D" }}>
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="pl-3 my-2 text-sm" style={{ borderLeft: "3px solid #FF2D7A", color: "#888" }}>{children}</blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#FF6BA8", textDecoration: "underline" }}>{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ── Live timer — ticks every 100ms, zero lag ── */
function LiveTimer({ startPerf }: { startPerf: number }) {
  const [elapsed, setElapsed] = useState(() => performance.now() - startPerf);
  useEffect(() => {
    const id = setInterval(() => setElapsed(performance.now() - startPerf), 100);
    return () => clearInterval(id);
  }, [startPerf]);
  return <span className="text-xs" style={{ color: "#555" }}>{(elapsed / 1000).toFixed(1)}s…</span>;
}

/* ── Stats bar ── */
function StatsBar({ message, onDelete }: { message: Message; onDelete?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!message.content || message.isThinking) return null;

  function copy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-4 mt-4 pt-3" style={{ borderTop: "1px solid #222225" }}>
      {/* Left: stats */}
      <div className="flex items-center gap-4 flex-1">
        {message.responseTimeMs !== undefined && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#555" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
            {(message.responseTimeMs / 1000).toFixed(2)}s
          </span>
        )}
        {message.tokenCount !== undefined && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#555" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/></svg>
            {message.tokenCount} tokens
          </span>
        )}
        {message.tokPerSec !== undefined && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#555" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {message.tokPerSec} tok/s
          </span>
        )}
      </div>
      {/* Right: actions */}
      <div className="flex items-center gap-1">
        <button onClick={copy} title="Copy"
          className="flex items-center justify-center rounded w-7 h-7 transition-colors"
          style={{ color: "#555" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#F0F0F0")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}>
          {copied ? <IcoCheck /> : <IcoCopy />}
        </button>
        <button onClick={onDelete} title="Delete"
          className="flex items-center justify-center rounded w-7 h-7 transition-colors"
          style={{ color: "#555" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#FF6B6B")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}>
          <IcoTrash />
        </button>
      </div>
    </div>
  );
}

/* ── User message ── */
function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end px-1">
      <div className="max-w-lg rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm"
        style={{ background: "#2A2A2D", color: "#F0F0F0", lineHeight: 1.6 }}>
        {message.content}
      </div>
    </div>
  );
}

/* ── Assistant message ── */
function AssistantMessage({
  message, startPerfRef, onDelete,
}: { message: Message; startPerfRef: React.MutableRefObject<Map<string, number>>; onDelete: () => void }) {
  const startPerf = startPerfRef.current.get(message.id);

  return (
    <div className="flex flex-col px-1">
      {/* Model label */}
      <p className="text-xs mb-2 font-mono" style={{ color: "#555" }}>
        {message.model ?? "Mistral Large 4"}
      </p>

      {/* Thinking block */}
      {(message.isThinking || (message.thinkingSteps?.length ?? 0) > 0) && (
        <ThinkingBlock
          steps={message.thinkingSteps ?? []}
          isThinking={!!message.isThinking}
          durationMs={message.thinkingDuration ?? 0}
        />
      )}

      {/* Live elapsed while thinking */}
      {message.isThinking && startPerf !== undefined && (
        <LiveTimer startPerf={startPerf} />
      )}

      {/* Response */}
      {message.content && <MarkdownBody content={message.content} />}

      {/* Stats bar */}
      <StatsBar message={message} onDelete={onDelete} />
    </div>
  );
}

/* ── Message list ── */
export function MessageList({
  messages,
  onDeleteMessage,
}: {
  messages: Message[];
  onDeleteMessage?: (id: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const startPerfRef = useRef<Map<string, number>>(new Map());

  // Record start time the first time we see an isThinking message
  messages.forEach((m) => {
    if (m.role === "assistant" && m.isThinking && !startPerfRef.current.has(m.id)) {
      startPerfRef.current.set(m.id, performance.now() - (m.thinkingDuration ?? 0));
    }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 flex flex-col gap-8">
        {messages.map((m) =>
          m.role === "user" ? (
            <UserMessage key={m.id} message={m} />
          ) : (
            <AssistantMessage
              key={m.id}
              message={m}
              startPerfRef={startPerfRef}
              onDelete={() => onDeleteMessage?.(m.id)}
            />
          )
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
