import type {
  ProviderStatus,
  ModelInfo,
  VramStatus,
  LoadLifecycleProgress,
  ComprehensiveHealthStatus,
} from "@/types/provider";
import type { ChatSession, Message } from "@/types/chat";
import type { HubModelSearchItem, HubModelDetails, DownloadRequestPayload, DownloadStatusItem } from "@/types/hub";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8000";

export async function fetchProviders(): Promise<ProviderStatus[]> {
  try {
    const res = await fetch(`${API_BASE}/api/providers`);
    if (!res.ok) throw new Error("Failed to fetch providers");
    return await res.json();
  } catch (e) {
    console.warn("Could not reach backend gateway:", e);
    return [];
  }
}

export async function fetchProvidersHealth(): Promise<ComprehensiveHealthStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/providers/health`);
    if (!res.ok) throw new Error("Failed to fetch provider health");
    return await res.json();
  } catch (e) {
    console.warn("Health check failed:", e);
    return null;
  }
}

export async function fetchVramStatus(): Promise<VramStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/providers/vram`);
    if (!res.ok) throw new Error("Failed to fetch VRAM status");
    return await res.json();
  } catch {
    return { total_mb: 4096, used_mb: 0, free_mb: 4096, utilization_pct: 0 };
  }
}

export async function fetchProviderModels(provider: string, signal?: AbortSignal): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/api/providers/${encodeURIComponent(provider)}/models`, { signal });
    if (!res.ok) throw new Error(`Failed to fetch models for ${provider}`);
    return await res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") return [];
    console.warn(`Could not fetch models for ${provider}:`, e);
    return [];
  }
}

export async function loadModelStream(
  provider: string,
  model: string,
  onProgress: (progress: LoadLifecycleProgress) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/providers/${encodeURIComponent(provider)}/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Failed to load model: ${res.statusText}`);
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
  await fetch(`${API_BASE}/api/providers/unload`, { method: "POST" });
}

export async function fetchSessions(): Promise<ChatSession[]> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`);
    if (!res.ok) throw new Error("Failed to fetch sessions");
    const data = await res.json();
    return data.map((s: any) => ({
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
    const res = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages`);
    if (!res.ok) throw new Error("Failed to fetch messages");
    const data = await res.json();
    return data.map((m: any) => ({
      id: m.id,
      role: m.role,
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
      model: m.model || m.metrics?.model,
      provider: m.provider || m.metrics?.provider,
      createdAt: m.created_at,
    }));
  } catch (e) {
    console.warn("Messages fetch failed:", e);
    return [];
  }
}

export async function deleteSessionApi(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export async function deleteMessageApi(messageId: string): Promise<void> {
  await fetch(`${API_BASE}/api/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
}

export async function searchHubModels(
  q?: string,
  sort: string = "downloads",
  limit: number = 24
): Promise<HubModelSearchItem[]> {
  try {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (q?.trim()) params.set("q", q.trim());
    const res = await fetch(`${API_BASE}/api/hub/search?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to search Hub models");
    return await res.json();
  } catch (e) {
    console.warn("Hub search failed:", e);
    return [];
  }
}

export async function fetchModelFiles(repoId: string): Promise<HubModelDetails | null> {
  try {
    const res = await fetch(`${API_BASE}/api/hub/models/${encodeURIComponent(repoId)}/files`);
    if (!res.ok) throw new Error("Failed to fetch model files");
    return await res.json();
  } catch (e) {
    console.warn("Hub model files fetch failed:", e);
    return null;
  }
}

export async function startModelDownload(payload: DownloadRequestPayload): Promise<DownloadStatusItem> {
  const res = await fetch(`${API_BASE}/api/hub/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start download");
  }
  return await res.json();
}

export async function cancelDownloadApi(downloadId: string): Promise<void> {
  await fetch(`${API_BASE}/api/hub/downloads/${encodeURIComponent(downloadId)}`, {
    method: "DELETE",
  });
}

export function subscribeToDownloadsStream(
  onUpdate: (downloads: DownloadStatusItem[]) => void
): () => void {
  const controller = new AbortController();

  async function connect() {
    try {
      const res = await fetch(`${API_BASE}/api/hub/downloads/stream`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;

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
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        // Reconnect after 3s on error
        setTimeout(connect, 3000);
      }
    }
  }

  connect();

  return () => {
    controller.abort();
  };
}
