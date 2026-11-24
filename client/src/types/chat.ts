export type Role = "user" | "assistant" | "system";

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  data?: string; // base64 string or data URL
}

export interface WebSource {
  index: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface ThinkingStep {
  id: string;
  text: string;
}

export interface MessageMetrics {
  provider?: string;
  model?: string;
  prompt_tokens?: number;
  thinking_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  tokens_per_sec?: number;
  ttft_ms?: number;
  total_duration_ms?: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  thinkingContent?: string;
  reasoning?: string;
  sources?: WebSource[];
  attachments?: FileAttachment[];
  thinkingSteps?: ThinkingStep[];
  thinkingDuration?: number;
  isThinking?: boolean;
  isStreaming?: boolean;
  isSearching?: boolean;
  searchNotice?: string;
  responseTimeMs?: number;
  tokenCount?: number;
  tokPerSec?: number;
  ttftMs?: number;
  thinkingTokens?: number;
  outputTokens?: number;
  model?: string;
  provider?: string;
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messages: Message[];
  provider?: string;
  model?: string;
}

export interface ChatInferenceSettings {
  system_prompt?: string | null;
  enable_thinking: boolean;
  reasoning_budget?: number | null;
  temperature: number;
  repeat_penalty: number;
  max_tokens: number;
  web_search?: boolean;
}
