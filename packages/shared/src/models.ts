import { z } from "zod";

export const llmProviderFlavors = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "aigateway",
  "ollama",
  "openai-compatible",
  "deepseek",
  "groq",
  "mistral",
  "xai",
  "togetherai",
  "perplexity",
  "azure",
  "amazon-bedrock",
  "cohere",
  "google-vertex",
  "fireworks-ai",
  "deepinfra",
  "github-models",
  "cloudflare-workers-ai",
  "lmstudio",
  "zhipuai",
  "moonshotai",
  "siliconflow",
  "requesty",
] as const;

export const LlmProviderFlavor = z.enum(llmProviderFlavors);

export const LlmProvider = z.object({
  flavor: LlmProviderFlavor,
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const LlmModelConfig = z.object({
  provider: LlmProvider,
  model: z.string(),
  knowledgeGraphModel: z.string().optional(),
});
