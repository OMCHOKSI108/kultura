"use client";

import { useEffect, useState, useRef } from "react";
import type { ProviderStatus, ModelInfo, VramStatus, LoadLifecycleProgress, ComprehensiveHealthStatus } from "@/types/provider";
import {
  fetchProviders,
  fetchProviderModels,
  fetchVramStatus,
  loadModelStream,
  unloadAllVram,
  fetchProvidersHealth,
} from "@/lib/api";

const PROVIDERS = [
  { id: "ollama", label: "Ollama", port: 11434, desc: "Native Docker inference runner", type: "docker" as const },
  { id: "llamacpp", label: "llama.cpp", port: 8080, desc: "Docker CUDA GGUF engine", type: "docker" as const },
  { id: "koboldcpp", label: "KoboldCpp", port: 5001, desc: "Docker CUDA GGUF engine", type: "docker" as const },
  { id: "lmstudio", label: "LM Studio", port: 1234, desc: "Optional host desktop app", type: "external" as const },
  { id: "jan", label: "Jan", port: 1337, desc: "Optional host desktop app", type: "external" as const },
];

function IconChevronDown({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconCheck({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconPlay({ className = "w-2.5 h-2.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function IconEject({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 4 4 14 20 14 12 4" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function IconSpinner({ className = "w-3 h-3 animate-spin" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function IconActivity({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconRefresh({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function IconX({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface Props {
  selectedProvider: string;
  selectedModel: string;
  onSelectProvider: (provider: string) => void;
  onSelectModel: (model: string) => void;
  isModelReady: boolean;
  setIsModelReady: (ready: boolean) => void;
  onOpenHub?: (provider?: string) => void;
  refreshKey?: number;
}

export function ProviderModelSelector({
  selectedProvider,
  selectedModel,
  onSelectProvider,
  onSelectModel,
  isModelReady,
  setIsModelReady,
  onOpenHub,
  refreshKey = 0,
}: Props) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [vram, setVram] = useState<VramStatus | null>(null);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [loadElapsed, setLoadElapsed] = useState(0);
  const [isEjecting, setIsEjecting] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  // Health Check Modal State
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [healthData, setHealthData] = useState<ComprehensiveHealthStatus | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const providerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const initialSyncedRef = useRef(false);

  useEffect(() => {
    let timer: any = null;
    if (loadingStep && loadingStep !== "ready" && loadingStep !== "error") {
      setLoadElapsed(0);
      const start = Date.now();
      timer = setInterval(() => {
        setLoadElapsed(Math.round((Date.now() - start) / 100) / 10);
      }, 100);
    } else {
      setLoadElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loadingStep]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) {
        setProviderOpen(false);
      }
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Poll providers and true VRAM every 3 seconds
  useEffect(() => {
    async function loadData() {
      const [provs, vr] = await Promise.all([fetchProviders(), fetchVramStatus()]);
      setProviders(provs);
      setVram(vr);

      // Auto-select active provider and model if currently loaded in VRAM and not yet synced
      if (!initialSyncedRef.current && vr?.active_provider && vr?.active_model && (vr?.used_mb ?? 0) > 0) {
        initialSyncedRef.current = true;
        onSelectProvider(vr.active_provider);
        onSelectModel(vr.active_model);
      }
    }
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [onSelectProvider, onSelectModel]);

  // Fetch models whenever selected provider changes
  useEffect(() => {
    const controller = new AbortController();

    async function getModels() {
      const mList = await fetchProviderModels(selectedProvider, controller.signal);
      if (controller.signal.aborted) return;

      setModels(mList);
      if (mList.length > 0) {
        const activeM = mList.find((m) => m.is_active);
        const target = activeM ? (activeM.name || activeM.id) : (mList[0].name || mList[0].id);
        onSelectModel(target);
      } else {
        onSelectModel("");
      }
    }

    getModels();

    return () => {
      controller.abort();
    };
  }, [selectedProvider, refreshKey, onSelectModel]);

  const isVramLoaded =
    vram?.active_provider === selectedProvider &&
    vram?.active_model === selectedModel &&
    (vram?.used_mb ?? 0) > 0;

  useEffect(() => {
    if (selectedModel && selectedModel.trim().length > 0) {
      setIsModelReady(true);
    } else {
      setIsModelReady(false);
    }
  }, [selectedModel, setIsModelReady]);

  // Automatic Eject when switching Provider
  async function handleSwitchProvider(newProviderId: string) {
    if (newProviderId === selectedProvider) {
      setProviderOpen(false);
      return;
    }
    setProviderOpen(false);

    // Eject old LLM and provider first to eliminate any VRAM bottleneck or collision
    if (isVramLoaded || (vram?.used_mb ?? 0) > 50 || vram?.active_model) {
      setIsEjecting(true);
      try {
        await unloadAllVram();
        const updatedVram = await fetchVramStatus();
        setVram(updatedVram);
      } catch (e) {
        console.warn("Auto-eject failed on provider switch:", e);
      } finally {
        setIsEjecting(false);
      }
    }

    onSelectProvider(newProviderId);
    onSelectModel("");
    setIsModelReady(false);
  }

  // Automatic Eject when switching Model
  async function handleSwitchModel(newModelName: string) {
    if (newModelName === selectedModel) {
      setModelOpen(false);
      return;
    }
    setModelOpen(false);

    // Eject old model from VRAM first so new model has 100% clean headroom
    if (isVramLoaded || (vram?.used_mb ?? 0) > 50) {
      setIsEjecting(true);
      try {
        await unloadAllVram();
        const updatedVram = await fetchVramStatus();
        setVram(updatedVram);
      } catch (e) {
        console.warn("Auto-eject failed on model switch:", e);
      } finally {
        setIsEjecting(false);
      }
    }

    onSelectModel(newModelName);
    setIsModelReady(false);
  }

  async function handleLoadModel() {
    setLoadingStep("stopping_previous");
    setLoadingMsg("Evicting previous models & allocating VRAM...");
    setIsModelReady(false);

    try {
      let isReady = false;
      await loadModelStream(selectedProvider, selectedModel, (progress: LoadLifecycleProgress) => {
        setLoadingStep(progress.step);
        setLoadingMsg(progress.message);
        if (progress.step === "ready") {
          isReady = true;
          setIsModelReady(true);
          setTimeout(() => {
            setLoadingStep(null);
            setLoadingMsg(null);
          }, 1500);
        } else if (progress.step === "error" || progress.step === "warning") {
          setTimeout(() => {
            setLoadingStep(null);
            setLoadingMsg(null);
          }, 4500);
        }
      });
      if (!isReady) {
        setTimeout(() => {
          setLoadingStep(null);
          setLoadingMsg(null);
        }, 4500);
      }
      const updatedVram = await fetchVramStatus();
      setVram(updatedVram);
    } catch (err: any) {
      setLoadingStep("error");
      setLoadingMsg(err?.message || "Failed to load model");
      setTimeout(() => {
        setLoadingStep(null);
        setLoadingMsg(null);
      }, 4500);
    }
  }

  async function handleUnload() {
    setIsEjecting(true);
    try {
      await unloadAllVram();
      setIsModelReady(false);
      const vr = await fetchVramStatus();
      setVram(vr);
    } finally {
      setIsEjecting(false);
    }
  }

  async function handleOpenHealthModal() {
    setHealthModalOpen(true);
    setIsCheckingHealth(true);
    try {
      const data = await fetchProvidersHealth();
      setHealthData(data);
    } finally {
      setIsCheckingHealth(false);
    }
  }

  async function handleRefreshHealth() {
    setIsCheckingHealth(true);
    try {
      const [data, provs, vr] = await Promise.all([
        fetchProvidersHealth(),
        fetchProviders(),
        fetchVramStatus(),
      ]);
      setHealthData(data);
      setProviders(provs);
      setVram(vr);
    } finally {
      setIsCheckingHealth(false);
    }
  }

  const currentProviderObj = providers.find((p) => p.name === selectedProvider);
  const isProviderOffline = currentProviderObj ? currentProviderObj.status === "offline" : false;
  const statusColor =
    currentProviderObj?.status === "running" ? "#10B981" : currentProviderObj?.status === "standby" ? "#F59E0B" : "#6B7280";
  const selectedLabel = PROVIDERS.find((p) => p.id === selectedProvider)?.label || selectedProvider;

  const onlineProvidersCount = providers.filter((p) => p.status === "running").length;

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b text-xs select-none"
        style={{ background: "#141416", borderColor: "#242427" }}
      >
        {/* Left: Provider & Model Selectors */}
        <div className="flex items-center gap-2">
          {/* Provider Menu */}
          <div ref={providerRef} className="relative">
            <button
              type="button"
              onClick={() => { setProviderOpen((prev) => !prev); setModelOpen(false); }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#1C1C1F] hover:bg-[#232327] border border-[#2E2E33] text-gray-200 transition-colors"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
              <span className="font-medium">{selectedLabel}</span>
              <IconChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${providerOpen ? "rotate-180" : ""}`} />
            </button>

            {providerOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 rounded-xl bg-[#1C1C1F] border border-[#2E2E33] shadow-2xl py-1.5 z-50">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-emerald-400/80 border-b border-[#2A2A30] mb-1 flex items-center justify-between">
                  <span>Built-in Docker Engines</span>
                  <span className="text-[9px] text-gray-500 font-sans">Self-Contained</span>
                </div>
                {PROVIDERS.filter((p) => p.type === "docker").map((opt) => {
                  const pObj = providers.find((p) => p.name === opt.id);
                  const provStatus = pObj?.status;
                  const dotColor = provStatus === "running" ? "#10B981" : provStatus === "standby" ? "#F59E0B" : "#6B7280";
                  const statusLabel = provStatus === "running" ? "Online" : provStatus === "standby" ? "Standby" : "Offline";
                  const isSelected = selectedProvider === opt.id;
                  const count = pObj?.models_count ?? 0;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSwitchProvider(opt.id)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                        isSelected ? "bg-[#28282D] text-white font-medium" : "text-gray-300 hover:bg-[#232327] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] shrink-0 font-mono">
                        <span className="text-gray-500">{count > 0 ? `${count} m` : ""}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] ${
                            provStatus === "running"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : provStatus === "standby"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-zinc-800 text-gray-500"
                          }`}
                        >
                          {statusLabel}
                        </span>
                        {isSelected && <IconCheck className="w-3 h-3 text-pink-400" />}
                      </div>
                    </button>
                  );
                })}

                <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-gray-500 border-t border-[#2A2A30] mt-1.5 mb-1 flex items-center justify-between">
                  <span>External Bridges</span>
                  <span className="text-[9px] text-gray-500 font-sans">Optional Host</span>
                </div>
                {PROVIDERS.filter((p) => p.type === "external").map((opt) => {
                  const pObj = providers.find((p) => p.name === opt.id);
                  const provStatus = pObj?.status;
                  const dotColor = provStatus === "running" ? "#10B981" : "#6B7280";
                  const statusLabel = provStatus === "running" ? "Online" : "Offline";
                  const isSelected = selectedProvider === opt.id;
                  const count = pObj?.models_count ?? 0;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSwitchProvider(opt.id)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                        isSelected ? "bg-[#28282D] text-white font-medium" : "text-gray-300 hover:bg-[#232327] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                        <span className="truncate">{opt.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] shrink-0 font-mono">
                        <span className="text-gray-500">{count > 0 ? `${count} m` : ""}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] ${
                            provStatus === "running"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-zinc-800 text-gray-500"
                          }`}
                        >
                          {statusLabel}
                        </span>
                        {isSelected && <IconCheck className="w-3 h-3 text-pink-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model Menu */}
          <div ref={modelRef} className="relative">
            <button
              type="button"
              onClick={() => { setModelOpen((prev) => !prev); setProviderOpen(false); }}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors max-w-[220px] ${
                isProviderOffline
                  ? "bg-[#18181B] border-[#2E2E33] text-gray-500"
                  : "bg-[#1C1C1F] hover:bg-[#232327] border-[#2E2E33] text-gray-200"
              }`}
            >
              <span className="truncate">
                {isProviderOffline
                  ? "Provider offline"
                  : selectedModel || "No models available"}
              </span>
              <IconChevronDown className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
            </button>

            {modelOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 max-h-64 overflow-y-auto rounded-xl bg-[#1C1C1F] border border-[#2E2E33] shadow-2xl py-1 z-50">
                {isProviderOffline ? (
                  <div className="px-3 py-2.5 text-xs text-gray-400">
                    <p className="text-gray-300 font-medium">{currentProviderObj?.display_name || selectedLabel} is offline</p>
                    {PROVIDERS.find((p) => p.id === selectedProvider)?.type === "external" ? (
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        This is an optional desktop bridge. For 100% self-contained inference inside Docker, choose <strong>Ollama</strong> or <strong>llama.cpp</strong>.
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Start the Docker container or check health to detect models.
                      </p>
                    )}
                  </div>
                ) : models.length > 0 ? (
                  models.map((m) => {
                    const mName = m.name || m.id;
                    const isSelected = selectedModel === mName;
                    return (
                      <button
                        key={m.id || mName}
                        type="button"
                        onClick={() => handleSwitchModel(mName)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                          isSelected ? "bg-[#28282D] text-white font-medium" : "text-gray-300 hover:bg-[#232327] hover:text-white"
                        }`}
                      >
                        <span className="truncate pr-2">{mName}</span>
                        {isSelected && <IconCheck className="w-3 h-3 text-pink-400 shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2.5 text-xs text-gray-400 flex flex-col gap-1.5">
                    <span className="text-gray-300">No local models detected</span>
                    <button
                      type="button"
                      onClick={() => {
                        setModelOpen(false);
                        onOpenHub?.(selectedProvider);
                      }}
                      className="inline-flex items-center gap-1 text-pink-400 hover:text-pink-300 font-medium text-[11px] mt-0.5"
                    >
                      <span>No local models — Open Model Hub &rarr;</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Load / Ready Status */}
          {loadingStep ? (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                loadingStep === "error"
                  ? "text-red-400 bg-red-950/40 border border-red-500/30"
                  : loadingStep === "warning"
                  ? "text-amber-400 bg-amber-950/40 border border-amber-500/30"
                  : "text-indigo-300 bg-indigo-950/30 border border-indigo-500/30 animate-pulse"
              }`}
            >
              {loadingStep === "error" ? (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              ) : (
                <IconSpinner className="w-3 h-3 animate-spin text-current shrink-0" />
              )}
              <span className="max-w-[280px] truncate">{loadingMsg || "Loading..."}</span>
              {loadElapsed > 0 && loadingStep !== "error" && (
                <span className="font-mono text-[10px] text-indigo-300/80 shrink-0">({loadElapsed.toFixed(1)}s)</span>
              )}
            </div>
          ) : isVramLoaded ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/25">
              <IconCheck className="w-3 h-3 text-emerald-400" />
              <span>Ready in VRAM</span>
            </div>
          ) : (
            <button
              onClick={handleLoadModel}
              disabled={!selectedModel || isProviderOffline}
              title={
                isProviderOffline
                  ? "Provider is offline — start the provider application or container first"
                  : !selectedModel
                  ? "Select a model first"
                  : "Load model into GPU VRAM (Auto-evicts previous models)"
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-200 bg-[#252529] hover:bg-[#2E2E33] hover:text-white border border-[#3E3E44] transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <IconPlay className="w-2.5 h-2.5 text-indigo-400" />
              <span>Load Model</span>
            </button>
          )}
        </div>

        {/* Right: Health Check, VRAM Indicator & Unload Eject Button */}
        <div className="flex items-center gap-2.5">
          {/* Health Check Modal Trigger */}
          <button
            type="button"
            onClick={handleOpenHealthModal}
            title="Check all providers availability and GPU status"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1C1C1F] hover:bg-[#24242A] border border-[#2E2E33] text-gray-300 hover:text-gray-100 transition-colors cursor-pointer"
          >
            <IconActivity className="w-3 h-3 text-pink-400" />
            <span className="font-medium text-[11px]">Health:</span>
            <span
              className={`font-mono text-[11px] ${
                onlineProvidersCount > 0 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {onlineProvidersCount}/{providers.length}
            </span>
          </button>

          {/* Live VRAM Indicator */}
          {vram && (
            <div
              className="flex items-center gap-2 text-xs text-gray-400 bg-[#17171A] px-2.5 py-1 rounded-lg border border-[#28282E]"
              title={`GPU VRAM: ${(vram.used_mb / 1024).toFixed(2)} GB used / ${(vram.total_mb / 1024).toFixed(2)} GB total (${vram.utilization_pct}%)`}
            >
              <span className="text-[11px] text-gray-500 font-medium">VRAM:</span>
              <span className="font-mono text-gray-200">
                {(vram.used_mb / 1024).toFixed(1)} / {(vram.total_mb / 1024).toFixed(1)} GB
              </span>
              <div className="w-12 h-1.5 bg-[#2A2A30] rounded-full overflow-hidden shrink-0">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    vram.utilization_pct > 85
                      ? "bg-amber-400"
                      : vram.utilization_pct > 0
                      ? "bg-emerald-400"
                      : "bg-gray-600"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(vram.utilization_pct, 0))}%` }}
                />
              </div>
              <span className="text-[11px] text-gray-400 font-mono">({vram.utilization_pct}%)</span>
            </div>
          )}

          {/* Eject VRAM Button */}
          <button
            onClick={handleUnload}
            disabled={isEjecting}
            title="Free all GPU VRAM immediately and evict active models"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/25 border border-[#2E2E33] transition-all disabled:opacity-50 cursor-pointer"
          >
            {isEjecting ? (
              <IconSpinner className="w-3 h-3 text-red-400 animate-spin" />
            ) : (
              <IconEject className="w-3 h-3" />
            )}
            <span>{isEjecting ? "Ejecting..." : "Eject VRAM"}</span>
          </button>
        </div>
      </div>

      {/* Provider Health Check Modal */}
      {healthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#19191D] border border-[#2D2D35] shadow-2xl p-6 text-gray-200 flex flex-col gap-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#2A2A32] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/25 flex items-center justify-center text-pink-400">
                  <IconActivity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-100">
                    Provider & GPU Health Check
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Real-time connectivity and VRAM utilization status
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshHealth}
                  disabled={isCheckingHealth}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-[#25252D] transition-colors"
                  title="Re-check all providers"
                >
                  <IconRefresh className={`w-4 h-4 ${isCheckingHealth ? "animate-spin text-pink-400" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setHealthModalOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-[#25252D] transition-colors"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* GPU & VRAM Summary */}
            <div className="p-3.5 rounded-xl bg-[#202026] border border-[#2D2D37] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-200">Host GPU Hardware:</span>
                <span className="text-emerald-400 font-mono text-[11px]">NVIDIA GeForce RTX 3050 Laptop GPU</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                <span>VRAM Allocation:</span>
                <span className="text-gray-200">
                  {vram ? `${(vram.used_mb / 1024).toFixed(2)} GB / ${(vram.total_mb / 1024).toFixed(2)} GB (${vram.utilization_pct}%)` : "Detecting..."}
                </span>
              </div>
              <div className="w-full h-2 bg-[#2D2D35] rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-emerald-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(vram?.utilization_pct ?? 0, 0))}%` }}
                />
              </div>
              {vram?.active_model && (
                <div className="text-[11px] text-pink-300 font-mono mt-0.5">
                  Active Model in VRAM: <span className="font-semibold">{vram.active_model}</span> ({vram.active_provider})
                </div>
              )}
            </div>

            {/* Providers Status List */}
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {PROVIDERS.map((opt) => {
                const liveStatus = (healthData?.providers || providers).find((p) => p.name === opt.id);
                const isRunning = liveStatus?.status === "running";
                const isStandby = liveStatus?.status === "standby";

                return (
                  <div
                    key={opt.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#1D1D22] border border-[#2A2A32]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          isRunning
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                            : isStandby
                            ? "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                            : "bg-gray-600"
                        }`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-gray-100">{opt.label}</span>
                          <span className="text-[10px] text-gray-500 font-mono">Port {opt.port}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium font-mono ${
                          isRunning
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : isStandby
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-zinc-800 text-gray-500 border border-zinc-700/40"
                        }`}
                      >
                        {isRunning ? "Online" : isStandby ? "Standby" : "Offline"}
                      </span>
                      {liveStatus && (
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {liveStatus.models_count} model{liveStatus.models_count === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#2A2A32]">
              <button
                type="button"
                onClick={handleUnload}
                disabled={isEjecting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-300 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 transition-all cursor-pointer"
              >
                <IconEject className="w-3 h-3" />
                <span>{isEjecting ? "Ejecting VRAM..." : "Eject All VRAM"}</span>
              </button>

              <button
                type="button"
                onClick={() => setHealthModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-200 bg-[#272730] hover:bg-[#32323D] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
