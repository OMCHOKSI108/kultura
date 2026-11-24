export interface ProviderStatus {
  name: string;
  display_name: string;
  status: "running" | "standby" | "offline";
  is_container: boolean;
  container_running: boolean;
  active_model?: string | null;
  base_url: string;
  models_count: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size_bytes?: number;
  format?: string;
  mmproj?: string | null;
  is_active: boolean;
}

export interface VramStatus {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  utilization_pct: number;
  active_provider?: string | null;
  active_model?: string | null;
}

export interface LoadLifecycleProgress {
  step: "stopping_previous" | "starting_container" | "loading_weights_to_vram" | "ready" | "warning" | "error";
  message: string;
  provider?: string;
  model?: string;
}

export interface ComprehensiveHealthStatus {
  status: "healthy" | "degraded" | "down";
  online_count: number;
  total_count: number;
  vram: VramStatus;
  providers: ProviderStatus[];
}

