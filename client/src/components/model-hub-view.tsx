"use client";

import { useState, useEffect, useRef, useTransition, useMemo } from "react";
import {
  Search,
  X,
  Download,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  HardDriveDownload,
  Sparkles,
  Code2,
  Cpu,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Flame,
  ArrowUpDown,
  RefreshCw,
  LayoutGrid,
  List,
} from "lucide-react";
import { ModelBrandIcon, HuggingFace } from "@/components/model-brand-icon";
import type {
  HubModelSearchItem,
  HubModelDetails,
  HubModelFile,
  DownloadStatusItem,
} from "@/types/hub";
import {
  searchHubModels,
  fetchModelFiles,
  startModelDownload,
  cancelDownloadApi,
  subscribeToDownloadsStream,
} from "@/lib/api";

const SORT_OPTIONS = [
  { id: "downloads", label: "Most Downloaded" },
  { id: "likes", label: "Most Liked" },
  { id: "lastModified", label: "Recently Updated" },
];

const FILTER_CHIPS = [
  { id: "all", label: "All Models" },
  { id: "fits_vram", label: "Fits my VRAM", icon: Sparkles },
  { id: "reasoning", label: "Reasoning", icon: Flame },
  { id: "coding", label: "Coding", icon: Code2 },
  { id: "small", label: "Small <4B", icon: Cpu },
];

const PROVIDER_OPTIONS = [
  { id: "ollama", label: "Ollama" },
  { id: "llamacpp", label: "llama.cpp" },
  { id: "koboldcpp", label: "KoboldCpp" },
  { id: "lmstudio", label: "LM Studio" },
  { id: "jan", label: "Jan" },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

interface ModelHubViewProps {
  initialProvider?: string;
  onModelDownloaded?: () => void;
  onClose?: () => void;
}

export function ModelHubView({
  initialProvider = "ollama",
  onModelDownloaded,
  onClose,
}: ModelHubViewProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState("downloads");
  const [activeFilter, setActiveFilter] = useState("all");
  const [models, setModels] = useState<HubModelSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [, startTransition] = useTransition();

  // Load view mode preference from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("kultura_hub_view_mode");
      if (saved === "grid" || saved === "list") {
        setViewMode(saved);
      }
    }
  }, []);

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("kultura_hub_view_mode", mode);
    }
  };

  // Selected Model for Quantization Detail Drawer
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [modelDetails, setModelDetails] = useState<HubModelDetails | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Download state & SSE
  const [downloads, setDownloads] = useState<DownloadStatusItem[]>([]);
  const [targetProviders, setTargetProviders] = useState<Record<string, string>>({});
  const completedIdsRef = useRef<Set<string>>(new Set());
  const isFirstDownloadsPayloadRef = useRef(true);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 350);
    return () => clearTimeout(handler);
  }, [query]);

  // Fetch search results
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    async function load() {
      const q = debouncedQuery.trim() || undefined;
      const results = await searchHubModels(q, sort, 30);
      if (active) {
        setModels(results);
        setIsLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [debouncedQuery, sort]);

  // Subscribe to live SSE download stream
  useEffect(() => {
    const unsubscribe = subscribeToDownloadsStream((items) => {
      setDownloads(items);

      if (isFirstDownloadsPayloadRef.current) {
        isFirstDownloadsPayloadRef.current = false;
        for (const item of items) {
          if (item.status === "completed") {
            completedIdsRef.current.add(item.download_id);
          }
        }
        return;
      }

      // Check if any download newly completed
      for (const item of items) {
        if (item.status === "completed" && !completedIdsRef.current.has(item.download_id)) {
          completedIdsRef.current.add(item.download_id);
          onModelDownloaded?.();
        }
      }
    });

    return () => unsubscribe();
  }, [onModelDownloaded]);

  // Load files when a repo is opened in drawer
  useEffect(() => {
    if (!selectedRepoId) {
      setModelDetails(null);
      return;
    }

    let active = true;
    setLoadingFiles(true);

    async function loadFiles() {
      const details = await fetchModelFiles(selectedRepoId!);
      if (active) {
        setModelDetails(details);
        setLoadingFiles(false);
      }
    }

    loadFiles();
    return () => {
      active = false;
    };
  }, [selectedRepoId]);

  // Client-side filtering with strict parameter checks
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (activeFilter === "all") return true;

      const lowerName = m.name.toLowerCase();
      const tags = (m.tags || []).map((t) => t.toLowerCase());

      if (activeFilter === "fits_vram" || activeFilter === "small") {
        if (m.param_size_b !== undefined && m.param_size_b !== null) {
          return m.param_size_b <= 4.0;
        }
        if (m.total_params_formatted) {
          const match = m.total_params_formatted.match(/^([\d.]+)\s*B/i);
          if (match) {
            const val = parseFloat(match[1]);
            if (!isNaN(val)) return val <= 4.0;
          }
        }
        // Strict boundary check: match only 0.5b to 4b, never 35b or 14b
        return /\b(0\.[1-9]|1|1\.[0-9]|2|2\.[0-9]|3|3\.[0-9]|4(\.0)?)b\b/i.test(lowerName);
      }

      if (activeFilter === "reasoning") {
        return (
          lowerName.includes("r1") ||
          lowerName.includes("reasoning") ||
          lowerName.includes("thinking") ||
          tags.some((t) => t.includes("reasoning") || t.includes("thinking") || t.includes("r1"))
        );
      }

      if (activeFilter === "coding") {
        return (
          lowerName.includes("code") ||
          lowerName.includes("coder") ||
          tags.some((t) => t.includes("code") || t.includes("coder"))
        );
      }

      return true;
    });
  }, [models, activeFilter]);

  async function handleDownload(file: HubModelFile) {
    if (!selectedRepoId) return;
    const provider = targetProviders[file.filename] || initialProvider || "ollama";

    try {
      await startModelDownload({
        repo_id: selectedRepoId,
        filename: file.filename,
        quant: file.quant,
        provider: provider as any,
      });
    } catch (err: any) {
      alert(`Download failed: ${err?.message || "Unknown error"}`);
    }
  }

  async function handleCancelDownload(downloadId: string) {
    try {
      await cancelDownloadApi(downloadId);
    } catch (err) {
      console.warn("Cancel error:", err);
    }
  }

  const activeDownloads = downloads.filter(
    (d) => d.status === "downloading" || d.status === "pending"
  );

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-[#141416] text-gray-200 overflow-hidden">
      {/* Top Header & Navigation */}
      <div className="px-6 py-4 border-b border-[#222226] flex items-center justify-between flex-shrink-0 bg-[#161619]">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0 shadow-xs">
              <HuggingFace.Color size={22} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                Hugging Face Model Hub
                <span className="text-[11px] font-normal text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                  GGUF Ecosystem
                </span>
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Discover, verify GPU VRAM fit, and download models directly into Ollama, llama.cpp, or KoboldCpp.
              </p>
            </div>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-[#25252A] transition-colors"
            title="Back to Chat"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search, Filter & Controls Row */}
      <div className="px-6 py-3.5 border-b border-[#222226] bg-[#17171A] flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0">
        {/* Search Bar + Result Count */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Hugging Face models (e.g. Qwen2.5, DeepSeek-R1, Llama 3, Gemma)..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#1F1F24] border border-[#2E2E35] text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/40 transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-gray-400 font-mono shrink-0">
            Showing {filteredModels.length} verified GGUF model{filteredModels.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Filter Chips, Sort & View Mode Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 bg-[#1F1F24] p-1 rounded-xl border border-[#2E2E35]">
            {FILTER_CHIPS.map((chip) => {
              const Icon = chip.icon;
              const isActive = activeFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => startTransition(() => setActiveFilter(chip.id))}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    isActive
                      ? "bg-pink-500 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#2A2A32]"
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="appearance-none bg-[#1F1F24] border border-[#2E2E35] text-xs text-gray-300 font-medium py-1.5 pl-3 pr-8 rounded-xl focus:outline-none focus:border-pink-500/50 cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-[#1A1A1E] text-gray-200">
                  {opt.label}
                </option>
              ))}
            </select>
            <ArrowUpDown className="w-3 h-3 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Grid / List View Toggle */}
          <div className="flex items-center bg-[#1F1F24] p-1 rounded-xl border border-[#2E2E35]">
            <button
              onClick={() => handleViewModeChange("grid")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-pink-500 text-white shadow-xs"
                  : "text-gray-400 hover:text-gray-200 hover:bg-[#2A2A32]"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleViewModeChange("list")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "list"
                  ? "bg-pink-500 text-white shadow-xs"
                  : "text-gray-400 hover:text-gray-200 hover:bg-[#2A2A32]"
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl bg-[#1A1A1E]/60 border border-[#26262C] animate-pulse space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-zinc-800 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-zinc-800 rounded w-1/3" />
                      <div className="h-4 bg-zinc-800 rounded w-3/4" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-4 bg-zinc-800 rounded w-12" />
                    <div className="h-4 bg-zinc-800 rounded w-16" />
                    <div className="h-4 bg-zinc-800 rounded w-14" />
                  </div>
                  <div className="pt-3 border-t border-[#26262C] flex justify-between items-center">
                    <div className="h-3 bg-zinc-800 rounded w-16" />
                    <div className="h-6 bg-zinc-800 rounded w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[#1A1A1E]/60 border border-[#26262C] animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-4 bg-zinc-800 rounded w-36" />
                      <div className="h-3 bg-zinc-800 rounded w-20" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-4 bg-zinc-800 rounded w-12" />
                    <div className="h-4 bg-zinc-800 rounded w-14" />
                    <div className="h-4 bg-zinc-800 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredModels.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-500">
            <Layers className="w-8 h-8 opacity-40 text-gray-400" />
            <p className="text-sm font-medium text-gray-400">No GGUF models matched your query</p>
            <p className="text-xs">Try searching for generic tags like &quot;Qwen&quot;, &quot;Llama&quot;, or &quot;Gemma&quot;.</p>
          </div>
        ) : viewMode === "grid" ? (
          /* Unsloth-Style Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredModels.map((m) => {
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRepoId(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedRepoId(m.id);
                    }
                  }}
                  className="group relative flex flex-col justify-between p-4 rounded-2xl bg-[#1A1A1E] border border-[#26262C] hover:border-pink-500/40 hover:bg-[#1E1E24] focus:outline-none focus:ring-1 focus:ring-pink-500/50 transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer text-left"
                >
                  <div>
                    {/* Header: Brand Icon + Author & Metrics & Title */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5 shadow-xs group-hover:border-zinc-700 transition-colors">
                        <ModelBrandIcon modelId={m.id} author={m.author} tags={m.tags} size={22} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Author & Metrics */}
                        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-0.5">
                          <span className="font-medium text-pink-400/90 truncate max-w-[130px]">
                            {m.author}
                          </span>
                          <div className="flex items-center gap-1.5 text-gray-500 font-mono text-[10px]">
                            <span title="Downloads">{formatCount(m.downloads)} dl</span>
                            <span>•</span>
                            <span title="Likes">{m.likes} &hearts;</span>
                          </div>
                        </div>

                        {/* Model Title */}
                        <h2
                          className="text-sm font-semibold text-gray-100 group-hover:text-pink-300 transition-colors line-clamp-1"
                          title={m.name}
                        >
                          {m.name}
                        </h2>
                      </div>
                    </div>

                    {/* Metadata Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pl-0.5">
                      {m.total_params_formatted && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 text-[10px] font-medium font-mono">
                          {m.total_params_formatted}
                        </span>
                      )}
                      {m.architecture && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-[10px] font-medium">
                          {m.architecture}
                        </span>
                      )}
                      {m.gguf_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25 text-[10px] font-mono font-medium">
                          {m.gguf_count} GGUF{m.gguf_count > 1 ? "s" : ""}
                        </span>
                      )}
                      {m.context_length && (
                        <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-gray-400 border border-zinc-700/50 text-[10px] font-mono">
                          {(m.context_length / 1024).toFixed(0)}k ctx
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom: View Quantizations CTA */}
                  <div className="mt-4 pt-3 border-t border-[#26262C] flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 font-mono">GGUF Quantized</span>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25252B] group-hover:bg-pink-600 text-xs font-medium text-gray-200 group-hover:text-white transition-all shadow-sm">
                      <span>View Quantizations</span>
                      <ChevronDown className="w-3.5 h-3.5 -rotate-90 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Sleek Directory List View */
          <div className="flex flex-col gap-2">
            {filteredModels.map((m) => (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRepoId(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedRepoId(m.id);
                  }
                }}
                className="group flex items-center justify-between px-4 py-3 rounded-xl bg-[#1A1A1E] border border-[#26262C] hover:border-pink-500/40 hover:bg-[#1E1E24] focus:outline-none focus:ring-1 focus:ring-pink-500/50 transition-all duration-150 cursor-pointer text-left"
              >
                {/* Left: Brand Icon + Model Name + Author */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-4">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 shadow-xs group-hover:border-zinc-700 transition-colors">
                    <ModelBrandIcon modelId={m.id} author={m.author} tags={m.tags} size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-semibold text-gray-100 group-hover:text-pink-300 transition-colors truncate">
                        {m.name}
                      </h2>
                      <span className="text-[10px] text-pink-400/80 font-mono shrink-0 hidden sm:inline">
                        by {m.author}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono truncate block sm:hidden">
                      {m.author}
                    </span>
                  </div>
                </div>

                {/* Middle: Param Badge + Architecture + GGUF count */}
                <div className="hidden md:flex items-center gap-2 shrink-0 mr-6">
                  {m.total_params_formatted && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 text-[10px] font-mono font-medium">
                      {m.total_params_formatted}
                    </span>
                  )}
                  {m.architecture && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-[10px] font-medium">
                      {m.architecture}
                    </span>
                  )}
                  {m.gguf_count > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25 text-[10px] font-mono font-medium">
                      {m.gguf_count} GGUF{m.gguf_count > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Right: Downloads, Likes, Chevron */}
                <div className="flex items-center gap-4 shrink-0 text-gray-400 text-xs font-mono">
                  <div className="hidden sm:flex items-center gap-2 text-[11px] text-gray-400">
                    <span title="Downloads">{formatCount(m.downloads)} dl</span>
                    <span className="text-gray-600">•</span>
                    <span title="Likes">{m.likes} &hearts;</span>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-[#25252B] group-hover:bg-pink-600 text-gray-400 group-hover:text-white flex items-center justify-center transition-all">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Downloads Drawer / Footer Bar */}
      {activeDownloads.length > 0 && (
        <div className="px-6 py-3.5 bg-[#18181D] border-t border-[#2A2A32] flex flex-col gap-2.5 flex-shrink-0 shadow-2xl">
          <div className="flex items-center justify-between text-xs font-medium text-gray-300">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
              </span>
              Active Downloads ({activeDownloads.length})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {activeDownloads.map((dl) => {
              const pct = dl.progress_pct || 0;
              const speed = dl.speed_mbps ? `${dl.speed_mbps.toFixed(1)} MB/s` : "";

              return (
                <div
                  key={dl.download_id}
                  className="p-2.5 rounded-xl bg-[#202026] border border-[#2D2D37] flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-200 truncate pr-2">
                        {dl.filename}
                      </span>
                      <span className="text-[11px] text-pink-400 font-mono">
                        {pct > 0 ? `${pct}%` : "Connecting..."}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-[#2B2B34] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-pink-500 to-rose-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono mt-1">
                      <span>
                        {formatBytes(dl.bytes_downloaded)} / {formatBytes(dl.total_bytes)}
                      </span>
                      {speed && <span>{speed}</span>}
                      <span className="uppercase text-[9px] px-1 py-0.2 bg-zinc-800 rounded">
                        {dl.provider}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCancelDownload(dl.download_id)}
                    title="Cancel download"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model Detail Drawer / Modal */}
      {selectedRepoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity">
          <div className="relative w-full max-w-2xl h-full bg-[#18181C] border-l border-[#2B2B33] flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[#2B2B33] flex items-center justify-between flex-shrink-0 bg-[#1B1B20]">
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 shadow-xs">
                  <ModelBrandIcon modelId={selectedRepoId} size={26} />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-mono text-pink-400 block truncate">
                    {selectedRepoId.split("/")[0]}
                  </span>
                  <h2 className="text-base font-semibold text-gray-100 truncate">
                    {selectedRepoId.split("/")[1] || selectedRepoId}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://huggingface.co/${selectedRepoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-[#25252B] transition-colors"
                  title="Open on Hugging Face"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setSelectedRepoId(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-[#25252B] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {loadingFiles ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-pink-400" />
                  <span className="text-xs font-medium">Scanning repository tree & calculating VRAM fit...</span>
                </div>
              ) : !modelDetails || modelDetails.files.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400 text-center px-6">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mb-1">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-200">
                      No downloadable GGUF weights found in this repository
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-md">
                      This repository does not contain compatible standalone .gguf quantization files or the weights are stored in non-standard branches.
                    </p>
                  </div>
                  <a
                    href={`https://huggingface.co/${selectedRepoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-gray-200 transition-colors border border-zinc-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View on Hugging Face Hub</span>
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Info notice about VRAM calculation */}
                  <div className="p-3 rounded-xl bg-[#202026] border border-[#2D2D37] text-xs text-gray-300 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-gray-200">Hardware Probing:</span>
                      <span className="text-gray-400 ml-1.5">
                        Fit badges account for model weights + 15% KV-cache overhead against your host GPU.
                      </span>
                    </div>
                  </div>

                  {/* Quantizations Table */}
                  <div className="border border-[#282830] rounded-xl overflow-hidden bg-[#151518]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#1C1C22] text-gray-400 border-b border-[#282830]">
                        <tr>
                          <th className="py-2.5 px-3 font-medium">Quantization</th>
                          <th className="py-2.5 px-3 font-medium">File Size</th>
                          <th className="py-2.5 px-3 font-medium">VRAM Fit</th>
                          <th className="py-2.5 px-3 font-medium">Target Provider</th>
                          <th className="py-2.5 px-3 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#24242B]">
                        {modelDetails.files.map((f) => {
                          const prov = targetProviders[f.filename] || initialProvider || "ollama";
                          const activeDl = downloads.find(
                            (d) =>
                              d.filename === f.filename &&
                              (d.status === "downloading" || d.status === "pending")
                          );
                          const isCompleted = downloads.some(
                            (d) => d.filename === f.filename && d.status === "completed"
                          );

                          return (
                            <tr key={f.filename} className="hover:bg-[#1B1B20] transition-colors">
                              {/* Quant Tag */}
                              <td className="py-3 px-3">
                                <span className="font-semibold text-gray-200 font-mono">
                                  {f.quant}
                                </span>
                                <p className="text-[10px] text-gray-500 truncate max-w-[130px]" title={f.filename}>
                                  {f.filename}
                                </p>
                              </td>

                              {/* Size */}
                              <td className="py-3 px-3 font-mono text-gray-300">
                                {f.size_formatted}
                              </td>

                              {/* VRAM Fit Badge */}
                              <td className="py-3 px-3">
                                {f.vram_fit === "fits" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[11px] font-medium">
                                    <CheckCircle className="w-3 h-3 shrink-0" />
                                    Fits GPU
                                  </span>
                                ) : f.vram_fit === "tight" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[11px] font-medium">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    Tight / Offload
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/25 text-[11px] font-medium">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Exceeds VRAM
                                  </span>
                                )}
                              </td>

                              {/* Target Provider Dropdown */}
                              <td className="py-3 px-3">
                                <select
                                  value={prov}
                                  onChange={(e) =>
                                    setTargetProviders((prev) => ({
                                      ...prev,
                                      [f.filename]: e.target.value,
                                    }))
                                  }
                                  className="bg-[#202027] border border-[#30303C] rounded-lg px-2 py-1 text-[11px] text-gray-200 font-medium focus:outline-none focus:border-pink-500/60 cursor-pointer"
                                >
                                  {PROVIDER_OPTIONS.map((p) => (
                                    <option key={p.id} value={p.id} className="bg-[#1A1A1E]">
                                      {p.label}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Action Button */}
                              <td className="py-3 px-3 text-right">
                                {isCompleted ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-emerald-400 bg-emerald-500/10 text-xs font-medium">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Ready
                                  </span>
                                ) : activeDl ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-pink-500/15 text-pink-400 text-[11px] font-medium font-mono">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      {activeDl.progress_pct > 0 ? `${activeDl.progress_pct}%` : "Connecting..."}
                                    </span>
                                    <div className="w-24 h-1.5 bg-[#2B2B34] rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-linear-to-r from-pink-500 to-rose-400 rounded-full transition-all duration-300"
                                        style={{ width: `${Math.max(activeDl.progress_pct, 4)}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleDownload(f)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#272730] hover:bg-pink-600 text-xs font-medium text-gray-200 hover:text-white transition-all shadow-sm cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
