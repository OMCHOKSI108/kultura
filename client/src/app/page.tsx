"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@/hooks/use-chat";
import { SidebarRail } from "@/components/sidebar-rail";
import { WelcomeScreen } from "@/components/welcome-screen";
import { MessageList } from "@/components/message-list";
import { PromptComposer } from "@/components/prompt-composer";
import { ProviderModelSelector } from "@/components/provider-model-selector";
import { ModelHubView } from "@/components/model-hub-view";
import { fetchSessions, fetchSessionMessages, deleteSessionApi, subscribeToDownloadsStream } from "@/lib/api";
import type { ChatSession, Message } from "@/types/chat";

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("ollama");
  const [selectedModel, setSelectedModel] = useState("qwen3.5:4b");
  const [isModelReady, setIsModelReady] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "hub">("chat");
  const [hubPreselectedProvider, setHubPreselectedProvider] = useState("ollama");
  const [activeDownloadsCount, setActiveDownloadsCount] = useState(0);
  const [modelRefreshKey, setModelRefreshKey] = useState(0);

  const {
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
  } = useChat({
    sessionId: activeSessionId,
    selectedProvider,
    selectedModel,
    onSessionCreated: (newId: string) => {
      setActiveSessionId(newId);
      loadRemoteSessions();
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("session", newId);
        window.history.pushState({}, "", url.toString());
      }
    },
    onMessagesChange: useCallback((msgs: Message[]) => {
      if (!msgs.length) return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: msgs,
                preview: msgs.find((m) => m.role === "user")?.content.slice(0, 60) ?? s.preview,
              }
            : s
        )
      );
    }, [activeSessionId]),
  });

  const loadRemoteSessions = useCallback(async () => {
    const list = await fetchSessions();
    if (list.length > 0) {
      setSessions(list);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const list = await fetchSessions();
      setSessions(list);

      // Check if URL explicitly specifies a session (?session=...)
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const urlSessionId = params.get("session");
        if (urlSessionId) {
          const found = list.find((s) => s.id === urlSessionId);
          if (found) {
            setActiveSessionId(urlSessionId);
            const msgs = await fetchSessionMessages(urlSessionId);
            loadMessages(msgs);
            return;
          }
        }
      }

      // Default on fresh load / refresh: clean New Chat / Welcome screen
      setActiveSessionId(null);
      resetChat();
    }
    init();
  }, [loadMessages, resetChat]);

  useEffect(() => {
    const unsub = subscribeToDownloadsStream((items) => {
      const active = items.filter((d) => d.status === "downloading" || d.status === "pending");
      setActiveDownloadsCount(active.length);
    });
    return () => unsub();
  }, []);

  const handleModelDownloaded = useCallback(() => {
    setModelRefreshKey((prev) => prev + 1);
  }, []);

  const handleOpenHub = useCallback((prov?: string) => {
    if (prov) setHubPreselectedProvider(prov);
    setActiveView("hub");
  }, []);

  async function openSession(session: ChatSession) {
    setActiveView("chat");
    setActiveSessionId(session.id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("session", session.id);
      window.history.pushState({}, "", url.toString());
    }
    const msgs = await fetchSessionMessages(session.id);
    loadMessages(msgs);
  }

  function handleNewChat() {
    setActiveSessionId(null);
    resetChat();
    setActiveView("chat");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("session");
      window.history.pushState({}, "", url.pathname);
    }
  }

  async function handleDeleteSession(id: string) {
    await deleteSessionApi(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) handleNewChat();
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "#171719" }}>
      {/* Resizable Sidebar Rail */}
      <SidebarRail
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={handleNewChat}
        onOpenSession={openSession}
        onDeleteSession={handleDeleteSession}
        activeView={activeView}
        onSelectView={(v) => setActiveView(v)}
        activeDownloadsCount={activeDownloadsCount}
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Provider & Model Bar */}
        <ProviderModelSelector
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          onSelectProvider={setSelectedProvider}
          onSelectModel={setSelectedModel}
          isModelReady={isModelReady}
          setIsModelReady={setIsModelReady}
          onOpenHub={handleOpenHub}
          refreshKey={modelRefreshKey}
        />

        {/* View Switcher: Model Hub vs Chat Message Feed / Welcome Screen */}
        {activeView === "hub" ? (
          <ModelHubView
            initialProvider={hubPreselectedProvider || selectedProvider}
            onModelDownloaded={handleModelDownloaded}
            onClose={() => setActiveView("chat")}
          />
        ) : isActive ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <MessageList messages={messages} onDeleteMessage={deleteMessage} />
            <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-2">
              <PromptComposer
                onSend={sendMessage}
                onStop={stopGenerating}
                onAddFile={addAttachment}
                onRemoveFile={removeAttachment}
                attachments={attachments}
                disabled={!selectedModel}
                isGenerating={isGenerating}
                isModelReady={true}
                selectedModel={selectedModel}
                settings={settings}
                onUpdateSettings={updateSettings}
              />
            </div>
          </div>
        ) : (
          <WelcomeScreen
            onSend={sendMessage}
            onStop={stopGenerating}
            onAddFile={addAttachment}
            onRemoveFile={removeAttachment}
            attachments={attachments}
            disabled={!selectedModel}
            isGenerating={isGenerating}
            isModelReady={true}
            selectedModel={selectedModel}
            settings={settings}
            onUpdateSettings={updateSettings}
          />
        )}
      </div>
    </div>
  );
}
