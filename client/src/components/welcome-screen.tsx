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
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl flex flex-col items-start gap-6">
        <PixelMBare width={44} />
        <h1
          className="text-4xl leading-snug"
          style={{ fontFamily: "var(--font-serif)", color: "#F0F0F0", fontWeight: 400 }}
        >
          Good morning. Let&apos;s build something!
        </h1>
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
