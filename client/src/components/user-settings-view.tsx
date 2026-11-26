"use client";

import React, { useState, useEffect } from "react";
import type { User, ApiKey, UserUsage, UpdateProfilePayload } from "@/types/auth";
import {
  fetchApiKeysApi,
  createApiKeyApi,
  revokeApiKeyApi,
  updateUserProfileApi,
  fetchMyUsageApi,
} from "@/lib/api";
import { CODING_AGENT_CONFIGS } from "@/lib/constants";
import { useTheme } from "@/context/theme-context";

interface UserSettingsViewProps {
  currentUser: User | null;
  onUserUpdated?: (updated: User) => void;
  onBackToChat?: () => void;
}

export function UserSettingsView({
  currentUser,
  onUserUpdated,
  onBackToChat,
}: UserSettingsViewProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  const [activeTab, setActiveTab] = useState<"profile" | "api_keys" | "coding_agents" | "usage">("profile");

  // Profile Form State
  const [bio, setBio] = useState(currentUser?.bio || "");
  const [designation, setDesignation] = useState(currentUser?.designation || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Coding Agents Selected Config Tab & Key
  const [selectedAgentId, setSelectedAgentId] = useState<string>("cursor");
  const [selectedApiKeyForSnippets, setSelectedApiKeyForSnippets] = useState<string>("");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Personal Usage State
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setBio(currentUser.bio || "");
      setDesignation(currentUser.designation || "");
      setAvatarUrl(currentUser.avatar_url || "");
    }
  }, [currentUser]);

  useEffect(() => {
    loadApiKeys();
    loadUsage();
  }, []);

  const loadApiKeys = async () => {
    try {
      const keys = await fetchApiKeysApi();
      setApiKeys(keys);
      if (keys.length > 0 && !selectedApiKeyForSnippets) {
        setSelectedApiKeyForSnippets(keys[0].key_prefix + "...");
      }
    } catch (err) {
      console.warn("Failed to load API keys:", err);
    }
  };

  const loadUsage = async () => {
    setLoadingUsage(true);
    try {
      const data = await fetchMyUsageApi();
      setUsage(data);
    } catch (err) {
      console.warn("Failed to load usage:", err);
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccessMsg("");
    try {
      const updated = await updateUserProfileApi({
        bio: bio.trim() || null,
        designation: designation.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      });
      if (onUserUpdated) onUserUpdated(updated);
      setProfileSuccessMsg("Profile updated successfully!");
      setTimeout(() => setProfileSuccessMsg(""), 3500);
    } catch (err: any) {
      alert(`Error updating profile: ${err.message}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res: any = await createApiKeyApi(newKeyName.trim());
      const rawKey = res.raw_key || res.api_key?.raw_key;
      const keyObj: ApiKey = {
        id: res.id || res.api_key?.id,
        name: res.name || res.key_name || res.api_key?.name || newKeyName.trim(),
        key_prefix: res.key_prefix || res.api_key?.key_prefix || "kult_live_",
        created_at: res.created_at || new Date().toISOString(),
        last_used_at: null,
        is_active: true,
      };
      setCreatedRawKey(rawKey);
      setNewKeyName("");
      setApiKeys((prev) => [keyObj, ...prev]);
      loadUsage();
    } catch (err: any) {
      alert(`Failed to create API key: ${err.message}`);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Applications using it will lose access immediately.")) return;
    try {
      await revokeApiKeyApi(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      loadUsage();
    } catch (err: any) {
      alert(`Failed to revoke key: ${err.message}`);
    }
  };

  const handleCopy = (text: string, isSnippet: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isSnippet) {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const currentAgent = CODING_AGENT_CONFIGS.find((a) => a.id === selectedAgentId) || CODING_AGENT_CONFIGS[0];

  return (
    <div className={`flex flex-col h-full overflow-y-auto ${isLight ? "bg-[#F8F9FA] text-zinc-900" : "bg-[#0E0E10] text-zinc-100"}`}>
      {/* ── TOP HEADER ── */}
      <header className={`px-6 py-4 border-b flex items-center justify-between sticky top-0 z-20 backdrop-blur-md ${
        isLight ? "bg-white/80 border-zinc-200" : "bg-[#121214]/80 border-zinc-800"
      }`}>
        <div className="flex items-center gap-3">
          {onBackToChat && (
            <button
              onClick={onBackToChat}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition ${
                isLight ? "bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700" : "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-300"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Chat
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-mono text-zinc-400">Account</span>
              <span className="text-zinc-500">/</span>
              <h1 className="text-base font-semibold tracking-tight">Settings & Developer Keys</h1>
            </div>
            <p className="text-xs text-zinc-500">Manage your profile, generate coding agent API keys, and monitor personal consumption</p>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`px-3 py-1.5 text-xs rounded-lg border flex items-center gap-2 transition ${
              isLight
                ? "bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800"
                : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
            }`}
          >
            {isLight ? (
              <>
                <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-sky-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
                <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── SETTINGS TABS ── */}
      <div className="max-w-5xl mx-auto w-full p-6 space-y-6">
        <div className={`flex border-b ${isLight ? "border-zinc-200" : "border-zinc-800"}`}>
          {[
            { id: "profile", label: "My Profile" },
            { id: "api_keys", label: `API Keys (${apiKeys.length})` },
            { id: "coding_agents", label: "Coding Agents Guide" },
            { id: "usage", label: "Personal Usage" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition -mb-[2px] ${
                activeTab === tab.id
                  ? isLight
                    ? "border-zinc-900 text-zinc-900 font-semibold"
                    : "border-white text-white font-semibold"
                  : isLight
                    ? "border-transparent text-zinc-500 hover:text-zinc-800"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 1. PROFILE TAB ── */}
        {activeTab === "profile" && (
          <div className={`p-6 rounded-2xl border space-y-6 ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Public Profile & Designation</h2>
              <p className="text-xs text-zinc-500">Customize how your account appears in team threads and system logs</p>
            </div>

            {profileSuccessMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                {profileSuccessMsg}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
              {/* Avatar Preview & URL */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-400 flex-shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl("")} />
                  ) : (
                    <span className="text-xl font-bold uppercase">{currentUser?.username?.charAt(0) || "U"}</span>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Avatar Image URL</label>
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/photo-..."
                    className={`w-full text-xs px-3 py-2 rounded-lg border focus:outline-none ${
                      isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100"
                    }`}
                  />
                </div>
              </div>

              {/* Username & Email (Read-only) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Username</label>
                  <input
                    type="text"
                    disabled
                    value={currentUser?.username || ""}
                    className={`w-full text-xs px-3 py-2 rounded-lg border opacity-60 cursor-not-allowed ${
                      isLight ? "bg-zinc-100 border-zinc-300 text-zinc-700" : "bg-zinc-900/50 border-zinc-800 text-zinc-400"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Email</label>
                  <input
                    type="email"
                    disabled
                    value={currentUser?.email || ""}
                    className={`w-full text-xs px-3 py-2 rounded-lg border opacity-60 cursor-not-allowed ${
                      isLight ? "bg-zinc-100 border-zinc-300 text-zinc-700" : "bg-zinc-900/50 border-zinc-800 text-zinc-400"
                    }`}
                  />
                </div>
              </div>

              {/* Designation */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Professional Designation / Role</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Senior AI Engineer, Research Scientist"
                  className={`w-full text-xs px-3 py-2 rounded-lg border focus:outline-none ${
                    isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100"
                  }`}
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Bio / Profile Description</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Write a brief bio about your work, preferred models, or research..."
                  className={`w-full text-xs px-3 py-2 rounded-lg border focus:outline-none ${
                    isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100"
                  }`}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition disabled:opacity-50"
                >
                  {savingProfile ? "Saving Profile..." : "Save Profile Changes"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── 2. API KEYS TAB ── */}
        {activeTab === "api_keys" && (
          <div className="space-y-6">
            {/* Create API Key Box */}
            <div className={`p-6 rounded-2xl border space-y-4 ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Create Developer API Key</h2>
                <p className="text-xs text-zinc-500">API keys authenticate your coding agents (Cursor, Claude Code CLI, Cline) against Kultura's local endpoint</p>
              </div>

              {createdRawKey && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-amber-400">
                    <span>⚠️ Copy your key now. You will not be able to view it again!</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdRawKey}
                      className="flex-1 font-mono text-xs px-3 py-2 rounded-lg bg-black/60 border border-amber-500/40 text-amber-200 select-all"
                    />
                    <button
                      onClick={() => handleCopy(createdRawKey)}
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition"
                    >
                      {copiedKey ? "Copied!" : "Copy Key"}
                    </button>
                    <button
                      onClick={() => setCreatedRawKey(null)}
                      className="px-3 py-2 text-xs rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateApiKey} className="flex items-center gap-3 max-w-md">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. Cursor MacBook, Claude Code CLI)"
                  required
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border focus:outline-none ${
                    isLight ? "bg-zinc-50 border-zinc-300 text-zinc-900" : "bg-zinc-900 border-zinc-800 text-zinc-100"
                  }`}
                />
                <button
                  type="submit"
                  disabled={creatingKey}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition disabled:opacity-50 whitespace-nowrap"
                >
                  {creatingKey ? "Creating..." : "Generate Key"}
                </button>
              </form>
            </div>

            {/* List Active API Keys */}
            <div className={`p-6 rounded-2xl border space-y-4 ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Your Active API Keys</h3>
              <div className="divide-y divide-zinc-800/40">
                {apiKeys.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4">No API keys created yet. Generate one above to use with coding tools.</p>
                ) : (
                  apiKeys.map((key) => (
                    <div key={key.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <span>{key.name}</span>
                          <span className="font-mono text-[11px] text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded">
                            {key.key_prefix}...
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          Created {new Date(key.created_at).toLocaleDateString()} • Last used: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevokeApiKey(key.id)}
                        className="px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-md transition"
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 3. CODING AGENTS GUIDE TAB ── */}
        {activeTab === "coding_agents" && (
          <div className={`p-6 rounded-2xl border space-y-6 ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Coding Agents & IDE Integration</h2>
              <p className="text-xs text-zinc-500">Connect Cursor, Claude Code CLI, Cline, Continue.dev, or Aider to Kultura's high-speed local inference</p>
            </div>

            {/* Agent Selector Pills */}
            <div className="flex flex-wrap gap-2">
              {CODING_AGENT_CONFIGS.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                    selectedAgentId === agent.id
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                      : isLight
                        ? "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {agent.name}
                </button>
              ))}
            </div>

            {/* Details for Selected Agent */}
            <div className={`p-4 rounded-xl border space-y-4 ${isLight ? "bg-zinc-50 border-zinc-200" : "bg-[#101012] border-zinc-800/80"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold tracking-wide uppercase font-mono text-zinc-400">{currentAgent.name} Setup</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{currentAgent.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500">Default Model:</span>
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {currentAgent.defaultModel}
                  </span>
                </div>
              </div>

              {/* Snippet Header & Copy Button */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Configuration Snippet:</span>
                  <button
                    onClick={() => handleCopy(currentAgent.snippet, true)}
                    className="px-2.5 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition font-mono"
                  >
                    {copiedSnippet ? "✓ Copied!" : "Copy Configuration"}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-black/80 border border-zinc-800 text-zinc-200 font-mono text-xs overflow-x-auto leading-relaxed">
                  {currentAgent.snippet}
                </pre>
              </div>

              {/* Endpoint Specs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
                <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40">
                  <span className="text-zinc-500 text-[10px] block">Base URL</span>
                  <span className="font-mono text-emerald-400">{currentAgent.endpoint}</span>
                </div>
                <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40">
                  <span className="text-zinc-500 text-[10px] block">Auth Header</span>
                  <span className="font-mono text-zinc-300">Authorization: Bearer &lt;key&gt;</span>
                </div>
                <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40">
                  <span className="text-zinc-500 text-[10px] block">Protocol</span>
                  <span className="font-mono text-zinc-300">OpenAI API Compatible</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. PERSONAL USAGE TAB ── */}
        {activeTab === "usage" && (
          <div className={`p-6 rounded-2xl border space-y-6 ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Personal Token Consumption & Stats</h2>
                <p className="text-xs text-zinc-500">Your total request activity and token consumption across UI and coding agents</p>
              </div>
              <button
                onClick={loadUsage}
                disabled={loadingUsage}
                className="px-2.5 py-1 text-xs rounded border border-zinc-700 hover:bg-zinc-800 transition"
              >
                {loadingUsage ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <span className="text-zinc-500 text-xs block">Daily Tokens (Today)</span>
                <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                  {usage?.daily_tokens.toLocaleString() ?? 0}
                </span>
                <span className="text-[10px] text-zinc-500">Reset at 00:00 UTC</span>
              </div>

              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <span className="text-zinc-500 text-xs block">Monthly Tokens</span>
                <span className="text-2xl font-bold font-mono text-sky-400 mt-1 block">
                  {usage?.monthly_tokens.toLocaleString() ?? 0}
                </span>
                <span className="text-[10px] text-zinc-500">Current calendar month</span>
              </div>

              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <span className="text-zinc-500 text-xs block">All-time Requests</span>
                <span className="text-2xl font-bold font-mono text-zinc-100 mt-1 block">
                  {usage?.total_requests ?? 0}
                </span>
                <span className="text-[10px] text-zinc-500">Chat + Agent traces</span>
              </div>

              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <span className="text-zinc-500 text-xs block">Active API Keys</span>
                <span className="text-2xl font-bold font-mono text-purple-400 mt-1 block">
                  {usage?.active_keys_count ?? 0}
                </span>
                <span className="text-[10px] text-zinc-500">Connected IDEs & CLI tools</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
