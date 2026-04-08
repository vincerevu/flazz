"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, Loader2, Plus, Search } from "lucide-react"

import { ProviderIcon } from "@/components/provider-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

type RuntimeProviderFlavor =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "aigateway"
  | "ollama"
  | "openai-compatible"

type ProviderId =
  | RuntimeProviderFlavor
  | "opencode"
  | "opencode-go"
  | "github-copilot"
  | "github-models"
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
  | "cloudflare-workers-ai"
  | "fireworks-ai"
  | "deepinfra"
  | "lmstudio"
  | "zhipuai"
  | "moonshotai"
  | "siliconflow"
  | "requesty"

type ProviderView = "overview" | "picker" | "detail"

type ModelConfig = {
  provider: {
    flavor: RuntimeProviderFlavor
    apiKey?: string
    baseURL?: string
  }
  model: string
  knowledgeGraphModel?: string
}

type ProviderFormState = {
  apiKey: string
  baseURL: string
  model: string
  knowledgeGraphModel: string
}

type SavedProviderConnections = {
  activeProvider?: RuntimeProviderFlavor
  providers: Partial<Record<RuntimeProviderFlavor, ModelConfig>>
}

type ProviderMeta = {
  id: ProviderId
  name: string
  description: string
  connectDescription: string
  icon: string
  group: "popular" | "other"
  runtimeFlavor?: RuntimeProviderFlavor
  tag?: string
  connectable: boolean
}

type ModelOption = {
  id: string
  name?: string
}

const MODEL_CONFIG_PATH = "config/models.json"
const CONNECTIONS_PATH = "config/provider-connections.json"

const defaultConfig: ModelConfig = {
  provider: { flavor: "openai" },
  model: "gpt-4.1",
}

const providerList: ProviderMeta[] = [
  {
    id: "opencode",
    name: "OpenCode Zen",
    description: "Reliable optimized models",
    connectDescription: "OpenCode Zen is not wired into Flazz runtime yet, but the full provider entry is now mirrored in the UI.",
    icon: "opencode",
    group: "popular",
    tag: "Recommended",
    connectable: false,
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    description: "Low cost subscription for everyone",
    connectDescription: "OpenCode Go is not wired into Flazz runtime yet, but the full provider entry is now mirrored in the UI.",
    icon: "opencode-go",
    group: "popular",
    tag: "Recommended",
    connectable: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Direct access to Claude models, including Pro and Max",
    connectDescription: "Enter your Anthropic API key to connect your account and use Anthropic models in Flazz.",
    icon: "anthropic",
    group: "popular",
    runtimeFlavor: "anthropic",
    connectable: true,
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    description: "AI models for coding assistance via GitHub Copilot",
    connectDescription: "GitHub Copilot is not wired into Flazz runtime yet, but the full provider entry is now mirrored in the UI.",
    icon: "github-copilot",
    group: "popular",
    connectable: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models for fast, capable general AI tasks",
    connectDescription: "Enter your OpenAI API key to connect your account and use OpenAI models in Flazz.",
    icon: "openai",
    group: "popular",
    runtimeFlavor: "openai",
    connectable: true,
  },
  {
    id: "google",
    name: "Google",
    description: "Gemini models for fast, structured responses",
    connectDescription: "Enter your Google AI Studio API key to connect your account and use Google models in Flazz.",
    icon: "google",
    group: "popular",
    runtimeFlavor: "google",
    connectable: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Claude, GPT, Gemini and more from a single key",
    connectDescription: "Enter your OpenRouter API key to connect your account and use OpenRouter models in Flazz.",
    icon: "openrouter",
    group: "popular",
    runtimeFlavor: "openrouter",
    connectable: true,
  },
  {
    id: "aigateway",
    name: "Vercel AI Gateway",
    description: "Route requests through Vercel's AI Gateway",
    connectDescription: "Enter your Vercel AI Gateway credentials to connect your account and use it in Flazz.",
    icon: "vercel",
    group: "popular",
    runtimeFlavor: "aigateway",
    connectable: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Reasoning and coding models from DeepSeek",
    connectDescription: "DeepSeek is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "deepseek",
    group: "other",
    connectable: false,
  },
  {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference for open models",
    connectDescription: "Groq is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "groq",
    group: "other",
    connectable: false,
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Mistral foundation and coding models",
    connectDescription: "Mistral is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "mistral",
    group: "other",
    connectable: false,
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok models from xAI",
    connectDescription: "xAI is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "xai",
    group: "other",
    connectable: false,
  },
  {
    id: "togetherai",
    name: "Together AI",
    description: "Hosted open models and custom endpoints",
    connectDescription: "Together AI is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "togetherai",
    group: "other",
    connectable: false,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Search-native model APIs",
    connectDescription: "Perplexity is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "perplexity",
    group: "other",
    connectable: false,
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    description: "Enterprise OpenAI deployments on Azure",
    connectDescription: "Azure OpenAI is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "azure",
    group: "other",
    connectable: false,
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    description: "Managed model access through AWS",
    connectDescription: "Amazon Bedrock is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "amazon-bedrock",
    group: "other",
    connectable: false,
  },
  {
    id: "cohere",
    name: "Cohere",
    description: "Language and embedding models from Cohere",
    connectDescription: "Cohere is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "cohere",
    group: "other",
    connectable: false,
  },
  {
    id: "github-models",
    name: "GitHub Models",
    description: "Multi-model playground via GitHub",
    connectDescription: "GitHub Models is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "github-models",
    group: "other",
    connectable: false,
  },
  {
    id: "google-vertex",
    name: "Google Vertex",
    description: "Vertex AI managed foundation models",
    connectDescription: "Google Vertex is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "google-vertex",
    group: "other",
    connectable: false,
  },
  {
    id: "cloudflare-workers-ai",
    name: "Cloudflare Workers AI",
    description: "Edge-hosted inference on Cloudflare",
    connectDescription: "Cloudflare Workers AI is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "cloudflare-workers-ai",
    group: "other",
    connectable: false,
  },
  {
    id: "fireworks-ai",
    name: "Fireworks AI",
    description: "Hosted inference for open and tuned models",
    connectDescription: "Fireworks AI is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "fireworks-ai",
    group: "other",
    connectable: false,
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    description: "Hosted inference for open models",
    connectDescription: "DeepInfra is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "deepinfra",
    group: "other",
    connectable: false,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    description: "Serve local models from LM Studio",
    connectDescription: "LM Studio is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "lmstudio",
    group: "other",
    connectable: false,
  },
  {
    id: "zhipuai",
    name: "Zhipu AI",
    description: "GLM model access and Chinese-market endpoints",
    connectDescription: "Zhipu AI is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "zhipuai",
    group: "other",
    connectable: false,
  },
  {
    id: "moonshotai",
    name: "Moonshot AI",
    description: "Moonshot and Kimi model access",
    connectDescription: "Moonshot AI is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "moonshotai",
    group: "other",
    connectable: false,
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    description: "Broad hosted catalog for open models",
    connectDescription: "SiliconFlow is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "siliconflow",
    group: "other",
    connectable: false,
  },
  {
    id: "requesty",
    name: "Requesty",
    description: "Gateway routing for multiple AI providers",
    connectDescription: "Requesty is shown to mirror OpenCode's provider catalog. Flazz runtime is not wired to it yet.",
    icon: "requesty",
    group: "other",
    connectable: false,
  },
  {
    id: "openai-compatible",
    name: "Custom",
    description: "Custom OpenAI-compatible API",
    connectDescription: "Enter your OpenAI-compatible endpoint details to connect a custom provider in Flazz.",
    icon: "synthetic",
    group: "other",
    runtimeFlavor: "openai-compatible",
    tag: "Custom",
    connectable: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models running on your machine",
    connectDescription: "Enter your Ollama base URL and model name to use local models in Flazz.",
    icon: "synthetic",
    group: "other",
    runtimeFlavor: "ollama",
    tag: "Local",
    connectable: true,
  },
]

const providerMetaById = Object.fromEntries(providerList.map((provider) => [provider.id, provider])) as Record<
  ProviderId,
  ProviderMeta
>

const defaultBaseURLs: Partial<Record<RuntimeProviderFlavor, string>> = {
  ollama: "http://localhost:11434",
  "openai-compatible": "http://localhost:1234/v1",
  aigateway: "https://ai-gateway.vercel.sh/v1",
}

const initialProviderForms: Record<RuntimeProviderFlavor, ProviderFormState> = {
  openai: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
  anthropic: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
  google: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
  openrouter: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
  aigateway: { apiKey: "", baseURL: defaultBaseURLs.aigateway ?? "", model: "", knowledgeGraphModel: "" },
  ollama: { apiKey: "", baseURL: defaultBaseURLs.ollama ?? "", model: "", knowledgeGraphModel: "" },
  "openai-compatible": {
    apiKey: "",
    baseURL: defaultBaseURLs["openai-compatible"] ?? "",
    model: "",
    knowledgeGraphModel: "",
  },
}

function isRuntimeProviderFlavor(value: unknown): value is RuntimeProviderFlavor {
  return typeof value === "string" && value in initialProviderForms
}

function readConfigToForm(config?: ModelConfig): ProviderFormState {
  if (!config) return { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" }
  return {
    apiKey: config.provider.apiKey ?? "",
    baseURL: config.provider.baseURL ?? "",
    model: config.model ?? "",
    knowledgeGraphModel: config.knowledgeGraphModel ?? "",
  }
}

function tag(label?: string) {
  if (!label) return null
  return (
    <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
      {label}
    </span>
  )
}

function providerCardNote(provider: ProviderMeta, config?: ModelConfig) {
  if (config?.model) return config.model
  if (!provider.connectable) {
    return "Provider catalog ported from OpenCode. Runtime support can be wired into Flazz next."
  }
  return provider.description
}

function providerConnectionTag(provider: ProviderMeta, activeProvider?: RuntimeProviderFlavor) {
  if (provider.runtimeFlavor === "openai-compatible") return "Custom"
  if (provider.runtimeFlavor === "ollama") return "Local"
  if (provider.runtimeFlavor && provider.runtimeFlavor === activeProvider) return "Active"
  return provider.tag
}

export function ProviderSettingsPanel({ dialogOpen }: { dialogOpen: boolean }) {
  const [configLoading, setConfigLoading] = useState(true)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsCatalog, setModelsCatalog] = useState<Record<string, ModelOption[]>>({})
  const [connections, setConnections] = useState<SavedProviderConnections>({ providers: {} })
  const [providerForms, setProviderForms] = useState(initialProviderForms)
  const [view, setView] = useState<ProviderView>("overview")
  const [pickerSearch, setPickerSearch] = useState("")
  const [detailProviderId, setDetailProviderId] = useState<ProviderId | null>(null)
  const [detailReturnView, setDetailReturnView] = useState<"overview" | "picker">("overview")
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailSaving, setDetailSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setConfigLoading(true)
    try {
      const runtimeResult = await window.ipc.invoke("workspace:readFile", { path: MODEL_CONFIG_PATH })
      const parsedRuntime = JSON.parse(runtimeResult.data) as ModelConfig
      const runtimeConfig = isRuntimeProviderFlavor(parsedRuntime?.provider?.flavor) && parsedRuntime?.model
        ? parsedRuntime
        : defaultConfig

      let nextConnections: SavedProviderConnections = {
        activeProvider: runtimeConfig.provider.flavor,
        providers: {
          [runtimeConfig.provider.flavor]: runtimeConfig,
        },
      }

      try {
        const connectionsResult = await window.ipc.invoke("workspace:readFile", { path: CONNECTIONS_PATH })
        const parsedConnections = JSON.parse(connectionsResult.data) as SavedProviderConnections
        if (parsedConnections && typeof parsedConnections === "object" && parsedConnections.providers) {
          const providers: Partial<Record<RuntimeProviderFlavor, ModelConfig>> = {}
          for (const [provider, value] of Object.entries(parsedConnections.providers)) {
            if (!isRuntimeProviderFlavor(provider)) continue
            const config = value as ModelConfig
            if (!config?.model) continue
            providers[provider] = config
          }
          if (Object.keys(providers).length > 0) {
            nextConnections = {
              activeProvider: isRuntimeProviderFlavor(parsedConnections.activeProvider)
                ? parsedConnections.activeProvider
                : runtimeConfig.provider.flavor,
              providers,
            }
          }
        }
      } catch {
        // Keep runtime config as seed when connection store does not exist yet.
      }

      if (!nextConnections.providers[runtimeConfig.provider.flavor]) {
        nextConnections.providers[runtimeConfig.provider.flavor] = runtimeConfig
      }

      setConnections(nextConnections)
      setProviderForms((current) => {
        const next = { ...current }
        for (const provider of Object.keys(nextConnections.providers) as RuntimeProviderFlavor[]) {
          next[provider] = {
            ...next[provider],
            ...readConfigToForm(nextConnections.providers[provider]),
          }
        }
        return next
      })
    } catch {
      setConnections({ activeProvider: defaultConfig.provider.flavor, providers: { openai: defaultConfig } })
    } finally {
      setConfigLoading(false)
    }
  }, [])

  const loadModels = useCallback(async () => {
    setModelsLoading(true)
    try {
      const result = await window.ipc.invoke("models:list", null)
      const nextCatalog: Record<string, ModelOption[]> = {}
      for (const provider of result.providers || []) {
        nextCatalog[provider.id] = provider.models || []
      }
      setModelsCatalog(nextCatalog)
      setProviderForms((current) => {
        const next = { ...current }
        for (const [provider, models] of Object.entries(nextCatalog)) {
          if (!isRuntimeProviderFlavor(provider) || next[provider].model || models.length === 0) continue
          next[provider] = { ...next[provider], model: models[0]?.id ?? "" }
        }
        return next
      })
    } catch {
      setModelsCatalog({})
    } finally {
      setModelsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!dialogOpen) return
    setView("overview")
    setPickerSearch("")
    setDetailProviderId(null)
    setDetailReturnView("overview")
    setDetailError(null)
    void loadSettings()
    void loadModels()
  }, [dialogOpen, loadModels, loadSettings])

  const connectedProviders = useMemo(
    () =>
      providerList.filter(
        (provider) => provider.runtimeFlavor && connections.providers[provider.runtimeFlavor],
      ),
    [connections.providers],
  )

  const popularOverviewProviders = useMemo(
    () =>
      providerList.filter(
        (provider) => provider.group === "popular" && (!provider.runtimeFlavor || !connections.providers[provider.runtimeFlavor]),
      ),
    [connections.providers],
  )

  const otherOverviewProviders = useMemo(
    () =>
      providerList.filter(
        (provider) => provider.group === "other" && (!provider.runtimeFlavor || !connections.providers[provider.runtimeFlavor]),
      ),
    [connections.providers],
  )

  const filteredProviders = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    return providerList.filter((provider) => {
      if (!query) return true
      return (
        provider.name.toLowerCase().includes(query) ||
        provider.description.toLowerCase().includes(query)
      )
    })
  }, [pickerSearch])

  const popularProviders = filteredProviders.filter((provider) => provider.group === "popular")
  const otherProviders = filteredProviders.filter((provider) => provider.group === "other")

  const detailProvider = detailProviderId ? providerMetaById[detailProviderId] : null
  const detailRuntimeFlavor = detailProvider?.runtimeFlavor
  const detailForm = detailRuntimeFlavor ? providerForms[detailRuntimeFlavor] : null
  const detailModels = detailRuntimeFlavor ? modelsCatalog[detailRuntimeFlavor] || [] : []

  const updateProviderForm = useCallback(
    (provider: RuntimeProviderFlavor, updates: Partial<ProviderFormState>) => {
      setProviderForms((current) => ({
        ...current,
        [provider]: {
          ...current[provider],
          ...updates,
        },
      }))
      setDetailError(null)
    },
    [],
  )

  const openProviderDialog = useCallback((providerId: ProviderId, returnView: "overview" | "picker" = "overview") => {
    setDetailProviderId(providerId)
    setDetailReturnView(returnView)
    setDetailError(null)
    setView("detail")
  }, [])

  const closeProviderDialog = useCallback(() => {
    setDetailError(null)
    setView(detailReturnView)
  }, [detailReturnView])

  const saveConnections = useCallback(async (nextConnections: SavedProviderConnections, nextRuntime: ModelConfig) => {
    await window.ipc.invoke("workspace:writeFile", {
      path: CONNECTIONS_PATH,
      data: JSON.stringify(nextConnections, null, 2),
    })
    await window.ipc.invoke("models:saveConfig", nextRuntime)
    setConnections(nextConnections)
  }, [])

  const handleConnect = useCallback(async () => {
    if (!detailProvider || !detailRuntimeFlavor || !detailForm) return
    if (!detailProvider.connectable) {
      setDetailError("This provider UI was ported from OpenCode, but Flazz runtime does not support it yet.")
      return
    }

    const apiKeyRequired =
      detailRuntimeFlavor === "openai" ||
      detailRuntimeFlavor === "anthropic" ||
      detailRuntimeFlavor === "google" ||
      detailRuntimeFlavor === "openrouter" ||
      detailRuntimeFlavor === "aigateway"
    const baseUrlRequired =
      detailRuntimeFlavor === "ollama" || detailRuntimeFlavor === "openai-compatible"

    if (apiKeyRequired && !detailForm.apiKey.trim()) {
      setDetailError("API key is required")
      return
    }
    if (baseUrlRequired && !detailForm.baseURL.trim()) {
      setDetailError("Base URL is required")
      return
    }
    if (!detailForm.model.trim()) {
      setDetailError("Model is required")
      return
    }

    const nextRuntime: ModelConfig = {
      provider: {
        flavor: detailRuntimeFlavor,
        apiKey: detailForm.apiKey.trim() || undefined,
        baseURL: detailForm.baseURL.trim() || undefined,
      },
      model: detailForm.model.trim(),
      knowledgeGraphModel: detailForm.knowledgeGraphModel.trim() || undefined,
    }

    setDetailSaving(true)
    setDetailError(null)
    try {
      const result = await window.ipc.invoke("models:test", nextRuntime)
      if (!result.success) {
        setDetailError(result.error || "Connection test failed")
        return
      }

      const nextConnections: SavedProviderConnections = {
        activeProvider: detailRuntimeFlavor,
        providers: {
          ...connections.providers,
          [detailRuntimeFlavor]: nextRuntime,
        },
      }

      await saveConnections(nextConnections, nextRuntime)
      setDetailProviderId(null)
      setView("overview")
      toast.success(`Connected to ${detailProvider.name}`)
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Connection test failed")
    } finally {
      setDetailSaving(false)
    }
  }, [connections.providers, detailForm, detailProvider, detailRuntimeFlavor, saveConnections])

  const handleDisconnect = useCallback(async (runtimeFlavor: RuntimeProviderFlavor) => {
    const nextProviders = { ...connections.providers }
    delete nextProviders[runtimeFlavor]

    const fallbackRuntime =
      (Object.keys(nextProviders)[0] as RuntimeProviderFlavor | undefined) ?? defaultConfig.provider.flavor
    const fallbackConfig = nextProviders[fallbackRuntime] ?? defaultConfig

    const nextConnections: SavedProviderConnections = {
      activeProvider: Object.keys(nextProviders).length > 0 ? fallbackRuntime : undefined,
      providers: nextProviders,
    }

    try {
      await saveConnections(nextConnections, fallbackConfig)
      toast.success(`Disconnected ${providerMetaById[runtimeFlavor].name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect provider")
    }
  }, [connections.providers, saveConnections])

  if (configLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading providers...
      </div>
    )
  }

  const renderProviderRow = (
    provider: ProviderMeta,
    connected = false,
    returnView: "overview" | "picker" = "overview",
  ) => {
    const runtimeConfig = provider.runtimeFlavor ? connections.providers[provider.runtimeFlavor] : undefined

    return (
      <div
        key={provider.id}
        className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3 last:border-none"
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => openProviderDialog(provider.id, returnView)}
        >
          <ProviderIcon id={provider.icon} className="size-5 shrink-0 text-foreground" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{provider.name}</span>
              {tag(providerConnectionTag(provider, connections.activeProvider))}
            </div>
            <p className="pt-0.5 text-xs text-muted-foreground">
              {providerCardNote(provider, runtimeConfig)}
            </p>
          </div>
        </button>
        {connected && provider.runtimeFlavor ? (
          <Button variant="ghost" size="sm" onClick={() => void handleDisconnect(provider.runtimeFlavor!)}>
            Disconnect
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="min-w-24"
            onClick={() => openProviderDialog(provider.id, returnView)}
          >
            {provider.connectable ? (
              <>
                <Plus className="mr-1 size-3.5" />
                Connect
              </>
            ) : (
              "View"
            )}
          </Button>
        )}
      </div>
    )
  }

  if (view === "picker") {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-1 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setView("overview")}>
            <ChevronLeft className="size-4" />
          </Button>
          <div>
            <h3 className="text-base font-semibold text-foreground">Connect provider</h3>
            <p className="text-sm text-muted-foreground">Browse the full provider catalog.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={pickerSearch}
            onChange={(event) => setPickerSearch(event.target.value)}
            placeholder="Search providers"
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>

        {popularProviders.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-foreground">Popular</h4>
            <div className="rounded-xl border bg-muted/25 px-4">
              {popularProviders.map((provider) => renderProviderRow(provider, false, "picker"))}
            </div>
          </section>
        ) : null}

        {otherProviders.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-foreground">Other</h4>
            <div className="rounded-xl border bg-muted/25 px-4">
              {otherProviders.map((provider) => renderProviderRow(provider, false, "picker"))}
            </div>
          </section>
        ) : null}

        {popularProviders.length === 0 && otherProviders.length === 0 ? (
          <div className="rounded-xl border bg-muted/25 px-4 py-5 text-sm text-muted-foreground">
            No providers matched your search.
          </div>
        ) : null}
      </div>
    )
  }

  if (view === "detail" && detailProvider) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={closeProviderDialog}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <ProviderIcon id={detailProvider.icon} className="size-5 shrink-0 text-foreground" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">Connect {detailProvider.name}</h3>
                {tag(detailProvider.tag)}
              </div>
              <p className="text-sm text-muted-foreground">{detailProvider.connectDescription}</p>
            </div>
          </div>
        </div>

        {detailRuntimeFlavor && detailForm ? (
          <div className="flex flex-col gap-5">
            {detailRuntimeFlavor !== "ollama" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {detailRuntimeFlavor === "openai-compatible" ? "API key (optional)" : `${detailProvider.name} API key`}
                </label>
                <Input
                  type="password"
                  value={detailForm.apiKey}
                  onChange={(event) => updateProviderForm(detailRuntimeFlavor, { apiKey: event.target.value })}
                  placeholder="API key"
                  className="h-12"
                  autoFocus
                />
              </div>
            ) : null}

            {detailRuntimeFlavor === "aigateway" || detailRuntimeFlavor === "ollama" || detailRuntimeFlavor === "openai-compatible" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Base URL</label>
                <Input
                  value={detailForm.baseURL}
                  onChange={(event) => updateProviderForm(detailRuntimeFlavor, { baseURL: event.target.value })}
                  placeholder={defaultBaseURLs[detailRuntimeFlavor] ?? "https://"}
                  className="h-12"
                  autoFocus={detailRuntimeFlavor === "ollama"}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Assistant model</label>
              {modelsLoading ? (
                <div className="flex h-12 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading models...
                </div>
              ) : detailModels.length > 0 ? (
                <Select
                  value={detailForm.model}
                  onValueChange={(value) => updateProviderForm(detailRuntimeFlavor, { model: value })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {detailModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={detailForm.model}
                  onChange={(event) => updateProviderForm(detailRuntimeFlavor, { model: event.target.value })}
                  placeholder="Enter model"
                  className="h-12"
                />
              )}
            </div>

            {detailError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {detailError}
              </div>
            ) : null}

            <div>
              <Button onClick={() => void handleConnect()} disabled={detailSaving} className="h-11 min-w-28 px-5">
                {detailSaving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              This provider is included to mirror OpenCode&apos;s full catalog. Flazz does not have a runtime adapter for it yet, so opening it keeps the UI/flow aligned without changing your existing provider execution logic.
            </div>
            <div>
              <Button variant="secondary" onClick={closeProviderDialog}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Connected providers</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {connectedProviders.length > 0 ? (
            connectedProviders.map((provider) => renderProviderRow(provider, true))
          ) : (
            <div className="py-5 text-sm text-muted-foreground">No providers connected yet.</div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Popular providers</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {popularOverviewProviders.map((provider) => renderProviderRow(provider))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Other</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {otherOverviewProviders.map((provider) => renderProviderRow(provider))}
        </div>
      </section>

      <Button
        variant="ghost"
        className="w-fit px-0 text-sm text-foreground hover:bg-transparent"
        onClick={() => {
          setPickerSearch("")
          setView("picker")
        }}
      >
        View all providers
      </Button>
    </div>
  )
}
