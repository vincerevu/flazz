import { createGateway, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFireworks } from "@ai-sdk/fireworks";
import { createVertex } from "@ai-sdk/google-vertex";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOllama } from "ollama-ai-provider-v2";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { LlmModelConfig, LlmProvider } from "@flazz/shared";
import z from "zod";

import { ProviderAdapter } from "./provider-adapter.js";

export const Provider = LlmProvider;
export const ModelConfig = LlmModelConfig;

type ProviderConfig = z.infer<typeof Provider>;
type RuntimeLanguageModel = Parameters<typeof generateText>[0]["model"];
type RuntimeProvider = {
    languageModel(modelId: string): RuntimeLanguageModel;
};

const OPENAI_COMPATIBLE_BASE_URLS: Partial<Record<ProviderConfig["flavor"], string>> = {
    lmstudio: "http://localhost:1234/v1",
};

const OPENAI_COMPATIBLE_VALIDATION_FLAVORS = new Set<ProviderConfig["flavor"]>([
    "openai-compatible",
    "github-models",
    "cloudflare-workers-ai",
    "lmstudio",
    "zhipuai",
    "moonshotai",
    "siliconflow",
    "requesty",
]);

class DefaultProviderAdapter implements ProviderAdapter {
    private getOpenAICompatibleBaseURL(config: ProviderConfig): string {
        return config.baseURL || OPENAI_COMPATIBLE_BASE_URLS[config.flavor] || "";
    }

    private createOpenAICompatibleProvider(name: string, config: ProviderConfig): RuntimeProvider {
        return createOpenAICompatible({
            name,
            apiKey: config.apiKey,
            baseURL: this.getOpenAICompatibleBaseURL(config),
            headers: config.headers,
        });
    }

    private async testOpenAICompatibleConnection(
        config: ProviderConfig,
        model: string,
        abortSignal: AbortSignal,
    ): Promise<{ success: boolean; error?: string }> {
        const baseURL = this.getOpenAICompatibleBaseURL(config).replace(/\/+$/, "");
        if (!baseURL) {
            return { success: false, error: "Base URL is required" };
        }

        const headers = new Headers(config.headers);
        headers.set("Content-Type", "application/json");
        if (config.apiKey) {
            headers.set("Authorization", `Bearer ${config.apiKey}`);
        }

        const response = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers,
            signal: abortSignal,
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 16,
                stream: false,
            }),
        });

        const contentType = response.headers.get("content-type") || "";
        const bodyText = await response.text();
        let bodyJson: unknown;

        if (bodyText && contentType.includes("application/json")) {
            try {
                bodyJson = JSON.parse(bodyText);
            } catch {
                return { success: false, error: "Provider returned invalid JSON" };
            }
        }

        if (!response.ok) {
            if (bodyJson && typeof bodyJson === "object" && bodyJson !== null && "error" in bodyJson) {
                const errorValue = (bodyJson as { error?: unknown }).error;
                if (typeof errorValue === "string") {
                    return { success: false, error: errorValue };
                }
                if (errorValue && typeof errorValue === "object" && "message" in errorValue) {
                    const message = (errorValue as { message?: unknown }).message;
                    if (typeof message === "string") {
                        return { success: false, error: message };
                    }
                }
            }
            return {
                success: false,
                error: bodyText || `Connection test failed with status ${response.status}`,
            };
        }

        if (!bodyJson || typeof bodyJson !== "object" || !("choices" in bodyJson)) {
            return { success: false, error: "Provider returned an unexpected response shape" };
        }

        return { success: true };
    }

    private createRuntimeProvider(config: ProviderConfig): RuntimeProvider {
        const { apiKey, baseURL, headers } = config;
        switch (config.flavor) {
            case "openai":
                return createOpenAI({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "aigateway":
                return createGateway({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "anthropic":
                return createAnthropic({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "google":
                return createGoogleGenerativeAI({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "ollama": {
                // ollama-ai-provider-v2 expects baseURL to include /api
                let ollamaURL = baseURL;
                if (ollamaURL && !ollamaURL.replace(/\/+$/, '').endsWith('/api')) {
                    ollamaURL = ollamaURL.replace(/\/+$/, '') + '/api';
                }
                return createOllama({
                    baseURL: ollamaURL,
                    headers,
                });
            }
            case "openai-compatible":
                return this.createOpenAICompatibleProvider("openai-compatible", config);
            case "openrouter":
                return createOpenRouter({
                    apiKey,
                    baseURL,
                    headers,
                }) as unknown as RuntimeProvider;
            case "azure":
                return createAzure({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "amazon-bedrock":
                return createAmazonBedrock({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "google-vertex":
                return createVertex();
            case "deepseek":
                return createDeepSeek({
                    apiKey,
                    baseURL,
                    headers,
                }) as unknown as RuntimeProvider;
            case "groq":
                return createGroq({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "mistral":
                return createMistral({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "xai":
                return createXai({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "togetherai":
                return createTogetherAI({
                    apiKey,
                    baseURL,
                    headers,
                }) as unknown as RuntimeProvider;
            case "perplexity":
                return createPerplexity({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "cohere":
                return createCohere({
                    apiKey,
                    baseURL,
                    headers,
                });
            case "fireworks-ai":
                return createFireworks({
                    apiKey,
                    baseURL,
                    headers,
                }) as unknown as RuntimeProvider;
            case "deepinfra":
                return createDeepInfra({
                    apiKey,
                    baseURL,
                    headers,
                }) as unknown as RuntimeProvider;
            case "github-models":
                return this.createOpenAICompatibleProvider("github-models", config);
            case "cloudflare-workers-ai":
                return this.createOpenAICompatibleProvider("cloudflare-workers-ai", config);
            case "lmstudio":
                return this.createOpenAICompatibleProvider("lmstudio", config);
            case "zhipuai":
                return this.createOpenAICompatibleProvider("zhipuai", config);
            case "moonshotai":
                return this.createOpenAICompatibleProvider("moonshotai", config);
            case "siliconflow":
                return this.createOpenAICompatibleProvider("siliconflow", config);
            case "requesty":
                return this.createOpenAICompatibleProvider("requesty", config);
            default:
                throw new Error(`Unsupported provider flavor: ${config.flavor}`);
        }
    }

    createModel(config: ProviderConfig, modelId: string): RuntimeLanguageModel {
        const provider = this.createRuntimeProvider(config);
        return provider.languageModel(modelId);
    }

    async testConnection(
        config: ProviderConfig,
        model: string,
        timeoutMs?: number,
    ): Promise<{ success: boolean; error?: string }> {
        const isLocal =
            config.flavor === "ollama" ||
            config.flavor === "openai-compatible" ||
            config.flavor === "lmstudio";
        const effectiveTimeout = timeoutMs ?? (isLocal ? 60000 : 8000);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
        try {
            if (OPENAI_COMPATIBLE_VALIDATION_FLAVORS.has(config.flavor)) {
                return await this.testOpenAICompatibleConnection(config, model, controller.signal);
            }
            const languageModel = this.createModel(config, model);
            await generateText({
                model: languageModel,
                prompt: "ping",
                abortSignal: controller.signal,
            });
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Connection test failed";
            return { success: false, error: message };
        } finally {
            clearTimeout(timeout);
        }
    }
}

const defaultProviderAdapter = new DefaultProviderAdapter();

export function createProvider(config: ProviderConfig): RuntimeProvider {
    return {
        languageModel(modelId: string) {
            return defaultProviderAdapter.createModel(config, modelId);
        }
    };
}

export async function testModelConnection(
    providerConfig: ProviderConfig,
    model: string,
    timeoutMs?: number,
): Promise<{ success: boolean; error?: string }> {
    return defaultProviderAdapter.testConnection(providerConfig, model, timeoutMs);
}
