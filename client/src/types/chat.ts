export type Role = "user" | "assistant";

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ThinkingStep {
  id: string;
  text: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: FileAttachment[];
  thinkingSteps?: ThinkingStep[];
  thinkingDuration?: number;
  isThinking?: boolean;
  isStreaming?: boolean;
  responseTimeMs?: number;
  tokenCount?: number;
  tokPerSec?: number;
  model?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messages: Message[];
}
