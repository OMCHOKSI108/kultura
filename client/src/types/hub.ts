export interface HubModelSearchItem {
  id: string;
  author: string;
  name: string;
  downloads: number;
  likes: number;
  tags: string[];
  architecture?: string | null;
  context_length?: number | null;
  total_params?: number | null;
  total_params_formatted?: string | null;
  param_size_b?: number | null;
  gguf_count: number;
  last_modified?: string | null;
  description?: string | null;
  pipeline_tag?: string | null;
}

export interface HubModelFile {
  filename: string;
  size_bytes: number;
  size_formatted: string;
  quant: string;
  vram_estimate_mb: number;
  vram_fit: "fits" | "tight" | "too_large";
  download_url: string;
}

export interface HubModelDetails {
  id: string;
  author: string;
  name: string;
  files: HubModelFile[];
}

export interface DownloadRequestPayload {
  repo_id: string;
  filename: string;
  quant: string;
  provider: "ollama" | "llamacpp" | "llama.cpp" | "koboldcpp" | "lmstudio" | "jan";
}

export interface DownloadStatusItem {
  download_id: string;
  repo_id: string;
  filename: string;
  quant: string;
  provider: string;
  bytes_downloaded: number;
  total_bytes: number;
  progress_pct: number;
  speed_mbps: number;
  eta_seconds?: number | null;
  status: "pending" | "downloading" | "completed" | "failed" | "cancelled";
  error?: string | null;
}
