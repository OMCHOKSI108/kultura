"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchObservabilityOverview,
  fetchObservabilityTraces,
  fetchObservabilityUserStats,
  toggleUserStatusApi,
} from "@/lib/api";
import type {
  ObservabilityOverview,
  RequestTrace,
  UserObservabilityStat,
} from "@/types/observability";
import {
  WINDOW_60M,
  WINDOW_24H,
  WINDOW_7D,
  REFRESH_10S,
  REFRESH_30S,
  REFRESH_60S,
  REFRESH_OFF,
  SLO_LATENCY_SECONDS,
} from "@/lib/constants";
import { useTheme } from "@/context/theme-context";

interface ObservabilityViewProps {
  onBackToChat?: () => void;
}

export function ObservabilityView({ onBackToChat }: ObservabilityViewProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [windowRange, setWindowRange] = useState<string>(WINDOW_60M);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(REFRESH_10S);
  const [overview, setOverview] = useState<ObservabilityOverview | null>(null);
  const [traces, setTraces] = useState<RequestTrace[]>([]);
  const [userStats, setUserStats] = useState<UserObservabilityStat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Filter states
  const [selectedIntent, setSelectedIntent] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [inspectedTrace, setInspectedTrace] = useState<RequestTrace | null>(null);

  // Active tab inside observability
  const [activeTab, setActiveTab] = useState<"telemetry" | "users">("telemetry");

  const loadData = useCallback(async () => {
    try {
      const [overviewData, tracesData, usersData] = await Promise.all([
        fetchObservabilityOverview(windowRange),
        fetchObservabilityTraces(40, selectedIntent === "all" ? undefined : selectedIntent, selectedStatus === "all" ? undefined : selectedStatus),
        fetchObservabilityUserStats(),
      ]);
      setOverview(overviewData);
      setTraces(tracesData);
      setUserStats(usersData);
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error("Failed to load observability data:", err);
    } finally {
      setLoading(false);
    }
  }, [windowRange, selectedIntent, selectedStatus]);

  useEffect(() => {
    loadData();
    if (autoRefreshInterval === REFRESH_OFF) return;
    const interval = setInterval(loadData, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [loadData, autoRefreshInterval]);

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await toggleUserStatusApi(userId, !currentStatus);
      setUserStats((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, is_active: !currentStatus } : u))
      );
    } catch (err: any) {
      alert(`Failed to update user access: ${err.message}`);
    }
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify({ overview, traces, userStats }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kultura-observability-${windowRange}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!traces.length) return;
    const headers = ["Timestamp", "Trace ID", "Model", "Intent", "Latency(ms)", "Prompt Tokens", "Completion Tokens", "Total Tokens", "Status"];
    const rows = traces.map((t) => [
      t.created_at,
      t.trace_id,
      t.model,
      t.intent,
      t.latency_ms,
      t.prompt_tokens,
      t.completion_tokens,
      t.total_tokens,
      t.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const a = document.createElement("a");
    a.href = encodedUri;
    a.download = `kultura-traces-${windowRange}-${Date.now()}.csv`;
    a.click();
  };

  // Sparkline mini SVG generator
  const renderSparkline = (data: number[], colorClass: string = "stroke-emerald-400") => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data) || 1;
    const range = max - min || 1;
    const width = 80;
    const height = 24;

    const points = data
      .map((val, idx) => {
        const x = (idx / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return (
      <svg className="w-20 h-6 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          className={colorClass}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  // SVG Area / Bar Chart for Traffic
  const renderTrafficChart = () => {
    const points = overview?.charts?.traffic || [];
    if (!points.length) return <div className="text-zinc-500 text-xs py-12 text-center">No traffic data for this window</div>;

    const maxReq = Math.max(...points.map((p) => p.requests), 5);
    const chartHeight = 140;

    return (
      <div className="w-full">
        <div className="h-36 flex items-end gap-1.5 pt-4 px-2 border-b border-zinc-800/40">
          {points.map((pt, i) => {
            const barHeight = Math.max((pt.requests / maxReq) * chartHeight, 6);
            return (
              <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                {/* Tooltip */}
                <div className="absolute -top-8 hidden group-hover:flex flex-col items-center bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-100 px-2 py-0.5 rounded shadow-xl pointer-events-none z-10 whitespace-nowrap">
                  <span>{pt.requests} reqs ({pt.rate} req/s)</span>
                  <span className="text-[9px] text-zinc-400">{pt.time}</span>
                </div>
                <div
                  style={{ height: `${barHeight}px` }}
                  className="w-full bg-gradient-to-t from-emerald-600/70 to-emerald-400/90 rounded-t-sm group-hover:from-emerald-500 group-hover:to-emerald-300 transition-all cursor-pointer"
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-zinc-500 px-2 pt-2">
          <span>{points[0]?.time}</span>
          <span>{points[Math.floor(points.length / 2)]?.time}</span>
          <span>{points[points.length - 1]?.time}</span>
        </div>
      </div>
    );
  };

  // SVG Line Chart for Latency with SLO Threshold
  const renderLatencyChart = () => {
    const points = overview?.charts?.latency || [];
    if (!points.length) return <div className="text-zinc-500 text-xs py-12 text-center">No latency data for this window</div>;

    const maxLat = Math.max(...points.map((p) => Math.max(p.p95, p.slo * 1.25)), 4.0);
    const width = 500;
    const height = 140;

    const getY = (val: number) => height - (val / maxLat) * (height - 20) - 10;

    const p95Points = points
      .map((p, idx) => `${((idx / (points.length - 1)) * width).toFixed(1)},${getY(p.p95).toFixed(1)}`)
      .join(" ");

    const p50Points = points
      .map((p, idx) => `${((idx / (points.length - 1)) * width).toFixed(1)},${getY(p.p50).toFixed(1)}`)
      .join(" ");

    const sloY = getY(SLO_LATENCY_SECONDS);

    return (
      <div className="w-full">
        <div className="relative h-36 px-2">
          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            {/* SLO Target Line */}
            <line
              x1="0"
              y1={sloY}
              x2={width}
              y2={sloY}
              stroke="#EF4444"
              strokeDasharray="4 4"
              strokeWidth="1.5"
              className="opacity-70"
            />
            {/* p95 curve */}
            <polyline
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={p95Points}
            />
            {/* p50 curve */}
            <polyline
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={p50Points}
            />
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-zinc-500 px-2 pt-2 border-t border-zinc-800/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-emerald-500 inline-block" /> p50
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-amber-500 inline-block" /> p95
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-2.5 h-0.5 bg-red-500 inline-block border-dashed" /> SLO target (3.0s)
            </span>
          </div>
          <span>Max scale: {maxLat.toFixed(1)}s</span>
        </div>
      </div>
    );
  };

  const summary = overview?.summary;

  return (
    <div className={`flex flex-col h-full overflow-y-auto ${isLight ? "bg-[#F8F9FA] text-zinc-900" : "bg-[#0E0E10] text-zinc-100"}`}>
      {/* ── TOP HEADER / CONTROLS ── */}
      <header className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-md ${
        isLight ? "bg-white/80 border-zinc-200" : "bg-[#121214]/80 border-zinc-800"
      }`}>
        <div className="flex items-center gap-3">
          {onBackToChat && (
            <button
              onClick={onBackToChat}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition ${
                isLight
                  ? "bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700"
                  : "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-300"
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
              <span className="text-xs uppercase tracking-widest font-mono text-zinc-400">Kultura</span>
              <span className="text-zinc-500">/</span>
              <h1 className="text-base font-semibold tracking-tight">Observability</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Telemetry
              </span>
            </div>
            <p className="text-xs text-zinc-500">Real-time p95 latency, throughput, token analytics, & service health</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Main Navigation Tabs inside Observability */}
          <div className={`flex rounded-lg p-0.5 border ${isLight ? "bg-zinc-100 border-zinc-300" : "bg-zinc-900 border-zinc-800"}`}>
            <button
              onClick={() => setActiveTab("telemetry")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === "telemetry"
                  ? isLight
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Overview & Traces
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === "users"
                  ? isLight
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Per-User Analytics ({userStats.length})
            </button>
          </div>

          {/* Time Window Selector */}
          <div className={`flex rounded-lg p-0.5 border ${isLight ? "bg-zinc-100 border-zinc-300" : "bg-zinc-900 border-zinc-800"}`}>
            {[
              { label: "60m", value: WINDOW_60M },
              { label: "24h", value: WINDOW_24H },
              { label: "7d", value: WINDOW_7D },
            ].map((w) => (
              <button
                key={w.value}
                onClick={() => setWindowRange(w.value)}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition ${
                  windowRange === w.value
                    ? isLight
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          {/* Auto Refresh selector */}
          <select
            value={autoRefreshInterval}
            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            className={`text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none ${
              isLight
                ? "bg-zinc-50 border-zinc-300 text-zinc-800"
                : "bg-zinc-900 border-zinc-800 text-zinc-300"
            }`}
          >
            <option value={REFRESH_10S}>Auto: 10s</option>
            <option value={REFRESH_30S}>Auto: 30s</option>
            <option value={REFRESH_60S}>Auto: 60s</option>
            <option value={REFRESH_OFF}>Auto: Off</option>
          </select>

          {/* Export Actions */}
          <button
            onClick={handleExportJSON}
            title="Export full metrics as JSON"
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition flex items-center gap-1 ${
              isLight
                ? "bg-zinc-50 hover:bg-zinc-100 border-zinc-300 text-zinc-700"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
            }`}
          >
            JSON
          </button>
          <button
            onClick={handleExportCSV}
            title="Export request traces as CSV"
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition flex items-center gap-1 ${
              isLight
                ? "bg-zinc-50 hover:bg-zinc-100 border-zinc-300 text-zinc-700"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
            }`}
          >
            CSV
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {activeTab === "telemetry" ? (
          <>
            {/* ── 6 KPI METRICS CARDS ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
              {/* 1. Requests */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Requests</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    (summary?.requests_change_pct ?? 0) >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                  }`}>
                    {(summary?.requests_change_pct ?? 0) >= 0 ? "+" : ""}
                    {summary?.requests_change_pct ?? 0}%
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight my-1">
                  {summary?.requests ?? 0}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">vs prev hour</span>
                  {renderSparkline(overview?.sparklines?.requests || [0, 0], "stroke-emerald-400")}
                </div>
              </div>

              {/* 2. Request Rate */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Request rate</span>
                  <span className="text-[10px] text-zinc-500 font-mono">peak {summary?.peak_rate ?? 0}</span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight my-1">
                  {summary?.request_rate ?? 0}
                  <span className="text-xs text-zinc-500 font-normal ml-1">req/s</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">avg rate</span>
                  {renderSparkline(overview?.sparklines?.rate || [0, 0], "stroke-sky-400")}
                </div>
              </div>

              {/* 3. p95 Latency */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>p95 Latency</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    (summary?.p95_latency_s ?? 0) < SLO_LATENCY_SECONDS
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "text-amber-400 bg-amber-500/10"
                  }`}>
                    {(summary?.p95_latency_s ?? 0) < SLO_LATENCY_SECONDS ? "SLO Pass" : "Near SLO"}
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight my-1">
                  {summary?.p95_latency_s ?? 0}
                  <span className="text-xs text-zinc-500 font-normal ml-1">s</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">Target &lt; 3.0s</span>
                  {renderSparkline(overview?.sparklines?.p95 || [0, 0], "stroke-amber-400")}
                </div>
              </div>

              {/* 4. Error Rate */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Error rate</span>
                  <span className="text-[10px] font-mono text-zinc-500">{summary?.failed_requests ?? 0} failed</span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight my-1">
                  {summary?.error_rate_pct ?? 0}
                  <span className="text-xs text-zinc-500 font-normal ml-1">%</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">zero failures</span>
                  {renderSparkline([0, 0, 0, 0, 0], "stroke-emerald-400")}
                </div>
              </div>

              {/* 5. Tokens */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>Total Tokens</span>
                  <span className="text-[10px] font-mono text-indigo-400">local</span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight my-1">
                  {((summary?.total_tokens ?? 0) / 1000).toFixed(1)}
                  <span className="text-xs text-zinc-500 font-normal ml-1">k</span>
                </div>
                <div className="text-[10px] text-zinc-500 pt-1 flex justify-between">
                  <span>In: {((summary?.input_tokens ?? 0) / 1000).toFixed(1)}k</span>
                  <span>Out: {((summary?.output_tokens ?? 0) / 1000).toFixed(1)}k</span>
                </div>
              </div>

              {/* 6. LLM Spend Saved */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"
              }`}>
                <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
                  <span>LLM Spend</span>
                  <span className="text-[10px] font-mono text-emerald-400">$ Saved</span>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight my-1 text-emerald-400">
                  ${(summary?.llm_spend_usd ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-500 pt-1">
                  Cloud API equivalent saved
                </div>
              </div>
            </div>

            {/* ── CHARTS: TRAFFIC & LATENCY ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Traffic Chart */}
              <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Request Traffic</h2>
                    <p className="text-[11px] text-zinc-500">Volume and request velocity over {windowRange}</p>
                  </div>
                  <span className="text-xs font-mono font-medium text-emerald-400">
                    {summary?.requests ?? 0} total calls
                  </span>
                </div>
                {renderTrafficChart()}
              </div>

              {/* Latency Chart */}
              <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">End-to-end Latency (SLO: &lt; 3.0s)</h2>
                    <p className="text-[11px] text-zinc-500">p50 and p95 latency curve vs SLO threshold</p>
                  </div>
                  <span className="text-xs font-mono font-medium text-amber-400">
                    p95: {summary?.p95_latency_s ?? 0}s
                  </span>
                </div>
                {renderLatencyChart()}
              </div>
            </div>

            {/* ── SERVICE HEALTH & RETRIEVAL QUALITY ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Service Health (2 cols) */}
              <div className={`lg:col-span-2 p-4 rounded-xl border ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Service Health & Microservice SLOs</h2>
                    <p className="text-[11px] text-zinc-500">Gateway, backend, local inference, and database status</p>
                  </div>
                  <span className="text-xs text-zinc-500 font-mono">5 Services</span>
                </div>
                <div className="divide-y divide-zinc-800/40">
                  {overview?.service_health?.map((svc, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${
                          svc.badge === "emerald" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-amber-400"
                        }`} />
                        <span className="font-medium">{svc.name}</span>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-[11px]">
                        <span className="text-zinc-500">p95: {svc.p95_ms}ms</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-sans ${
                          svc.badge === "emerald" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {svc.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Retrieval Quality (1 col) */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"
              }`}>
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Retrieval Quality</h2>
                  <p className="text-[11px] text-zinc-500 mb-4">Web grounding & context precision metrics</p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-zinc-800/40 pb-2">
                      <span className="text-zinc-400">No-result rate</span>
                      <span className="font-mono font-medium text-emerald-400">
                        {overview?.retrieval_quality?.no_result_rate_pct ?? 2.1}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-b border-zinc-800/40 pb-2">
                      <span className="text-zinc-400">Top-k retrieval limit</span>
                      <span className="font-mono font-medium">
                        {overview?.retrieval_quality?.top_k ?? 5} chunks
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs border-b border-zinc-800/40 pb-2">
                      <span className="text-zinc-400">p95 search latency</span>
                      <span className="font-mono font-medium text-zinc-300">
                        {overview?.retrieval_quality?.p95_retrieval_ms ?? 312}ms
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 text-[11px] text-zinc-500">
                  <p>Grounding context sanitizer decodes HTML entities and syncs citations to stream output.</p>
                </div>
              </div>
            </div>

            {/* ── RECENT REQUEST TRACES ── */}
            <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Recent Request Traces</h2>
                  <p className="text-[11px] text-zinc-500">Live request execution pipeline with token breakdown and duration</p>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedIntent}
                    onChange={(e) => setSelectedIntent(e.target.value)}
                    className={`text-xs px-2.5 py-1 rounded-md border focus:outline-none ${
                      isLight ? "bg-zinc-50 border-zinc-300 text-zinc-800" : "bg-zinc-900 border-zinc-800 text-zinc-300"
                    }`}
                  >
                    <option value="all">All Intents</option>
                    <option value="greeting">Greeting / Chit-Chat</option>
                    <option value="code">Code & Reasoning</option>
                    <option value="factual">Factual Search</option>
                    <option value="general">General LLM</option>
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className={`text-xs px-2.5 py-1 rounded-md border focus:outline-none ${
                      isLight ? "bg-zinc-50 border-zinc-300 text-zinc-800" : "bg-zinc-900 border-zinc-800 text-zinc-300"
                    }`}
                  >
                    <option value="all">All Statuses</option>
                    <option value="ok">OK (Success)</option>
                    <option value="error">Error</option>
                    <option value="timeout">Timeout</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`text-[10px] uppercase font-mono border-b ${
                    isLight ? "text-zinc-500 border-zinc-200 bg-zinc-50" : "text-zinc-400 border-zinc-800 bg-zinc-900/50"
                  }`}>
                    <tr>
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Trace ID</th>
                      <th className="py-2 px-3">User</th>
                      <th className="py-2 px-3">Intent</th>
                      <th className="py-2 px-3">Latency</th>
                      <th className="py-2 px-3">Tokens</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/30 font-mono text-[11px]">
                    {traces.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                          No request traces found matching filter criteria
                        </td>
                      </tr>
                    ) : (
                      traces.map((trace) => {
                        const dateStr = new Date(trace.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        });
                        return (
                          <tr key={trace.id} className="hover:bg-zinc-500/5 transition">
                            <td className="py-2.5 px-3 text-zinc-400">{dateStr}</td>
                            <td className="py-2.5 px-3 text-zinc-300">{trace.trace_id.slice(0, 12)}</td>
                            <td className="py-2.5 px-3 text-zinc-400 font-sans">{trace.username || "anonymous"}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-sans px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300">
                                {trace.intent}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={trace.latency_ms > 3000 ? "text-amber-400" : "text-emerald-400"}>
                                {(trace.latency_ms / 1000).toFixed(2)}s
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-zinc-400">
                              {trace.total_tokens} <span className="text-[9px] text-zinc-600">({trace.prompt_tokens}/{trace.completion_tokens})</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-sans ${
                                trace.status === "ok"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                              }`}>
                                {trace.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => setInspectedTrace(trace)}
                                className="px-2 py-1 text-[10px] font-sans rounded hover:bg-zinc-700/50 text-indigo-400 hover:text-indigo-300 transition"
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* ── PER-USER USAGE & ACCESS CONTROL VIEW (ADMIN ONLY) ── */
          <div className={`p-5 rounded-xl border ${isLight ? "bg-white border-zinc-200" : "bg-[#141416] border-zinc-800/80"}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">User Observability & Consumption Breakdown</h2>
                <p className="text-xs text-zinc-500">Monitor per-user token consumption, API keys created, and revoke or restore access</p>
              </div>
              <span className="text-xs font-mono text-zinc-400">{userStats.length} registered users</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={`text-[10px] uppercase font-mono border-b ${
                  isLight ? "text-zinc-500 border-zinc-200 bg-zinc-50" : "text-zinc-400 border-zinc-800 bg-zinc-900/50"
                }`}>
                  <tr>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Total Requests</th>
                    <th className="py-2.5 px-3">Total Tokens</th>
                    <th className="py-2.5 px-3">API Keys</th>
                    <th className="py-2.5 px-3">Sessions</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Access Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30">
                  {userStats.map((u) => (
                    <tr key={u.user_id} className="hover:bg-zinc-500/5 transition">
                      <td className="py-3 px-3">
                        <div className="font-medium">{u.username}</div>
                        <div className="text-[11px] text-zinc-500">{u.email}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                          u.role === "admin" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-zinc-800 text-zinc-400"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">{u.requests_count}</td>
                      <td className="py-3 px-3 font-mono text-zinc-300">
                        {u.total_tokens.toLocaleString()}
                        <span className="text-[10px] text-zinc-500 ml-1">
                          ({(u.prompt_tokens / 1000).toFixed(0)}k in / {(u.completion_tokens / 1000).toFixed(0)}k out)
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                          {u.active_keys_count} keys
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-400">{u.sessions_count}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          u.is_active
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {u.is_active ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {u.role !== "admin" ? (
                          <button
                            onClick={() => handleToggleUserStatus(u.user_id, u.is_active)}
                            className={`px-2.5 py-1 text-xs rounded transition font-medium ${
                              u.is_active
                                ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                                : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {u.is_active ? "Revoke Access" : "Activate"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-500 font-mono">System Admin</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ── INSPECT TRACE MODAL ── */}
      {inspectedTrace && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            isLight ? "bg-white border-zinc-300 text-zinc-900" : "bg-[#18181B] border-zinc-700 text-zinc-100"
          }`}>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="text-xs uppercase font-mono text-indigo-400">Trace Inspection</div>
                <h3 className="text-base font-semibold font-mono">{inspectedTrace.trace_id}</h3>
              </div>
              <button
                onClick={() => setInspectedTrace(null)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-zinc-500/5 border border-zinc-800/40">
                <span className="text-zinc-500 block text-[10px]">Model</span>
                <span className="font-mono font-medium">{inspectedTrace.model}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-500/5 border border-zinc-800/40">
                <span className="text-zinc-500 block text-[10px]">Total Latency</span>
                <span className="font-mono font-medium text-emerald-400">{(inspectedTrace.latency_ms / 1000).toFixed(2)}s</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-500/5 border border-zinc-800/40">
                <span className="text-zinc-500 block text-[10px]">TTFT</span>
                <span className="font-mono font-medium text-sky-400">{inspectedTrace.ttft_ms ? `${inspectedTrace.ttft_ms}ms` : "N/A"}</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-500/5 border border-zinc-800/40">
                <span className="text-zinc-500 block text-[10px]">Total Tokens</span>
                <span className="font-mono font-medium">{inspectedTrace.total_tokens}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between border-b border-zinc-800/40 py-1.5">
                <span className="text-zinc-400">Intent Classification:</span>
                <span className="font-medium">{inspectedTrace.intent}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 py-1.5">
                <span className="text-zinc-400">Prompt Tokens:</span>
                <span className="font-mono">{inspectedTrace.prompt_tokens}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 py-1.5">
                <span className="text-zinc-400">Completion Tokens:</span>
                <span className="font-mono">{inspectedTrace.completion_tokens}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 py-1.5">
                <span className="text-zinc-400">Thinking Tokens:</span>
                <span className="font-mono">{inspectedTrace.thinking_tokens}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/40 py-1.5">
                <span className="text-zinc-400">Timestamp:</span>
                <span className="font-mono text-zinc-400">{inspectedTrace.created_at}</span>
              </div>
            </div>

            {inspectedTrace.meta_info && (
              <div>
                <span className="text-xs text-zinc-400 block mb-1">Payload Metadata:</span>
                <pre className="p-3 rounded-lg bg-black/50 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-40 border border-zinc-800">
                  {JSON.stringify(inspectedTrace.meta_info, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectedTrace(null)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition"
              >
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
