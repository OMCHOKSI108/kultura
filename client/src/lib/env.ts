export const env = {
  serverUrl: process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:8000",
  clientUrl: process.env.NEXT_PUBLIC_CLIENT_URL ?? "http://localhost:3000",
};

export function getConnectionStatus(): "connected" | "disconnected" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  return env.serverUrl ? "disconnected" : "unknown";
}

export function getServerDisplayUrl(): string {
  try {
    const url = new URL(env.serverUrl);
    return `${url.hostname}:${url.port || 80}`;
  } catch {
    return env.serverUrl;
  }
}
