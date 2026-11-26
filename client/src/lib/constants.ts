/**
 * Kultura Unified Client Constants
 * Centralized constants for themes, views, coding agents, and observability.
 */

export const THEME_DARK = "dark";
export const THEME_LIGHT = "light";

export type Theme = typeof THEME_DARK | typeof THEME_LIGHT;

export const VIEWS = {
  CHAT: "chat",
  HUB: "hub",
  USERS: "users",
  OBSERVABILITY: "observability",
  SETTINGS: "settings",
} as const;

export type ActiveView = (typeof VIEWS)[keyof typeof VIEWS];

export const WINDOW_60M = "60m";
export const WINDOW_24H = "24h";
export const WINDOW_7D = "7d";

export const TIME_RANGES = [
  { label: "Last 60 minutes", value: WINDOW_60M },
  { label: "Last 24 hours", value: WINDOW_24H },
  { label: "Last 7 days", value: WINDOW_7D },
] as const;

export const REFRESH_10S = 10000;
export const REFRESH_30S = 30000;
export const REFRESH_60S = 60000;
export const REFRESH_OFF = 0;

export const AUTO_REFRESH_INTERVALS = [
  { label: "Refresh 10s", value: REFRESH_10S },
  { label: "Refresh 30s", value: REFRESH_30S },
  { label: "Refresh 60s", value: REFRESH_60S },
  { label: "Off", value: REFRESH_OFF },
] as const;

export const SLO_LATENCY_SECONDS = 3.0;

export const HUB_CATEGORIES = [
  { id: "all", label: "All Models" },
  { id: "text-generation", label: "LLM & Chat" },
  { id: "code", label: "Code & Reasoning" },
  { id: "image", label: "Vision & Image" },
  { id: "audio", label: "Audio & Voice" },
  { id: "video", label: "Video" },
] as const;

export interface CodingAgentConfig {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  endpoint: string;
  snippet: string;
}

export const CODING_AGENT_CONFIGS: CodingAgentConfig[] = [
  {
    id: "cursor",
    name: "Cursor IDE",
    description: "OpenAI-compatible local inference inside Cursor's Composer and Agent",
    defaultModel: "qwen3.5:4b",
    endpoint: "http://localhost:8000/v1",
    snippet: `// Cursor Settings -> Models -> OpenAI API Key
// Key: kult_live_YOUR_KEY
// Override OpenAI Base URL:
http://localhost:8000/v1

// Models: qwen3.5:4b, deepseek-r1:7b, qwen2.5-coder:7b`,
  },
  {
    id: "claude-code",
    name: "Claude Code CLI",
    description: "Point terminal coding assistant to local Kultura inference",
    defaultModel: "qwen3.5:4b",
    endpoint: "http://localhost:8000/v1",
    snippet: `# In your shell ~/.zshrc or ~/.bashrc:
export OPENAI_BASE_URL="http://localhost:8000/v1"
export OPENAI_API_KEY="kult_live_YOUR_KEY"

# Or run with local flag:
claude --openai-base-url="http://localhost:8000/v1"`,
  },
  {
    id: "cline",
    name: "Cline / Roo Code",
    description: "Autonomous VS Code coding agent configured with OpenAI-compatible API",
    defaultModel: "qwen3.5:4b",
    endpoint: "http://localhost:8000/v1",
    snippet: `API Provider: OpenAI Compatible
Base URL: http://localhost:8000/v1
API Key: kult_live_YOUR_KEY
Model ID: qwen3.5:4b`,
  },
  {
    id: "continue",
    name: "Continue.dev",
    description: "Open-source AI code assistant in VS Code and JetBrains",
    defaultModel: "qwen3.5:4b",
    endpoint: "http://localhost:8000/v1",
    snippet: `// In ~/.continue/config.json:
{
  "models": [
    {
      "title": "Kultura Local",
      "provider": "openai",
      "model": "qwen3.5:4b",
      "apiBase": "http://localhost:8000/v1",
      "apiKey": "kult_live_YOUR_KEY"
    }
  ]
}`,
  },
  {
    id: "aider",
    name: "Aider",
    description: "Command line AI pair programming in git repositories",
    defaultModel: "qwen3.5:4b",
    endpoint: "http://localhost:8000/v1",
    snippet: `aider --openai-api-base http://localhost:8000/v1 \\
      --openai-api-key kult_live_YOUR_KEY \\
      --model openai/qwen3.5:4b`,
  },
];
