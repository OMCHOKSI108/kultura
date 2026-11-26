"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@/hooks/use-chat";
import { SidebarRail } from "@/components/sidebar-rail";
import { WelcomeScreen } from "@/components/welcome-screen";
import { MessageList } from "@/components/message-list";
import { PromptComposer } from "@/components/prompt-composer";
import { ProviderModelSelector } from "@/components/provider-model-selector";
import { ModelHubView } from "@/components/model-hub-view";
import { UsersManagementView } from "@/components/users-management-view";
import { ObservabilityView } from "@/components/observability-view";
import { UserSettingsView } from "@/components/user-settings-view";
import { AuthModal } from "@/components/auth-modal";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { AuthorizationProvider, useAuthorization } from "@/context/authorization-context";
import { PermissionGate, AccessDeniedView } from "@/components/permission-gate";
import { fetchSessions, fetchSessionMessages, deleteSessionApi, subscribeToDownloadsStream } from "@/lib/api";
import type { ChatSession, Message } from "@/types/chat";

function HomeContent() {
  const { user, loading, refreshUser } = useAuth();
  const { can } = useAuthorization();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("ollama");
  const [selectedModel, setSelectedModel] = useState("qwen3.5:4b");
  const [isModelReady, setIsModelReady] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "hub" | "users" | "observability" | "settings">("chat");
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
    if (!user) return;
    const list = await fetchSessions();
    setSessions(list);
  }, [user]);

  useEffect(() => {
    if (user) {
      loadRemoteSessions();
    } else {
      setSessions([]);
    }
  }, [user, loadRemoteSessions]);

  useEffect(() => {
    async function init() {
      if (!user) return;
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
  }, [user, loadMessages, resetChat]);

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

  // Strict Private Application Mode: loading spinner
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#171719] text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono tracking-wider text-gray-400 uppercase">Authenticating Kultura...</span>
        </div>
      </div>
    );
  }

  // Strict Private Application Mode: Unauthenticated visitor screen (AuthModal mandatory)
  if (!user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#171719] p-4 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold text-white mb-2">Private Inference Platform</h2>
          <p className="text-sm text-gray-400">Please sign in to access Chat, Model Hub, and local inference engines.</p>
        </div>
      </div>
    );
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

        {/* View Switcher: Observability vs Settings vs Users vs Hub vs Chat Feed */}
        {activeView === "observability" ? (
          <PermissionGate
            permission="observability:view"
            fallback={
              <AccessDeniedView
                title="Observability Access Restricted"
                message="Viewing telemetry, p95 latency, and token consumption logs requires administrator privileges."
              />
            }
          >
            <ObservabilityView onBackToChat={() => setActiveView("chat")} />
          </PermissionGate>
        ) : activeView === "settings" ? (
          <UserSettingsView
            currentUser={user}
            onUserUpdated={refreshUser}
            onBackToChat={() => setActiveView("chat")}
          />
        ) : activeView === "users" ? (
          <PermissionGate
            permission="users:manage"
            fallback={
              <AccessDeniedView
                title="User Management Restricted"
                message="Creating, updating, and revoking user accounts requires administrator privileges."
              />
            }
          >
            <UsersManagementView onClose={() => setActiveView("chat")} />
          </PermissionGate>
        ) : activeView === "hub" ? (
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

export default function Home() {
  return (
    <AuthProvider>
      <AuthorizationProvider>
        <HomeContent />
        <AuthModal isMandatory={true} />
      </AuthorizationProvider>
    </AuthProvider>
  );
}
