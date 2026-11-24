"use client";

import { useState, useCallback, useRef } from "react";
import type { Message, FileAttachment, ChatInferenceSettings } from "@/types/chat";
import { deleteMessageApi } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8000";

export const DEFAULT_INFERENCE_SETTINGS: ChatInferenceSettings = {
  system_prompt: "",
  enable_thinking: false, // Default to Fast mode to avoid long thinking loops on simple prompts
  reasoning_budget: null, // null = Full / Uncapped thinking (DeepSeek-R1 & Claude style)
  temperature: 0.7,
  repeat_penalty: 1.1,
  max_tokens: 2048,
  web_search: false,
};

interface UseChatOptions {
  sessionId?: string | null;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  selectedProvider?: string;
  selectedModel?: string;
  onSessionCreated?: (newSessionId: string) => void;
}

export function useChat({
  sessionId,
  initialMessages = [],
  onMessagesChange,
  selectedProvider = "ollama",
  selectedModel = "qwen3.5:4b",
  onSessionCreated,
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isActive, setIsActive] = useState(initialMessages.length > 0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState<ChatInferenceSettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("kultura_inference_settings");
        if (stored) {
          return { ...DEFAULT_INFERENCE_SETTINGS, ...JSON.parse(stored) };
        }
      } catch {}
    }
    return DEFAULT_INFERENCE_SETTINGS;
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        onMessagesChange?.(next);
        return next;
      });
    },
    [onMessagesChange]
  );

  const updateSettings = useCallback((newSettings: Partial<ChatInferenceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...newSettings };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("kultura_inference_settings", JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, []);

  const stopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    updateMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              isStreaming: false,
              isThinking: false,
              isSearching: false,
              content: m.content ? m.content : "*[Generation stopped]*",
            }
          : m
      )
    );
  }, [updateMessages]);

  const addAttachment = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      setAttachments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          data: base64Data,
        },
      ]);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isGenerating) return;
      setIsActive(true);
      setIsGenerating(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        attachments: attachments.length > 0 ? [...attachments] : undefined,
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        thinkingContent: "",
        isThinking: false,
        isStreaming: true,
        isSearching: settings.web_search ?? false,
        sources: [],
        thinkingDuration: 0,
        provider: selectedProvider,
        model: selectedModel,
        createdAt: new Date().toISOString(),
      };

      const updatedHistory = [...messages, userMsg];
      updateMessages(() => [...updatedHistory, assistantMsg]);
      setAttachments([]);

      try {
        abortControllerRef.current = new AbortController();
        const payload = {
          session_id: sessionId || undefined,
          provider: selectedProvider,
          model: selectedModel,
          system_prompt: settings.system_prompt?.trim() || undefined,
          enable_thinking: settings.enable_thinking,
          reasoning_budget: settings.enable_thinking ? (settings.reasoning_budget ?? null) : 0,
          temperature: settings.temperature,
          repeat_penalty: settings.repeat_penalty,
          max_tokens: settings.enable_thinking
            ? Math.max(settings.max_tokens || 4096, 4096)
            : settings.max_tokens,
          web_search: settings.web_search ?? false,
          messages: updatedHistory.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments,
          })),
        };

        const res = await fetch(`${API_BASE}/api/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Inference error (${res.status}): ${res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const evt of events) {
            const lines = evt.split("\n");
            let eventType = "message";
            let dataStr = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.replace("event: ", "").trim();
              } else if (line.startsWith("data: ")) {
                dataStr = line.replace("data: ", "").trim();
              }
            }

            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (eventType === "status") {
                if (parsed.stage === "searching") {
                  updateMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, isSearching: true } : m))
                  );
                } else if (parsed.stage === "search_fallback") {
                  updateMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, isSearching: false, searchNotice: parsed.message }
                        : m
                    )
                  );
                } else if (parsed.provider || parsed.model) {
                  updateMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            provider: parsed.provider || m.provider,
                            model: parsed.model || m.model,
                          }
                        : m
                    )
                  );
                }
              } else if (eventType === "sources") {
                updateMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, sources: parsed, isSearching: false } : m
                  )
                );
              } else if (eventType === "thinking") {
                updateMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          isThinking: true,
                          isSearching: false,
                          thinkingContent: (m.thinkingContent || "") + (parsed.chunk || ""),
                          thinkingDuration: parsed.duration_ms || m.thinkingDuration,
                          thinkingTokens: parsed.metrics?.thinking_tokens ?? m.thinkingTokens,
                          tokPerSec: parsed.metrics?.tokens_per_sec ?? m.tokPerSec,
                          ttftMs: parsed.metrics?.ttft_ms ?? m.ttftMs,
                        }
                      : m
                  )
                );
              } else if (eventType === "content") {
                updateMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          isThinking: false,
                          isSearching: false,
                          content: m.content + (parsed.chunk || ""),
                          tokenCount: parsed.metrics?.completion_tokens ?? m.tokenCount,
                          tokPerSec: parsed.metrics?.tokens_per_sec ?? m.tokPerSec,
                          ttftMs: parsed.metrics?.ttft_ms ?? m.ttftMs,
                        }
                      : m
                  )
                );
              } else if (eventType === "metrics") {
                updateMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          tokenCount: parsed.completion_tokens,
                          thinkingTokens: parsed.thinking_tokens,
                          tokPerSec: parsed.tokens_per_sec,
                          ttftMs: parsed.ttft_ms,
                          responseTimeMs: parsed.total_duration_ms,
                        }
                      : m
                  )
                );
              } else if (eventType === "done") {
                if (parsed.session_id && onSessionCreated && !sessionId) {
                  onSessionCreated(parsed.session_id);
                }
                updateMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, isThinking: false, isStreaming: false, isSearching: false }
                      : m
                  )
                );
              }
            } catch {}
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          updateMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    isThinking: false,
                    isStreaming: false,
                    isSearching: false,
                    content: m.content || "*[Generation stopped]*",
                  }
                : m
            )
          );
        } else {
          updateMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    isThinking: false,
                    isStreaming: false,
                    isSearching: false,
                    content: m.content + `\n\n*[Error: ${err?.message || "Inference failed"}]*`,
                  }
                : m
            )
          );
        }
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
        updateMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.isStreaming
              ? { ...m, isStreaming: false, isThinking: false, isSearching: false }
              : m
          )
        );
      }
    },
    [
      messages,
      attachments,
      isGenerating,
      selectedProvider,
      selectedModel,
      sessionId,
      settings,
      updateMessages,
      onSessionCreated,
    ]
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      updateMessages((prev) => prev.filter((m) => m.id !== id));
      await deleteMessageApi(id);
    },
    [updateMessages]
  );

  const loadMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    setAttachments([]);
    setIsActive(msgs.length > 0);
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
    setAttachments([]);
    setIsActive(false);
  }, []);

  return {
    messages,
    attachments,
    isActive,
    isGenerating,
    settings,
    updateSettings,
    stopGenerating,
    sendMessage,
    deleteMessage,
    addAttachment,
    removeAttachment,
    resetChat,
    loadMessages,
  };
}
