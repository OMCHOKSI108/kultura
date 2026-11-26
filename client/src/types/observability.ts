export interface TrafficPoint {
  time: string;
  requests: number;
  rate: number;
}

export interface LatencyPoint {
  time: string;
  p50: number;
  p95: number;
  slo: number;
}

export interface ServiceHealthItem {
  name: string;
  p95_ms: number;
  status: string;
  badge: "emerald" | "amber" | "red";
}

export interface RetrievalQuality {
  no_result_rate_pct: number;
  top_k: number;
  p95_retrieval_ms: number;
}

export interface ObservabilitySummary {
  requests: number;
  requests_change_pct: number;
  request_rate: number;
  peak_rate: number;
  p95_latency_s: number;
  slo_target_s: number;
  error_rate_pct: number;
  failed_requests: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  llm_spend_usd: number;
}

export interface Sparklines {
  requests: number[];
  rate: number[];
  p95: number[];
  errors: number[];
}

export interface ObservabilityOverview {
  summary: ObservabilitySummary;
  sparklines: Sparklines;
  charts: {
    traffic: TrafficPoint[];
    latency: LatencyPoint[];
  };
  service_health: ServiceHealthItem[];
  retrieval_quality: RetrievalQuality;
}

export interface RequestTrace {
  id: string;
  trace_id: string;
  created_at: string;
  model: string;
  intent: string;
  latency_ms: number;
  ttft_ms?: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  thinking_tokens: number;
  total_tokens: number;
  status: string;
  error_message?: string | null;
  user_id?: string | null;
  username?: string | null;
  meta_info?: Record<string, any>;
}

export interface UserObservabilityStat {
  user_id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  requests_count: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  active_keys_count: number;
  sessions_count: number;
  created_at: string;
}
