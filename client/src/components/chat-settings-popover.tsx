"use client";

import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, Sparkles, RotateCcw, X, Check, Brain, Zap } from "lucide-react";
import type { ChatInferenceSettings } from "@/types/chat";

export interface SystemPromptPreset {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature: number;
  repeatPenalty: number;
  maxTokens: number;
  enableThinking: boolean;
  reasoningBudget?: number | null;
}

export const SYSTEM_PROMPT_PRESETS: SystemPromptPreset[] = [
  {
    id: "default",
    name: "Standard",
    description: "Balanced, helpful, and direct assistance",
    systemPrompt: "You are Kultura, an expert local AI assistant. Be helpful, direct, and concise.",
    temperature: 0.7,
    repeatPenalty: 1.1,
    maxTokens: 2048,
    enableThinking: false,
    reasoningBudget: 0,
  },
  {
    id: "concise",
    name: "⚡ Ultra Fast",
    description: "Direct answers without conversational filler",
    systemPrompt: "Answer directly and concisely without conversational pleasantries. Provide the answer immediately.",
    temperature: 0.3,
    repeatPenalty: 1.15,
    maxTokens: 1024,
    enableThinking: false,
    reasoningBudget: 0,
  },
  {
    id: "engineer",
    name: "🛠️ Senior Dev",
    description: "Production-ready, strictly typed code and architecture",
    systemPrompt: "You are an expert principal software engineer. Provide robust, typed, production-ready solutions with clean architecture and error handling.",
    temperature: 0.4,
    repeatPenalty: 1.1,
    maxTokens: 4096,
    enableThinking: false,
    reasoningBudget: 0,
  },
  {
    id: "reasoner",
    name: "🧠 Deep Thinker",
    description: "Extended Thinking with DeepSeek & Claude anti-hallucination architecture",
    systemPrompt: "Analyze problems with high epistemic rigor. Ground deductions strictly in verified facts, maintain forward momentum without circular self-doubt, and synthesize a clear, substantiated answer.",
    temperature: 0.6,
    repeatPenalty: 1.1,
    maxTokens: 4096,
    enableThinking: true,
    reasoningBudget: null, // Full / Uncapped thinking
  },
  {
    id: "creative",
    name: "✨ Creative",
    description: "Expressive and evocative writing",
    systemPrompt: "You are an imaginative and expressive creative writer. Craft engaging, stylistically rich prose.",
    temperature: 0.9,
    repeatPenalty: 1.05,
    maxTokens: 4096,
    enableThinking: false,
    reasoningBudget: 0,
  },
];

interface ChatSettingsPopoverProps {
  settings: ChatInferenceSettings;
  onUpdateSettings: (newSettings: Partial<ChatInferenceSettings>) => void;
}

export function ChatSettingsPopover({ settings, onUpdateSettings }: ChatSettingsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Apply a preset
  function applyPreset(preset: SystemPromptPreset) {
    onUpdateSettings({
      system_prompt: preset.systemPrompt,
      temperature: preset.temperature,
      repeat_penalty: preset.repeatPenalty,
      max_tokens: preset.maxTokens,
      enable_thinking: preset.enableThinking,
      reasoning_budget: preset.reasoningBudget,
    });
  }

  function handleReset() {
    onUpdateSettings({
      system_prompt: "",
      temperature: 0.7,
      repeat_penalty: 1.1,
      max_tokens: 2048,
      enable_thinking: false,
      reasoning_budget: null,
    });
  }

  const isCustomized =
    Boolean(settings.system_prompt) ||
    settings.temperature !== 0.7 ||
    settings.repeat_penalty !== 1.1 ||
    settings.max_tokens !== 2048;

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Inference and prompt settings"
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
          isOpen || isCustomized
            ? "bg-pink-500/10 text-pink-400 border border-pink-500/30"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent"
        }`}
        title="Custom System Prompt & Inference Parameters"
      >
        <SlidersHorizontal size={13} />
        <span>Settings</span>
        {isCustomized && <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />}
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full mb-2 left-0 z-50 w-80 sm:w-96 rounded-xl border border-zinc-800 bg-[#1c1c1f] p-4 shadow-2xl backdrop-blur-md text-zinc-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-100"
          style={{ boxShadow: "0 10px 35px -5px rgba(0,0,0,0.7)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-pink-500" />
              <h3 className="text-xs font-semibold tracking-wide uppercase text-zinc-300">
                Inference & Prompt Controls
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleReset}
                title="Reset to defaults"
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
              >
                <RotateCcw size={12} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-400">Quick Presets</label>
            <div className="flex flex-wrap gap-1.5">
              {SYSTEM_PROMPT_PRESETS.map((preset) => {
                const isActive =
                  settings.system_prompt === preset.systemPrompt &&
                  settings.temperature === preset.temperature;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                      isActive
                        ? "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                        : "bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
                    }`}
                    title={preset.description}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* System Prompt Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-zinc-400">
                Custom System Prompt
              </label>
              {settings.system_prompt && (
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ system_prompt: "" })}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={settings.system_prompt || ""}
              onChange={(e) => onUpdateSettings({ system_prompt: e.target.value })}
              placeholder="e.g. You are an expert engineer. Keep code concise, safe, and strictly typed..."
              rows={3}
              className="w-full text-xs rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-pink-500/50 resize-none"
            />
          </div>

          {/* Parameters Sliders */}
          <div className="flex flex-col gap-3 pt-1 border-t border-zinc-800/60">
            {/* Temperature */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">Temperature</span>
                <span className="font-mono text-zinc-300">{settings.temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.5"
                step="0.05"
                value={settings.temperature}
                onChange={(e) => onUpdateSettings({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-pink-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-500">
                <span>0.0 (Strict / Code)</span>
                <span>0.7 (Balanced)</span>
                <span>1.5 (Creative)</span>
              </div>
            </div>

            {/* Repeat Penalty */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400" title="Prevents repetitive loops in llama.cpp">
                  Repeat Penalty
                </span>
                <span className="font-mono text-zinc-300">{settings.repeat_penalty.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="1.5"
                step="0.05"
                value={settings.repeat_penalty}
                onChange={(e) => onUpdateSettings({ repeat_penalty: parseFloat(e.target.value) })}
                className="w-full accent-pink-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-500">
                <span>1.0 (Off)</span>
                <span>1.1 (Recommended)</span>
                <span>1.5 (Strict)</span>
              </div>
            </div>

            {/* Max Completion Tokens */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">Max Tokens</span>
                <span className="font-mono text-zinc-300">{settings.max_tokens}</span>
              </div>
              <input
                type="range"
                min="256"
                max="4096"
                step="128"
                value={settings.max_tokens}
                onChange={(e) => onUpdateSettings({ max_tokens: parseInt(e.target.value, 10) })}
                className="w-full accent-pink-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
