"use client";

import { useState, useCallback } from "react";
import { useChat } from "@/hooks/use-chat";
import { SidebarRail } from "@/components/sidebar-rail";
import { WelcomeScreen } from "@/components/welcome-screen";
import { MessageList } from "@/components/message-list";
import { PromptComposer } from "@/components/prompt-composer";
import { getMockSessions } from "@/lib/mock-response";
import type { ChatSession, Message } from "@/types/chat";

const INITIAL_SESSIONS = getMockSessions();

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("Mistral Large 4");

  const { messages, attachments, isActive, sendMessage, addAttachment, removeAttachment, resetChat, loadMessages } =
    useChat({
      selectedModel,
      onMessagesChange: useCallback((msgs: Message[]) => {
        if (!msgs.length) return;
        setActiveSessionId((sid) => {
          if (sid) {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sid
                  ? { ...s, messages: msgs, preview: msgs.find((m) => m.role === "user")?.content.slice(0, 60) ?? s.preview }
                  : s
              )
            );
          }
          return sid;
        });
      }, []),
    });

  function openSession(session: ChatSession) {
    setActiveSessionId(session.id);
    loadMessages(session.messages);
  }

  function handleNewChat() {
    setActiveSessionId(null);
    resetChat();
  }

  function handleSendMessage(content: string) {
    if (!activeSessionId) {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        title: content.slice(0, 40),
        preview: content.slice(0, 60),
        timestamp: new Date(),
        messages: [],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    }
    sendMessage(content);
  }

  function deleteSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) handleNewChat();
  }

  function deleteMessage(id: string) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, messages: s.messages.filter((m) => m.id !== id) }
          : s
      )
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "#111113", overflow: "hidden" }}>
      <SidebarRail
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={handleNewChat}
        onOpenSession={openSession}
        onDeleteSession={deleteSession}
      />

      <div className="flex-1 min-w-0 flex flex-col p-3 pl-0">
        <div
          className="flex-1 flex flex-col overflow-hidden rounded-2xl"
          style={{ background: "#1C1C1F", border: "1px solid #2A2A2D" }}
        >
          {!isActive ? (
            <WelcomeScreen
              onSend={handleSendMessage}
              onAddFile={addAttachment}
              onRemoveFile={removeAttachment}
              attachments={attachments}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          ) : (
            <>
              <MessageList messages={messages} onDeleteMessage={deleteMessage} />
              <div className="w-full px-4 pb-5">
                <div className="mx-auto w-full max-w-2xl">
                  <PromptComposer
                    onSend={handleSendMessage}
                    onAddFile={addAttachment}
                    onRemoveFile={removeAttachment}
                    attachments={attachments}
                    disabled={messages.some((m) => m.isThinking)}
                    selectedModel={selectedModel}
                    onModelChange={setSelectedModel}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
