"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

function Spinner() {
  return (
    <svg className="animate-spin w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function ThinkingMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2.5 last:mb-0 leading-relaxed text-xs text-gray-300">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-100">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-gray-400">{children}</em>,
        h1: ({ children }) => (
          <h1 className="text-sm font-bold mb-2 mt-3 text-gray-100 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xs font-bold mb-1.5 mt-2.5 text-gray-100 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-xs font-semibold mb-1 mt-2 text-gray-200 first:mt-0">{children}</h3>
        ),
        ul: ({ children }) => (
          <ul className="mb-2.5 ml-4 space-y-1 text-xs list-disc text-gray-300">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2.5 ml-4 space-y-1 text-xs list-decimal text-gray-300">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code
              className="block rounded-lg p-2.5 my-2 text-[11px] overflow-x-auto leading-5 font-mono"
              style={{ background: "#111113", color: "#D0D0D0", border: "1px solid #2A2A2D" }}
            >
              {children}
            </code>
          ) : (
            <code
              className="rounded px-1.5 py-0.5 text-[11px] font-mono"
              style={{ background: "#18181C", color: "#FF6BA8", border: "1px solid #2A2A2D" }}
            >
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="pl-3 my-2 text-xs border-l-2 border-indigo-400/60 text-gray-400 italic">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-pink-400 underline">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface ThinkingBlockProps {
  steps?: ThinkingStep[];
  thinkingText?: string;
  isThinking: boolean;
  durationMs: number;
}

export function ThinkingBlock({ steps = [], thinkingText = "", isThinking, durationMs }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [liveDuration, setLiveDuration] = useState(durationMs);
  const startRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isThinking) {
      if (!startRef.current) {
        startRef.current = Date.now() - durationMs;
      }
      const timer = setInterval(() => {
        if (startRef.current) {
          setLiveDuration(Date.now() - startRef.current);
        }
      }, 100);
      return () => clearInterval(timer);
    } else {
      startRef.current = null;
      if (durationMs > 0) {
        setLiveDuration(durationMs);
      }
    }
  }, [isThinking, durationMs]);

  // Auto-scroll while streaming thinking only if scrolled near bottom
  useEffect(() => {
    if (isThinking && contentRef.current) {
      const el = contentRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [isThinking, thinkingText]);

  const hasContent = steps.length > 0 || (thinkingText && thinkingText.trim().length > 0);
  if (!hasContent && !isThinking) return null;

  const displayMs = durationMs > 0 ? durationMs : liveDuration;
  const seconds = (displayMs / 1000).toFixed(1);
  const label = isThinking ? `Thinking... ${seconds}s` : `Thought for ${seconds}s`;

  return (
    <div className="rounded-xl overflow-hidden mb-4 border border-[#2E2E33] bg-[#19191D] transition-all shadow-xs">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left transition-colors hover:bg-[#232328]"
      >
        <span className="text-gray-400">{expanded ? <ChevronDown /> : <ChevronRight />}</span>
        {isThinking && <Spinner />}
        <span className={`text-xs font-mono font-medium ${isThinking ? "text-indigo-400" : "text-gray-400"}`}>
          {label}
        </span>
      </button>

      {expanded && (
        <div
          ref={contentRef}
          className="px-4 py-3 max-h-80 overflow-y-auto border-t border-[#25252A] bg-[#161619]"
        >
          {thinkingText ? (
            <ThinkingMarkdown content={thinkingText} />
          ) : (
            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <div key={step.id} className="flex gap-2 text-xs leading-5 text-gray-300">
                  <span className="text-indigo-400 font-mono font-semibold shrink-0">{i + 1}.</span>
                  <div className="flex-1">
                    <ThinkingMarkdown content={step.text} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
