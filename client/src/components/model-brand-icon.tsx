"use client";

import React from "react";
import {
  Qwen,
  Gemma,
  Google,
  DeepSeek,
  Meta,
  Mistral,
  Nvidia,
  Zhipu,
  Minimax,
  Microsoft,
  Anthropic,
  HuggingFace,
} from "@lobehub/icons";

interface ModelBrandIconProps {
  modelId?: string;
  author?: string;
  tags?: string[];
  size?: number;
  className?: string;
}

export function ModelBrandIcon({
  modelId = "",
  author = "",
  tags = [],
  size = 22,
  className = "",
}: ModelBrandIconProps) {
  const text = `${modelId} ${author} ${tags.join(" ")}`.toLowerCase();

  // Qwen
  if (text.includes("qwen")) {
    return <Qwen.Color size={size} className={className} />;
  }

  // Gemma / Google
  if (text.includes("gemma")) {
    return <Gemma.Color size={size} className={className} />;
  }
  if (text.includes("google")) {
    return <Google.Color size={size} className={className} />;
  }

  // DeepSeek
  if (text.includes("deepseek") || text.includes("r1")) {
    return <DeepSeek.Color size={size} className={className} />;
  }

  // Meta / Llama
  if (text.includes("llama") || text.includes("meta")) {
    return <Meta.Color size={size} className={className} />;
  }

  // Mistral / Mixtral
  if (text.includes("mistral") || text.includes("mixtral") || text.includes("codestral")) {
    return <Mistral.Color size={size} className={className} />;
  }

  // Nvidia / Nemotron
  if (text.includes("nvidia") || text.includes("nemotron")) {
    return <Nvidia.Color size={size} className={className} />;
  }

  // Zhipu / GLM / ChatGLM
  if (text.includes("glm") || text.includes("chatglm") || text.includes("zhipu")) {
    return <Zhipu.Color size={size} className={className} />;
  }

  // MiniMax
  if (text.includes("minimax")) {
    return <Minimax.Color size={size} className={className} />;
  }

  // Microsoft / Phi
  if (
    text.includes("phi-") ||
    text.includes("phi3") ||
    text.includes("phi4") ||
    text.includes("microsoft")
  ) {
    return <Microsoft.Color size={size} className={className} />;
  }

  // Anthropic / Claude
  if (text.includes("claude") || text.includes("anthropic")) {
    return <Anthropic size={size} className={className} />;
  }

  // Fallback: Hugging Face
  return <HuggingFace.Color size={size} className={className} />;
}

export { HuggingFace };
