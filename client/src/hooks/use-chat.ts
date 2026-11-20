"use client";

import { useState, useCallback, useRef } from "react";
import type { Message, FileAttachment } from "@/types/chat";
import {
  MOCK_THINKING_STEPS,
  getMockReply,
  THINKING_DURATION_MS,
  STEP_INTERVAL_MS,
} from "@/lib/mock-response";

interface UseChatOptions {
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  selectedModel?: string;
}

export function useChat({
  initialMessages = [],
  onMessagesChange,
  selectedModel = "Mistral Large 4",
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isActive, setIsActive] = useState(initialMessages.length > 0);
  const thinkingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const addAttachment = useCallback((file: File) => {
    setAttachments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type },
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      setIsActive(true);

      // Use performance.now() for high-resolution timing — no lag
      const startPerf = performance.now();

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
        isThinking: true,
        thinkingSteps: [],
        thinkingDuration: 0,
        model: selectedModel,
        // Stamp the absolute start so LiveTimer can compute elapsed independently
        responseTimeMs: undefined,
      };

      updateMessages((prev) => [...prev, userMsg, assistantMsg]);
      setAttachments([]);

      let stepIndex = 0;
      let elapsed = 0;

      thinkingTimer.current = setInterval(() => {
        elapsed += STEP_INTERVAL_MS;

        if (stepIndex < MOCK_THINKING_STEPS.length) {
          const step = MOCK_THINKING_STEPS[stepIndex];
          updateMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, thinkingSteps: [...(m.thinkingSteps ?? []), step], thinkingDuration: elapsed }
                : m
            )
          );
          stepIndex++;
        }

        if (elapsed >= THINKING_DURATION_MS) {
          clearInterval(thinkingTimer.current!);
          const reply = getMockReply(content);
          // Precise wall-clock elapsed in ms
          const responseTimeMs = performance.now() - startPerf;
          const tokenCount = reply.trim().split(/\s+/).length;
          const tokPerSec = parseFloat((tokenCount / (responseTimeMs / 1000)).toFixed(1));

          updateMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    isThinking: false,
                    content: reply,
                    thinkingDuration: elapsed,
                    responseTimeMs,
                    tokenCount,
                    tokPerSec,
                  }
                : m
            )
          );
        }
      }, STEP_INTERVAL_MS);
    },
    [attachments, updateMessages, selectedModel]
  );

  const loadMessages = useCallback((msgs: Message[]) => {
    if (thinkingTimer.current) clearInterval(thinkingTimer.current);
    setMessages(msgs);
    setAttachments([]);
    setIsActive(msgs.length > 0);
  }, []);

  const resetChat = useCallback(() => {
    if (thinkingTimer.current) clearInterval(thinkingTimer.current);
    setMessages([]);
    setAttachments([]);
    setIsActive(false);
  }, []);

  return {
    messages,
    attachments,
    isActive,
    sendMessage,
    addAttachment,
    removeAttachment,
    resetChat,
    loadMessages,
  };
}
