"use client";

import { useRef, useState, useEffect } from "react";
import type { FileAttachment } from "@/types/chat";
import { MistralInline } from "./brand-logo";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconPlus() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function IconArrowUp() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
}
function IconFile() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF2D7A" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function IconX() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function IconChevronDown() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function IconCheck() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
}

const MODELS = [
  { id: "mistral-large-4",  label: "Mistral Large 4",  tag: "Latest" },
  { id: "mistral-large-2",  label: "Mistral Large 2",  tag: null },
  { id: "mistral-small-3",  label: "Mistral Small 3",  tag: "Fast" },
  { id: "codestral-2501",   label: "Codestral 2501",   tag: "Code" },
  { id: "mistral-nemo",     label: "Mistral Nemo",     tag: null },
];

interface ModelSelectorProps {
  selected: string;
  onChange: (label: string) => void;
}

function ModelSelector({ selected, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.label === selected) ?? MODELS[0];

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors"
        style={{
          color: "#AAA",
          background: open ? "#2A2A2D" : "transparent",
          border: "1px solid " + (open ? "#3A3A3D" : "transparent"),
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.color = "#F0F0F0"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = "#AAA"; }}
      >
        <MistralInline size={14} />
        <span>{current.label}</span>
        <span style={{ color: "#666" }}><IconChevronDown /></span>
      </button>

      {open && (
        <div className="absolute z-50 rounded-xl overflow-hidden"
          style={{ bottom: "calc(100% + 8px)", left: 0, minWidth: 200, background: "#1E1E21", border: "1px solid #2E2E32", boxShadow: "0 8px 32px #00000077" }}>
          <div className="px-3 py-2" style={{ borderBottom: "1px solid #2E2E32" }}>
            <p className="text-xs font-medium" style={{ color: "#555" }}>Select model</p>
          </div>
          {MODELS.map((m) => (
            <button key={m.id}
              onClick={() => { onChange(m.label); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-sm transition-colors"
              style={{ color: current.id === m.id ? "#F0F0F0" : "#AAA" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#252528")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <MistralInline size={16} />
              <span className="flex-1">{m.label}</span>
              {m.tag && (
                <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: "#2A2A2D", color: "#666", fontSize: 10 }}>{m.tag}</span>
              )}
              {current.id === m.id && <span style={{ color: "#FF2D7A" }}><IconCheck /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PromptComposerProps {
  onSend: (content: string) => void;
  onAddFile: (file: File) => void;
  onRemoveFile: (id: string) => void;
  attachments: FileAttachment[];
  disabled?: boolean;
  selectedModel: string;
  onModelChange: (m: string) => void;
}

export function PromptComposer({
  onSend, onAddFile, onRemoveFile, attachments, disabled, selectedModel, onModelChange,
}: PromptComposerProps) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
    if (textRef.current) textRef.current.style.height = "auto";
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(onAddFile);
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

  const canSend = !!text.trim() && !disabled;

  return (
    <div
      className="rounded-xl transition-colors"
      style={{ background: dragging ? "#2A2A2A" : "#232325", border: `1px solid ${dragging ? "#FF2D7A55" : "#2E2E31"}` }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
              style={{ background: "#1A1A1A", border: "1px solid #2E2E31", color: "#E0E0E0" }}>
              <IconFile />
              <span className="max-w-[120px] truncate">{a.name}</span>
              <span style={{ color: "#555" }}>{formatBytes(a.size)}</span>
              <button onClick={() => onRemoveFile(a.id)} style={{ color: "#555" }}><IconX /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* + file attach — left end */}
        <button onClick={() => fileRef.current?.click()} style={{ color: "#555", flexShrink: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#F0F0F0")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
          title="Attach file">
          <IconPlus />
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

        <textarea
          ref={textRef}
          value={text}
          onChange={autoResize}
          onKeyDown={handleKey}
          placeholder="Ask Kultura anything..."
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed"
          style={{ color: "#F0F0F0", caretColor: "#FF2D7A", minHeight: 24 }}
        />

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ModelSelector selected={selectedModel} onChange={onModelChange} />

          {/* ── Circle send button ── */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex items-center justify-center transition-opacity"
            style={{
              width: 30, height: 30,
              background: "#F0F0F0",
              color: "#1A1A1A",
              borderRadius: "50%",
              opacity: canSend ? 1 : 0.3,
              flexShrink: 0,
            }}
          >
            <IconArrowUp />
          </button>
        </div>
      </div>
    </div>
  );
}
