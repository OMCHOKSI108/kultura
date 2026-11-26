import type {
  ProviderStatus,
  ModelInfo,
  VramStatus,
  LoadLifecycleProgress,
  ComprehensiveHealthStatus,
} from "@/types/provider";
import type { ChatSession, Message, FileAttachment, WebSource } from "@/types/chat";
import type { HubModelSearchItem, HubModelDetails, DownloadRequestPayload, DownloadStatusItem } from "@/types/hub";
import type {
  User,
  LoginResponse,
  CreateUserPayload,
  ApiKey,
  CreateApiKeyResponse,
  UserUsage,
  UpdateProfilePayload,
} from "@/types/auth";
import type {
  ObservabilityOverview,
  RequestTrace,
  UserObservabilityStat,
} from "@/types/observability";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8000";

// ── GLOBAL TYPED API ERRORS ──

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = "Unauthorized. Please log in.") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = "Forbidden: Insufficient privileges.") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

// ── CSRF & AUTHENTICATION STATE ──

let inMemoryCsrfToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function getCsrfToken(): string | null {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)kultura_csrf=([^;]*)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const csrf = getCsrfToken();
  if (csrf) {
    headers["X-CSRF-Token"] = csrf;
  }
  return headers;
}

// Compatibility helper during migration
export function getAuthToken(): string | null {
  return null;
}

// ── GLOBAL TYPED FETCH WRAPPER ──

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(
    (options.method || "GET").toUpperCase()
  );

  const defaultHeaders: Record<string, string> = {};
  if (isMutation && !(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const mergedHeaders = getAuthHeaders({
    ...defaultHeaders,
    ...((options.headers as Record<string, string>) || {}),
  });

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: mergedHeaders,
      credentials: "include", // Send HttpOnly cookie kultura_token & kultura_csrf
    });
  } catch (netErr: unknown) {
    const message = netErr instanceof Error ? netErr.message : "Network error";
    throw new ApiError(`Network connection failed: ${message}`, 0);
  }

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.message || errorDetail;
    } catch {
      // Body not JSON
    }

    if (res.status === 401) {
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      throw new UnauthorizedError(errorDetail);
    }
    if (res.status === 403) {
      // 403 must not automatically trigger logout!
      throw new ForbiddenError(errorDetail);
    }
    throw new ApiError(errorDetail, res.status);
  }

  if (res.status === 204) {
    return {} as T;
  }

  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return {} as T;
}

// ── PROVIDERS API ──

export async function fetchProviders(): Promise<ProviderStatus[]> {
  try {
    return await apiFetch<ProviderStatus[]>("/api/providers");
  } catch (e) {
    console.warn("Could not fetch providers:", e);
    return [];
  }
}

export async function fetchProvidersHealth(): Promise<ComprehensiveHealthStatus | null> {
  try {
    return await apiFetch<ComprehensiveHealthStatus>("/api/providers/health");
  } catch (e) {
    console.warn("Health check failed:", e);
    return null;
  }
}

export async function fetchVramStatus(): Promise<VramStatus> {
  try {
    return await apiFetch<VramStatus>("/api/providers/vram");
  } catch {
    return { total_mb: 4096, used_mb: 0, free_mb: 4096, utilization_pct: 0 };
  }
}

export async function fetchProviderModels(provider: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  try {
    return await apiFetch<ModelInfo[]>(`/api/providers/${encodeURIComponent(provider)}/models`, { signal });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return [];
    console.warn(`Could not fetch models for ${provider}:`, e);
    return [];
  }
}

export async function loadModelStream(
  provider: string,
  model: string,
  onProgress: (progress: LoadLifecycleProgress) => void
): Promise<void> {
  const url = `${API_BASE}/api/providers/${encodeURIComponent(provider)}/load`;
  const res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ model }),
  });

  if (!res.ok || !res.body) {
    let errDetail = res.statusText;
    try {
      const j = await res.json();
      errDetail = j.detail || errDetail;
    } catch {}
    if (res.status === 403) throw new ForbiddenError(errDetail);
    if (res.status === 401) {
      onUnauthorizedCallback?.();
      throw new UnauthorizedError(errDetail);
    }
    throw new ApiError(`Failed to load model: ${errDetail}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const chunk of lines) {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (dataLine) {
        try {
          const parsed = JSON.parse(dataLine.replace("data: ", ""));
          onProgress(parsed);
        } catch {}
      }
    }
  }
}

export async function unloadAllVram(): Promise<void> {
  await apiFetch("/api/providers/unload", { method: "POST" });
}

// ── SESSIONS & MESSAGES API ──

export interface RawSessionResponse {
  id: string;
  title: string;
  provider: string;
  model: string;
  preview: string;
  created_at: string;
  updated_at: string;
  messages_count: number;
}

export interface RawMessageResponse {
  id: string;
  session_id: string;
  role: string;
  content: string;
  thinking_content?: string;
  reasoning?: string;
  thinking_duration_ms?: number;
  attachments?: FileAttachment[];
  sources?: WebSource[];
  provider?: string;
  model?: string;
  metrics?: {
    prompt_tokens: number;
    completion_tokens: number;
    tokens_per_sec?: number;
    ttft_ms?: number;
    total_duration_ms?: number;
  };
  created_at: string;
}

export async function fetchSessions(): Promise<ChatSession[]> {
  try {
    const data = await apiFetch<RawSessionResponse[]>("/api/sessions");
    return data.map((s) => ({
      id: s.id,
      title: s.title,
      preview: s.preview || "No messages yet",
      timestamp: new Date(s.updated_at || s.created_at),
      messages: [],
      provider: s.provider,
      model: s.model,
    }));
  } catch (e) {
    console.warn("Sessions fetch failed:", e);
    return [];
  }
}

export async function fetchSessionMessages(sessionId: string): Promise<Message[]> {
  try {
    const data = await apiFetch<RawMessageResponse[]>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages`
    );
    return data.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      thinkingContent: m.thinking_content || m.reasoning,
      reasoning: m.reasoning || m.thinking_content,
      thinkingDuration: m.thinking_duration_ms,
      attachments: m.attachments || [],
      sources: m.sources || [],
      tokenCount: m.metrics?.completion_tokens,
      tokPerSec: m.metrics?.tokens_per_sec,
      ttftMs: m.metrics?.ttft_ms,
      responseTimeMs: m.metrics?.total_duration_ms,
      model: m.model,
      provider: m.provider,
      createdAt: m.created_at,
    }));
  } catch (e) {
    console.warn("Messages fetch failed:", e);
    return [];
  }
}

export async function deleteSessionApi(sessionId: string): Promise<void> {
  await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function deleteMessageApi(messageId: string): Promise<void> {
  await apiFetch(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

// ── HUB & DOWNLOADS API ──

export async function searchHubModels(
  q?: string,
  sort: string = "downloads",
  limit: number = 24,
  category?: string
): Promise<HubModelSearchItem[]> {
  try {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (q?.trim()) params.set("q", q.trim());
    if (category && category !== "all") params.set("category", category);
    return await apiFetch<HubModelSearchItem[]>(`/api/hub/search?${params.toString()}`);
  } catch (e) {
    console.warn("Hub search failed:", e);
    return [];
  }
}

export async function fetchModelFiles(repoId: string): Promise<HubModelDetails | null> {
  try {
    return await apiFetch<HubModelDetails>(`/api/hub/models/${encodeURIComponent(repoId)}/files`);
  } catch (e) {
    console.warn("Hub model files fetch failed:", e);
    return null;
  }
}

export async function startModelDownload(payload: DownloadRequestPayload): Promise<DownloadStatusItem> {
  return await apiFetch<DownloadStatusItem>("/api/hub/download", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelDownloadApi(downloadId: string): Promise<void> {
  await apiFetch(`/api/hub/downloads/${encodeURIComponent(downloadId)}`, {
    method: "DELETE",
  });
}

export function subscribeToDownloadsStream(
  onUpdate: (downloads: DownloadStatusItem[]) => void
): () => void {
  const controller = new AbortController();
  let reconnectTimer: NodeJS.Timeout | null = null;

  async function connect() {
    if (controller.signal.aborted) return;
    try {
      const res = await fetch(`${API_BASE}/api/hub/downloads/stream`, {
        signal: controller.signal,
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        if (!controller.signal.aborted) {
          reconnectTimer = setTimeout(connect, 3000);
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine.replace("data: ", ""));
              onUpdate(parsed);
            } catch {}
          }
        }
      }

      if (!controller.signal.aborted) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError" && !controller.signal.aborted) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    }
  }

  connect();

  return () => {
    controller.abort();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}

// ── AUTHENTICATION & USER MANAGEMENT API ──

export async function loginApi(username_or_email: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username_or_email, password }),
  });
  if (data.csrf_token) {
    setCsrfToken(data.csrf_token);
  }
  return data;
}

export async function fetchMeApi(): Promise<User | null> {
  try {
    return await apiFetch<User>("/api/auth/me");
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return null;
    }
    console.warn("fetchMe failed:", e);
    return null;
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", {
      method: "POST",
    });
  } catch {
    // Ignore network errors on logout
  }
  setCsrfToken(null);
}

export async function fetchUsersApi(): Promise<User[]> {
  return await apiFetch<User[]>("/api/auth/users");
}

export async function createUserApi(payload: CreateUserPayload): Promise<User> {
  return await apiFetch<User>("/api/auth/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteUserApi(userId: string): Promise<void> {
  await apiFetch(`/api/auth/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function updateUserPasswordApi(userId: string, newPassword: string): Promise<void> {
  await apiFetch(`/api/auth/users/${encodeURIComponent(userId)}/password`, {
    method: "PATCH",
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function toggleUserStatusApi(userId: string, is_active: boolean): Promise<User> {
  return await apiFetch<User>(`/api/auth/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ is_active }),
  });
}

export async function updateUserProfileApi(payload: UpdateProfilePayload): Promise<User> {
  return await apiFetch<User>("/api/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchMyUsageApi(): Promise<UserUsage> {
  return await apiFetch<UserUsage>("/api/auth/me/usage");
}

// ── USER API KEYS (FOR CODING AGENTS) ──

export async function fetchApiKeysApi(): Promise<ApiKey[]> {
  return await apiFetch<ApiKey[]>("/api/auth/api-keys");
}

export async function createApiKeyApi(name: string): Promise<CreateApiKeyResponse> {
  return await apiFetch<CreateApiKeyResponse>("/api/auth/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiKeyApi(keyId: string): Promise<void> {
  await apiFetch(`/api/auth/api-keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
  });
}

// ── OBSERVABILITY TELEMETRY (ADMIN ONLY) ──

export async function fetchObservabilityOverview(window: string = "60m"): Promise<ObservabilityOverview> {
  return await apiFetch<ObservabilityOverview>(
    `/api/observability/overview?window=${encodeURIComponent(window)}`
  );
}

export async function fetchObservabilityTraces(
  limit: number = 30,
  intent?: string,
  statusFilter?: string
): Promise<RequestTrace[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (intent) params.set("intent", intent);
  if (statusFilter) params.set("status_filter", statusFilter);

  return await apiFetch<RequestTrace[]>(`/api/observability/traces?${params.toString()}`);
}

export async function fetchObservabilityUserStats(): Promise<UserObservabilityStat[]> {
  return await apiFetch<UserObservabilityStat[]>("/api/observability/user-stats");
}
