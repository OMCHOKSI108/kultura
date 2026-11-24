"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Globe, ChevronDown, ExternalLink } from "lucide-react";
import type { Message, WebSource } from "@/types/chat";
import { ThinkingBlock } from "./thinking-block";
import { ModelBrandIcon } from "./model-brand-icon";

function IcoCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IcoCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IcoTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function preprocessCitations(text: string, sources?: WebSource[]): string {
  if (!sources || sources.length === 0 || !text) return text;
  // Protect code blocks and inline code from citation replacement (e.g. array[1])
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`")) return part;
      return part.replace(/\[(\d+)\](?!\()/g, (match, numStr) => {
        const idx = parseInt(numStr, 10);
        const exists = sources.some((s) => s.index === idx);
        return exists ? `[${numStr}](citation://${idx})` : match;
      });
    })
    .join("");
}

function MarkdownBody({ content, sources }: { content: string; sources?: WebSource[] }) {
  const processedContent = useMemo(() => preprocessCitations(content, sources), [content, sources]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-7 text-sm text-[#D0D0D0]">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[#F0F0F0]">{children}</strong>,
        em: ({ children }) => <em className="text-[#AAA]">{children}</em>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-5 text-[#F0F0F0]">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-4 text-[#F0F0F0]">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-2 mt-3 text-[#F0F0F0]">{children}</h3>,
        ul: ({ children }) => <ul className="mb-3 ml-4 space-y-1 text-sm list-disc text-[#D0D0D0]">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 ml-4 space-y-1 text-sm list-decimal text-[#D0D0D0]">{children}</ol>,
        li: ({ children }) => <li className="leading-7">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code
              className="block rounded-lg p-3 my-3 text-xs overflow-x-auto leading-5 font-mono"
              style={{ background: "#111113", color: "#D0D0D0", border: "1px solid #2A2A2D" }}
            >
              {children}
            </code>
          ) : (
            <code
              className="rounded px-1.5 py-0.5 text-xs font-mono"
              style={{ background: "#1A1A1D", color: "#FF6BA8", border: "1px solid #2A2A2D" }}
            >
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="pl-3 my-2 text-sm border-l-2 border-[#FF2D7A] text-[#888]">{children}</blockquote>
        ),
        a: ({ href, children }) => {
          if (href?.startsWith("citation://")) {
            const idx = parseInt(href.replace("citation://", ""), 10);
            const source = sources?.find((s) => s.index === idx);
            const targetUrl = source?.url || "#";
            return (
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={source ? `${source.title} (${source.domain})` : `Source [${idx}]`}
                className="inline-flex items-center align-super text-[10px] font-mono font-medium px-1.5 py-0.5 mx-0.5 rounded bg-zinc-850 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-zinc-750 hover:border-sky-500/40 no-underline transition shadow-2xs"
              >
                [{idx}]
              </a>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#FF6BA8] underline">
              {children}
            </a>
          );
        },
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}

function SourcesStrip({ sources }: { sources: WebSource[] }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 backdrop-blur-xs">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <Globe size={13} className="text-sky-400" />
          <span>Grounding Sources</span>
          <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] text-zinc-400 font-mono">
            {sources.length}
          </span>
        </div>
        <button
          type="button"
          className="text-zinc-500 hover:text-zinc-300 p-0.5 transition"
          aria-label="Toggle sources"
        >
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="flex flex-wrap gap-2 pt-2.5 mt-2 border-t border-zinc-800/60">
          {sources.map((src) => (
            <a
              key={src.index}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition group max-w-[280px]"
              title={`${src.title}\n\n${src.snippet}`}
            >
              <span className="font-mono text-[10px] text-sky-400 font-bold shrink-0">[{src.index}]</span>
              <img
                src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=16`}
                alt=""
                className="w-3.5 h-3.5 rounded-xs shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
              <span className="truncate text-[11px] group-hover:underline">{src.title || src.domain}</span>
              <span className="text-[10px] text-zinc-500 shrink-0">· {src.domain}</span>
              <ExternalLink size={10} className="text-zinc-500 group-hover:text-zinc-300 shrink-0 ml-auto" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchingWebIndicator() {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-sky-950/40 border border-sky-800/40 text-xs font-mono text-sky-300 w-fit mb-3 animate-pulse">
      <Globe size={13} className="animate-spin text-sky-400" />
      <span>Searching the web for latest context...</span>
    </div>
  );
}

function GeneratingIndicator({ createdAt }: { createdAt?: string }) {
  const [elapsed, setElapsed] = useState("0.1s");

  useEffect(() => {
    const start = createdAt ? new Date(createdAt).getTime() : Date.now();
    const timer = setInterval(() => {
      const sec = Math.max(0.1, (Date.now() - start) / 1000).toFixed(1);
      setElapsed(`${sec}s`);
    }, 100);
    return () => clearInterval(timer);
  }, [createdAt]);

  return (
    <div className="flex items-center gap-2.5 py-2 px-3 rounded-xl bg-[#1C1C20] border border-[#2E2E33] text-xs font-mono text-gray-300 w-fit mb-3">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
      </span>
      <span className="text-gray-300 font-medium">Evaluating context & generating...</span>
      <span className="text-gray-500 font-mono">({elapsed})</span>
    </div>
  );
}

function StatsBar({ message, onDelete }: { message: Message; onDelete?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState("0.0s");

  useEffect(() => {
    if (message.isStreaming && message.createdAt) {
      const start = new Date(message.createdAt).getTime();
      const timer = setInterval(() => {
        const sec = Math.max(0.1, (Date.now() - start) / 1000).toFixed(1);
        setLiveElapsed(`${sec}s`);
      }, 100);
      return () => clearInterval(timer);
    }
  }, [message.isStreaming, message.createdAt]);

  if (!message.content && !message.isStreaming) return null;
  if (!message.content && message.isStreaming) return null;

  function copy() {
    navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div
      className="flex items-center justify-between gap-4 mt-3 pt-2 text-[11px] font-mono text-gray-400"
      style={{ borderTop: "1px solid #222225" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {message.isStreaming && (
          <span className="flex items-center gap-1.5 text-indigo-400">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
            <span>streaming</span>
          </span>
        )}

        {message.tokPerSec !== undefined && message.tokPerSec > 0 && (
          <span className="text-emerald-400 font-semibold">{message.tokPerSec} tok/s</span>
        )}

        {message.ttftMs !== undefined && message.ttftMs > 0 && (
          <span className="text-gray-400">TTFT: {message.ttftMs}ms</span>
        )}

        {message.thinkingTokens !== undefined && message.thinkingTokens > 0 && (
          <span className="text-gray-400">Think: {message.thinkingTokens} tok</span>
        )}

        {message.tokenCount !== undefined && message.tokenCount > 0 && (
          <span className="text-gray-300">Out: {message.tokenCount} tok</span>
        )}

        {message.isStreaming ? (
          <span className="text-gray-400 font-medium">{liveElapsed}</span>
        ) : (
          message.responseTimeMs !== undefined &&
          message.responseTimeMs > 0 && (
            <span className="text-gray-400">{(message.responseTimeMs / 1000).toFixed(2)}s</span>
          )
        )}
      </div>

      <div className="flex items-center gap-1">
        <button onClick={copy} title="Copy" className="p-1 rounded text-gray-500 hover:text-white transition-colors">
          {copied ? <IcoCheck /> : <IcoCopy />}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors"
          >
            <IcoTrash />
          </button>
        )}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex flex-col items-end px-1 gap-2">
      {message.attachments && message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-end">
          {message.attachments.map((att) => (
            <div key={att.id} className="rounded-lg overflow-hidden border border-[#3A3A3E]">
              {att.data && att.type.startsWith("image/") ? (
                <img src={att.data} alt={att.name} className="max-w-[200px] max-h-[140px] object-cover" />
              ) : (
                <div className="px-2.5 py-1 text-xs bg-[#222] text-gray-300">{att.name}</div>
              )}
            </div>
          ))}
        </div>
      )}
      <div
        className="max-w-lg rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm"
        style={{ background: "#2A2A2D", color: "#F0F0F0", lineHeight: 1.6 }}
      >
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onDelete }: { message: Message; onDelete?: () => void }) {
  return (
    <div className="flex flex-col px-1">
      {/* Model & Provider Badge Header */}
      <div className="flex items-center gap-2 mb-2 font-mono text-[11px] text-zinc-400">
        <div className="w-4 h-4 flex items-center justify-center">
          <ModelBrandIcon modelId={message.model || ""} size={14} />
        </div>
        <span>
          {message.provider ? `${message.provider} · ` : ""}
          <strong className="text-zinc-300 font-semibold">{message.model || "Local Model"}</strong>
        </span>
      </div>

      {/* Web Searching Animated Indicator */}
      {message.isSearching && <SearchingWebIndicator />}

      {/* Fallback Notice if Web Search Failed */}
      {message.searchNotice && (
        <div className="text-[11px] font-mono text-amber-400/80 mb-2">
          ⚠️ {message.searchNotice}
        </div>
      )}

      {/* Grounding Sources Strip */}
      {message.sources && message.sources.length > 0 && <SourcesStrip sources={message.sources} />}

      {/* Initial Generation Pulse */}
      {message.isStreaming && !message.content && !message.thinkingContent && !message.isSearching && (
        <GeneratingIndicator createdAt={message.createdAt} />
      )}

      {/* Thinking / Reasoning Block */}
      {(message.isThinking || message.thinkingContent || (message.thinkingSteps?.length ?? 0) > 0) && (
        <ThinkingBlock
          steps={message.thinkingSteps || []}
          thinkingText={message.thinkingContent}
          isThinking={!!message.isThinking}
          durationMs={message.thinkingDuration || 0}
        />
      )}

      {/* Markdown Content with Interactive Citations */}
      {message.content && <MarkdownBody content={message.content} sources={message.sources} />}

      <StatsBar message={message} onDelete={onDelete} />
    </div>
  );
}

export function MessageList({
  messages,
  onDeleteMessage,
}: {
  messages: Message[];
  onDeleteMessage?: (id: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isNearBottom =
      typeof window !== "undefined"
        ? window.innerHeight + window.scrollY >= document.body.offsetHeight - 150
        : true;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Compute model transition dividers
  const renderedItems = useMemo(() => {
    const items: React.ReactNode[] = [];
    let lastAssistant: { provider?: string; model?: string } | null = null;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "assistant") {
        // Detect if provider or model changed compared to prior assistant turn
        if (
          lastAssistant !== null &&
          (msg.provider !== lastAssistant.provider || msg.model !== lastAssistant.model) &&
          (msg.provider || msg.model)
        ) {
          items.push(
            <div key={`divider-${msg.id}`} className="flex items-center justify-center my-4">
              <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-zinc-400 shadow-xs backdrop-blur-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></span>
                <span>
                  Switched to <strong className="text-zinc-200">{msg.provider || "local"}</strong> ·{" "}
                  <strong className="text-zinc-200">{msg.model}</strong>{" "}
                  <span className="text-zinc-500">— context preserved</span>
                </span>
              </div>
            </div>
          );
        }
        lastAssistant = { provider: msg.provider, model: msg.model };

        items.push(
          <AssistantMessage
            key={msg.id}
            message={msg}
            onDelete={() => onDeleteMessage?.(msg.id)}
          />
        );
      } else {
        items.push(<UserMessage key={msg.id} message={msg} />);
      }
    }

    return items;
  }, [messages, onDeleteMessage]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 pt-8 pb-36 flex flex-col gap-6">
        {renderedItems}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
