import { LlmProvider } from "@flazz/shared";
import { z } from "zod";

export type ToolExecutionMode = "full" | "disabled";

export type ModelExecutionPolicy = {
  toolExecutionMode: ToolExecutionMode;
  allowTextToolFallback: boolean;
  sanitizeTextArtifacts: boolean;
  reason?: string;
};

function getHostname(baseURL?: string) {
  if (!baseURL) return "";
  try {
    return new URL(baseURL).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function getModelExecutionPolicy(
  provider: z.infer<typeof LlmProvider>,
): ModelExecutionPolicy {
  const hostname = getHostname(provider.baseURL);

  // NVIDIA's OpenAI-compatible endpoint currently returns tool-like output
  // as text/markers for several models, which breaks Flazz's structured
  // tool-call loop. Keep those models usable in chat mode instead.
  if (hostname === "integrate.api.nvidia.com") {
    return {
      toolExecutionMode: "disabled",
      allowTextToolFallback: false,
      sanitizeTextArtifacts: true,
      reason: "nvidia-openai-compatible",
    };
  }

  switch (provider.flavor) {
    case "ollama":
    case "lmstudio":
      return {
        toolExecutionMode: "disabled",
        allowTextToolFallback: false,
        sanitizeTextArtifacts: true,
        reason: "local-openai-compatible",
      };
    case "openai-compatible":
    case "github-models":
    case "cloudflare-workers-ai":
    case "zhipuai":
    case "moonshotai":
    case "siliconflow":
    case "requesty":
      return {
        toolExecutionMode: "full",
        allowTextToolFallback: true,
        sanitizeTextArtifacts: true,
        reason: "openai-compatible-compat",
      };
    default:
      return {
        toolExecutionMode: "full",
        allowTextToolFallback: true,
        sanitizeTextArtifacts: false,
      };
  }
}
