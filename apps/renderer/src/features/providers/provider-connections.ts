export type RuntimeProviderFlavor =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "aigateway"
  | "ollama"
  | "openai-compatible"
  | "deepseek"
  | "groq"
  | "mistral"
  | "xai"
  | "togetherai"
  | "perplexity"
  | "azure"
  | "amazon-bedrock"
  | "cohere"
  | "google-vertex"
  | "fireworks-ai"
  | "deepinfra"
  | "github-models"
  | "cloudflare-workers-ai"
  | "lmstudio"
  | "zhipuai"
  | "moonshotai"
  | "siliconflow"
  | "requesty"

export type ModelConfig = {
  provider: {
    flavor: RuntimeProviderFlavor
    apiKey?: string
    baseURL?: string
    headers?: Record<string, string>
  }
  model: string
  knowledgeGraphModel?: string
}

export type ProviderConnection = {
  id: string
  name: string
  provider: ModelConfig["provider"]
  models: string[]
  defaultModel: string
  knowledgeGraphModel?: string
}

export type LegacySavedProviderConnections = {
  activeProvider?: RuntimeProviderFlavor
  providers: Partial<Record<RuntimeProviderFlavor, ModelConfig>>
}

export type SavedProviderConnections = {
  activeProviderId?: string
  connections: ProviderConnection[]
}

export const PROVIDER_CONNECTIONS_PATH = "config/provider-connections.json"
export const MODEL_CONFIG_PATH = "config/models.json"

export const runtimeProviderFlavors: RuntimeProviderFlavor[] = [
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
]

export function isRuntimeProviderFlavor(value: unknown): value is RuntimeProviderFlavor {
  return typeof value === "string" && runtimeProviderFlavors.includes(value as RuntimeProviderFlavor)
}

export function providerConnectionId(flavor: RuntimeProviderFlavor, name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${flavor}:${slug || "provider"}`
}

export function normalizeModelNames(models: Iterable<string>, fallback?: string, knowledgeGraphModel?: string) {
  const seen = new Set<string>()
  const next: string[] = []

  const push = (value?: string) => {
    const normalized = value?.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    next.push(normalized)
  }

  for (const model of models) push(model)
  push(fallback)
  push(knowledgeGraphModel)

  return next
}

export function connectionToRuntimeConfig(connection: ProviderConnection, selectedModel?: string): ModelConfig {
  return {
    provider: connection.provider,
    model: selectedModel ?? connection.defaultModel,
    knowledgeGraphModel: connection.knowledgeGraphModel,
  }
}

export function parseProviderConnections(
  raw: unknown,
  runtimeConfig: ModelConfig | null,
  getDefaultName: (flavor: RuntimeProviderFlavor) => string,
): SavedProviderConnections {
  if (raw && typeof raw === "object" && Array.isArray((raw as SavedProviderConnections).connections)) {
    const parsed = raw as SavedProviderConnections
    const connections = parsed.connections
      .filter((connection) => isRuntimeProviderFlavor(connection?.provider?.flavor))
      .map((connection) => {
        const models = normalizeModelNames(
          Array.isArray(connection.models) ? connection.models : [],
          connection.defaultModel,
          connection.knowledgeGraphModel,
        )
        return {
          id: typeof connection.id === "string"
            ? connection.id
            : providerConnectionId(connection.provider.flavor, connection.name || getDefaultName(connection.provider.flavor)),
          name:
            typeof connection.name === "string" && connection.name.trim()
              ? connection.name.trim()
              : getDefaultName(connection.provider.flavor),
          provider: connection.provider,
          models,
          defaultModel: connection.defaultModel?.trim() || models[0] || "",
          knowledgeGraphModel: connection.knowledgeGraphModel?.trim() || undefined,
        } satisfies ProviderConnection
      })
      .filter((connection) => connection.defaultModel)

    const activeProviderId =
      typeof parsed.activeProviderId === "string" &&
      connections.some((connection) => connection.id === parsed.activeProviderId)
        ? parsed.activeProviderId
        : connections[0]?.id

    return { activeProviderId, connections }
  }

  const legacy = raw as LegacySavedProviderConnections | null
  const connections: ProviderConnection[] = []

  if (legacy?.providers && typeof legacy.providers === "object") {
    for (const [flavor, config] of Object.entries(legacy.providers)) {
      if (!isRuntimeProviderFlavor(flavor) || !config?.model) continue
      connections.push({
        id: providerConnectionId(flavor, getDefaultName(flavor)),
        name: getDefaultName(flavor),
        provider: config.provider,
        models: normalizeModelNames([config.model], config.model, config.knowledgeGraphModel),
        defaultModel: config.model,
        knowledgeGraphModel: config.knowledgeGraphModel,
      })
    }
  }

  if (runtimeConfig?.provider?.flavor && runtimeConfig.model) {
    const fallbackId = providerConnectionId(runtimeConfig.provider.flavor, getDefaultName(runtimeConfig.provider.flavor))
    if (!connections.some((connection) => connection.id === fallbackId)) {
      connections.unshift({
        id: fallbackId,
        name: getDefaultName(runtimeConfig.provider.flavor),
        provider: runtimeConfig.provider,
        models: normalizeModelNames([runtimeConfig.model], runtimeConfig.model, runtimeConfig.knowledgeGraphModel),
        defaultModel: runtimeConfig.model,
        knowledgeGraphModel: runtimeConfig.knowledgeGraphModel,
      })
    }
  }

  const activeProviderId =
    (legacy?.activeProvider &&
      connections.find((connection) => connection.provider.flavor === legacy.activeProvider)?.id) ||
    connections[0]?.id

  return { activeProviderId, connections }
}
