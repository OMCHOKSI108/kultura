"use client";

import { useRef, useState, useEffect } from "react";
import { Brain, Zap, Square, Globe } from "lucide-react";
import type { FileAttachment, ChatInferenceSettings } from "@/types/chat";
import { ChatSettingsPopover } from "./chat-settings-popover";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF2D7A" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface PromptComposerProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  onAddFile: (file: File) => void;
  onRemoveFile: (id: string) => void;
  attachments: FileAttachment[];
  disabled?: boolean;
  isGenerating?: boolean;
  isModelReady?: boolean;
  selectedModel?: string;
  settings?: ChatInferenceSettings;
  onUpdateSettings?: (newSettings: Partial<ChatInferenceSettings>) => void;
}

export function PromptComposer({
  onSend,
  onStop,
  onAddFile,
  onRemoveFile,
  attachments,
  disabled,
  isGenerating,
  isModelReady = true,
  selectedModel,
  settings,
  onUpdateSettings,
}: PromptComposerProps) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Global ESC key listener to abort generation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isGenerating && onStop) {
        e.preventDefault();
        onStop();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGenerating, onStop]);

  function handleSend() {
    if (!text.trim() || disabled || isGenerating) return;
    onSend(text.trim());
    setText("");
    if (textRef.current) textRef.current.style.height = "auto";
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit
    Array.from(files).forEach((f) => {
      if (f.size > MAX_SIZE) {
        alert(`File "${f.name}" exceeds the 10MB limit.`);
        return;
      }
      onAddFile(f);
    });
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  }

  const canSend = !!text.trim() && !disabled && !isGenerating;

  return (
    <div
      className="rounded-xl transition-colors flex flex-col"
      style={{
        background: dragging ? "#2A2A2A" : "#232325",
        border: `1px solid ${dragging ? "#FF2D7A55" : "#2E2E31"}`,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* File Attachments */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
              style={{ background: "#1A1A1A", border: "1px solid #2E2E31", color: "#E0E0E0" }}
            >
              {a.data && a.type.startsWith("image/") ? (
                <img src={a.data} alt={a.name} className="w-4 h-4 object-cover rounded" />
              ) : (
                <IconFile />
              )}
              <span className="max-w-[120px] truncate">{a.name}</span>
              <span style={{ color: "#555" }}>{formatBytes(a.size)}</span>
              <button onClick={() => onRemoveFile(a.id)} style={{ color: "#555" }}>
                <IconX />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea Input */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <textarea
          ref={textRef}
          value={text}
          onChange={autoResize}
          onKeyDown={handleKey}
          placeholder={
            isGenerating
              ? "Generating response... (Press Esc or click Stop to abort)"
              : selectedModel
              ? `Ask Kultura anything (${selectedModel})...`
              : "Ask Kultura anything..."
          }
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed"
          style={{ color: "#F0F0F0", caretColor: "#FF2D7A", minHeight: 28 }}
        />
      </div>

      {/* Bottom Controls Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/40">
        {/* Left Side: Attachment + Speed/Think Mode + Custom Settings */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* File Upload */}
          <button
            onClick={() => fileRef.current?.click()}
            type="button"
            aria-label="Attach file"
            style={{ color: "#777", flexShrink: 0 }}
            className="hover:text-zinc-200 transition p-1 rounded-md"
            title="Attach image or file for inference"
          >
            <IconPlus />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.txt,.pdf,.md,.json"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Quick Thinking / Fast Mode Toggle */}
          {settings && onUpdateSettings && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onUpdateSettings({ enable_thinking: !settings.enable_thinking })}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium transition-all ${
                  settings.enable_thinking
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-xs"
                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-xs"
                }`}
                title={
                  settings.enable_thinking
                    ? "Thinking Mode ON: Model performs reasoning before outputting answer"
                    : "⚡ Fast Mode ON: Thinking is bypassed for ultra-fast instant answers"
                }
              >
                {settings.enable_thinking ? (
                  <>
                    <Brain size={12} className="text-purple-400" />
                    <span>Think</span>
                  </>
                ) : (
                  <>
                    <Zap size={12} className="text-emerald-400" />
                    <span>⚡ Fast</span>
                  </>
                )}
              </button>

              {/* Reasoning Budget Selector (if thinking mode active) */}
              {settings.enable_thinking && (
                <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
                  {[
                    { label: "Full", value: null, title: "Uncapped Thinking (DeepSeek-R1 & Claude style)" },
                    { label: "1k", value: 1024, title: "Max 1024 thinking tokens" },
                    { label: "2k", value: 2048, title: "Max 2048 thinking tokens" },
                    { label: "4k", value: 4096, title: "Max 4096 thinking tokens" },
                  ].map((item) => {
                    const isSelected =
                      item.value === null
                        ? settings.reasoning_budget === null || settings.reasoning_budget === undefined
                        : settings.reasoning_budget === item.value;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => onUpdateSettings({ reasoning_budget: item.value })}
                        className={`px-1.5 py-0.5 rounded transition ${
                          isSelected
                            ? "bg-purple-600 text-white font-medium"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                        title={item.title}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Live Web Search Toggle */}
          {settings && onUpdateSettings && (
            <button
              type="button"
              onClick={() => onUpdateSettings({ web_search: !settings.web_search })}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium transition-all ${
                settings.web_search
                  ? "bg-sky-500/15 text-sky-300 border border-sky-500/40 shadow-xs"
                  : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent"
              }`}
              title={
                settings.web_search
                  ? "Live Web Search: Active (Grounded with real-time web results)"
                  : "Live Web Search: Off (Click to enable)"
              }
            >
              <Globe size={12} className={settings.web_search ? "text-sky-400" : "text-zinc-500"} />
              <span>Web</span>
              {settings.web_search && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              )}
            </button>
          )}

          {/* Chat Settings Popover */}
          {settings && onUpdateSettings && (
            <ChatSettingsPopover settings={settings} onUpdateSettings={onUpdateSettings} />
          )}
        </div>

        {/* Right Side: Stop Button or Send Button */}
        <div>
          {isGenerating ? (
            <button
              onClick={onStop}
              type="button"
              aria-label="Stop generating"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-950/50 transition-all cursor-pointer animate-pulse"
              title="Stop generating (Esc)"
            >
              <Square size={11} fill="currentColor" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              type="button"
              aria-label="Send message"
              className="flex items-center justify-center transition-all"
              style={{
                width: 30,
                height: 30,
                background: canSend ? "#F0F0F0" : "#2E2E31",
                color: canSend ? "#1A1A1A" : "#666",
                borderRadius: "50%",
                cursor: canSend ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              <IconArrowUp />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
