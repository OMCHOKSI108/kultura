"use client";

import { useEffect, useState } from "react";
import { PixelMBare } from "./brand-logo";
import { PromptComposer } from "./prompt-composer";
import type { FileAttachment, ChatInferenceSettings } from "@/types/chat";

interface WelcomeScreenProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  onAddFile: (file: File) => void;
  onRemoveFile: (id: string) => void;
  attachments: FileAttachment[];
  disabled?: boolean;
  isGenerating?: boolean;
  isModelReady?: boolean;
  selectedModel?: string;
  settings?: ChatInferenceSettings;
  onUpdateSettings?: (newSettings: Partial<ChatInferenceSettings>) => void;
}

interface GreetingData {
  title: string;
  subtitle: string;
}

function getTimeBasedGreeting(): GreetingData {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return {
      title: "Good morning, champ.",
      subtitle: "What are we building together today?",
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      title: "Welcome, champ.",
      subtitle: "How can I help you move your ideas forward this afternoon?",
    };
  } else if (hour >= 17 && hour < 22) {
    return {
      title: "Good evening, champ.",
      subtitle: "Winding down, or just getting into the groove?",
    };
  } else {
    // 22:00 to 04:59 (Late night / night owl)
    return {
      title: "Good night owl.",
      subtitle: "Late-night inspiration strikes. What's on your mind?",
    };
  }
}

export function WelcomeScreen({
  onSend,
  onStop,
  onAddFile,
  onRemoveFile,
  attachments,
  disabled,
  isGenerating,
  isModelReady = true,
  selectedModel,
  settings,
  onUpdateSettings,
}: WelcomeScreenProps) {
  const [greeting, setGreeting] = useState<GreetingData>({
    title: "Welcome, champ.",
    subtitle: "What would you like to build today?",
  });

  useEffect(() => {
    setGreeting(getTimeBasedGreeting());
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl flex flex-col items-start gap-6">
        <PixelMBare width={44} />
        <div className="flex flex-col gap-1.5">
          <h1
            className="text-4xl leading-snug"
            style={{ fontFamily: "var(--font-serif)", color: "#F0F0F0", fontWeight: 400 }}
            suppressHydrationWarning
          >
            {greeting.title}
          </h1>
          <p className="text-sm text-zinc-400 font-sans" suppressHydrationWarning>
            {greeting.subtitle}
          </p>
        </div>
        <div className="w-full">
          <PromptComposer
            onSend={onSend}
            onStop={onStop}
            onAddFile={onAddFile}
            onRemoveFile={onRemoveFile}
            attachments={attachments}
            disabled={disabled}
            isGenerating={isGenerating}
            isModelReady={isModelReady}
            selectedModel={selectedModel}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
          />
        </div>
      </div>
    </div>
  );
}
