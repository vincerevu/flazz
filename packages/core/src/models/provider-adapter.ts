import { generateText } from "ai";
import z from "zod";
import { LlmProvider } from "@flazz/shared/dist/models.js";

type ProviderConfig = z.infer<typeof LlmProvider>;
type RuntimeLanguageModel = Parameters<typeof generateText>[0]["model"];

export interface ProviderAdapter {
    createModel(config: ProviderConfig, modelId: string): RuntimeLanguageModel;
    testConnection(config: ProviderConfig, model: string, timeoutMs?: number): Promise<{ success: boolean; error?: string }>;
}
