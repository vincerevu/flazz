"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, Loader2, Plus, Search } from "lucide-react"
import { toast } from "sonner"

import { ProviderIcon } from "@/components/provider-icon"
import {
  MODEL_CONFIG_PATH,
  PROVIDER_CONNECTIONS_PATH,
  connectionToRuntimeConfig,
  normalizeModelNames,
  parseProviderConnections,
  providerConnectionId,
  type RuntimeProviderFlavor,
  type SavedProviderConnections,
} from "@/features/providers/provider-connections"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { modelsActionsIpc } from "@/services/models-actions-ipc"
import { modelsIpc } from "@/services/models-ipc"
import { workspaceIpc } from "@/services/workspace-ipc"

type ProviderId = RuntimeProviderFlavor
type ProviderView = "overview" | "picker" | "detail"
type ModelOption = { id: string; name?: string }
type ProviderMeta = {
  id: ProviderId
  name: string
  description: string
  connectDescription: string
  icon: string
  group: "popular" | "other"
  runtimeFlavor: RuntimeProviderFlavor
  tag?: string
}
type DetailFormState = {
  connectionId?: string
  name: string
  apiKey: string
  baseURL: string
  defaultModel: string
  modelsText: string
}

const defaultBaseURLs: Partial<Record<RuntimeProviderFlavor, string>> = {
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234/v1",
  "openai-compatible": "http://localhost:1234/v1",
  aigateway: "https://ai-gateway.vercel.sh/v1",
}

const providerSeeds: Array<[ProviderId, string, string, string, string, "popular" | "other", string?]> = [
  ["anthropic", "Anthropic", "Direct access to Claude models, including Pro and Max", "Enter your Anthropic API key and the models you want to make available in Flazz.", "anthropic", "popular"],
  ["openai", "OpenAI", "GPT models for fast, capable general AI tasks", "Enter your OpenAI API key and the models you want to make available in Flazz.", "openai", "popular"],
  ["google", "Google", "Gemini models for fast, structured responses", "Enter your Google AI Studio API key and the models you want to make available in Flazz.", "google", "popular"],
  ["openrouter", "OpenRouter", "Claude, GPT, Gemini and more from a single key", "Enter your OpenRouter API key and the models you want to make available in Flazz.", "openrouter", "popular"],
  ["aigateway", "Vercel AI Gateway", "Route requests through Vercel's AI Gateway", "Enter your Vercel AI Gateway credentials and the models you want to make available in Flazz.", "vercel", "popular"],
  ["deepseek", "DeepSeek", "Reasoning and coding models from DeepSeek", "Enter your DeepSeek API key and the models you want to make available in Flazz.", "deepseek", "other"],
  ["groq", "Groq", "Ultra-fast inference for open models", "Enter your Groq API key and the models you want to make available in Flazz.", "groq", "other"],
  ["mistral", "Mistral", "Mistral foundation and coding models", "Enter your Mistral API key and the models you want to make available in Flazz.", "mistral", "other"],
  ["xai", "xAI", "Grok models from xAI", "Enter your xAI API key and the models you want to make available in Flazz.", "xai", "other"],
  ["togetherai", "Together AI", "Hosted open models and custom endpoints", "Enter your Together AI API key and the models you want to make available in Flazz.", "togetherai", "other"],
  ["perplexity", "Perplexity", "Search-native model APIs", "Enter your Perplexity API key and the models you want to make available in Flazz.", "perplexity", "other"],
  ["azure", "Azure OpenAI", "Enterprise OpenAI deployments on Azure", "Enter your Azure OpenAI credentials and deployment names for Flazz.", "azure", "other"],
  ["amazon-bedrock", "Amazon Bedrock", "Managed model access through AWS", "Use an Amazon Bedrock token or AWS credentials, then list the models you want.", "amazon-bedrock", "other"],
  ["cohere", "Cohere", "Language and embedding models from Cohere", "Enter your Cohere API key and the models you want to make available in Flazz.", "cohere", "other"],
  ["github-models", "GitHub Models", "Multi-model playground via GitHub", "Enter your GitHub Models endpoint details and the models you want to expose in Flazz.", "github-models", "other"],
  ["google-vertex", "Google Vertex", "Vertex AI managed foundation models", "Use your Google Cloud credentials and list the Vertex models you want to use in Flazz.", "google-vertex", "other"],
  ["cloudflare-workers-ai", "Cloudflare Workers AI", "Edge-hosted inference on Cloudflare", "Enter your Cloudflare Workers AI endpoint details and the models you want to expose in Flazz.", "cloudflare-workers-ai", "other"],
  ["fireworks-ai", "Fireworks AI", "Hosted inference for open and tuned models", "Enter your Fireworks API key and the models you want to make available in Flazz.", "fireworks-ai", "other"],
  ["deepinfra", "DeepInfra", "Hosted inference for open models", "Enter your DeepInfra API key and the models you want to make available in Flazz.", "deepinfra", "other"],
  ["lmstudio", "LM Studio", "Serve local models from LM Studio", "Enter your LM Studio endpoint and the models you want to make available in Flazz.", "lmstudio", "other"],
  ["zhipuai", "Zhipu AI", "GLM model access and Chinese-market endpoints", "Enter your Zhipu AI endpoint details and the models you want to expose in Flazz.", "zhipuai", "other"],
  ["moonshotai", "Moonshot AI", "Moonshot and Kimi model access", "Enter your Moonshot AI endpoint details and the models you want to expose in Flazz.", "moonshotai", "other"],
  ["siliconflow", "SiliconFlow", "Broad hosted catalog for open models", "Enter your SiliconFlow endpoint details and the models you want to expose in Flazz.", "siliconflow", "other"],
  ["requesty", "Requesty", "Gateway routing for multiple AI providers", "Enter your Requesty endpoint details and the models you want to expose in Flazz.", "requesty", "other"],
  ["openai-compatible", "Custom", "Custom OpenAI-compatible API", "Give this provider a name, enter its endpoint, and list all models you want available in Flazz.", "synthetic", "other", "Custom"],
  ["ollama", "Ollama", "Local models running on your machine", "Enter your Ollama base URL and list all local models you want available in Flazz.", "synthetic", "other", "Local"],
]

const providerList: ProviderMeta[] = providerSeeds.map(([id, name, description, connectDescription, icon, group, tag]) => ({
  id,
  name,
  description,
  connectDescription,
  icon,
  group,
  runtimeFlavor: id,
  tag,
}))

const providerMetaById = Object.fromEntries(providerList.map((provider) => [provider.id, provider])) as Record<ProviderId, ProviderMeta>

function tag(label?: string) {
  if (!label) return null
  const isActive = label === "Active"
  return (
    <span className={isActive ? "inline-flex items-center rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300" : "inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground"}>
      {label}
    </span>
  )
}

function requiresApiKey(flavor: RuntimeProviderFlavor) {
  return !["ollama", "lmstudio", "openai-compatible", "amazon-bedrock", "google-vertex"].includes(flavor)
}

function requiresBaseURL(flavor: RuntimeProviderFlavor) {
  return ["aigateway", "ollama", "openai-compatible", "azure", "github-models", "cloudflare-workers-ai", "lmstudio", "zhipuai", "moonshotai", "siliconflow", "requesty"].includes(flavor)
}

function apiKeyLabel(providerName: string, flavor: RuntimeProviderFlavor) {
  if (flavor === "openai-compatible" || flavor === "lmstudio") return "API key (optional)"
  if (flavor === "amazon-bedrock") return "API key (optional)"
  if (flavor === "google-vertex") return "API key (usually not required)"
  return `${providerName} API key`
}

function buildDetailForm(
  provider: ProviderMeta,
  modelsCatalog: Record<string, ModelOption[]>,
  connection?: SavedProviderConnections["connections"][number],
): DetailFormState {
  const discovered = (modelsCatalog[provider.runtimeFlavor] || []).map((model) => model.id)
  const models = normalizeModelNames(connection?.models || discovered, connection?.defaultModel, connection?.knowledgeGraphModel)
  return {
    connectionId: connection?.id,
    name: connection?.name || (provider.runtimeFlavor === "openai-compatible" ? "Custom Provider" : provider.name),
    apiKey: connection?.provider.apiKey || "",
    baseURL: connection?.provider.baseURL || defaultBaseURLs[provider.runtimeFlavor] || "",
    defaultModel: connection?.defaultModel || models[0] || "",
    modelsText: models.join("\n"),
  }
}

function ensureUniqueConnectionId(existingIds: Set<string>, preferredId: string, currentId?: string) {
  if (!existingIds.has(preferredId) || preferredId === currentId) return preferredId
  let next = 2
  let candidate = `${preferredId}-${next}`
  while (existingIds.has(candidate) && candidate !== currentId) {
    next += 1
    candidate = `${preferredId}-${next}`
  }
  return candidate
}

export function ProviderSettingsPanel({ dialogOpen }: { dialogOpen: boolean }) {
  const [configLoading, setConfigLoading] = useState(true)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsCatalog, setModelsCatalog] = useState<Record<string, ModelOption[]>>({})
  const [connections, setConnections] = useState<SavedProviderConnections>({ connections: [] })
  const [view, setView] = useState<ProviderView>("overview")
  const [pickerSearch, setPickerSearch] = useState("")
  const [detailProviderId, setDetailProviderId] = useState<ProviderId | null>(null)
  const [detailReturnView, setDetailReturnView] = useState<"overview" | "picker">("overview")
  const [detailForm, setDetailForm] = useState<DetailFormState | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailSaving, setDetailSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setConfigLoading(true)
    try {
      const runtimeResult = await workspaceIpc.readFile(MODEL_CONFIG_PATH).catch(() => null)
      const runtimeConfig = runtimeResult?.data ? JSON.parse(runtimeResult.data) : null
      try {
        const connectionsResult = await workspaceIpc.readFile(PROVIDER_CONNECTIONS_PATH)
        setConnections(parseProviderConnections(JSON.parse(connectionsResult.data), runtimeConfig, (flavor) => providerMetaById[flavor].name))
      } catch {
        setConnections(parseProviderConnections(null, runtimeConfig, (flavor) => providerMetaById[flavor].name))
      }
    } finally {
      setConfigLoading(false)
    }
  }, [])

  const loadModels = useCallback(async () => {
    setModelsLoading(true)
    try {
      const result = await modelsIpc.list()
      const nextCatalog: Record<string, ModelOption[]> = {}
      for (const provider of result.providers || []) nextCatalog[provider.id] = provider.models || []
      setModelsCatalog(nextCatalog)
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
    setDetailForm(null)
    setDetailError(null)
    void loadSettings()
    void loadModels()
  }, [dialogOpen, loadModels, loadSettings])

  const connectedFlavorCounts = useMemo(() => {
    const counts = new Map<RuntimeProviderFlavor, number>()
    for (const connection of connections.connections) counts.set(connection.provider.flavor, (counts.get(connection.provider.flavor) || 0) + 1)
    return counts
  }, [connections.connections])

  const visibleOverviewProviders = useMemo(
    () => providerList.filter((provider) => provider.runtimeFlavor === "openai-compatible" || !connectedFlavorCounts.has(provider.runtimeFlavor)),
    [connectedFlavorCounts],
  )

  const connectedConnections = useMemo(() => [...connections.connections].sort((a, b) => a.name.localeCompare(b.name)), [connections.connections])
  const popularOverviewProviders = visibleOverviewProviders.filter((provider) => provider.group === "popular")
  const otherOverviewProviders = visibleOverviewProviders.filter((provider) => provider.group === "other")
  const filteredProviders = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    return providerList.filter((provider) => !query || provider.name.toLowerCase().includes(query) || provider.description.toLowerCase().includes(query))
  }, [pickerSearch])

  const detailProvider = detailProviderId ? providerMetaById[detailProviderId] : null
  const detailOptions = useMemo(() => {
    if (!detailProvider || !detailForm) return []
    const options = [...(modelsCatalog[detailProvider.runtimeFlavor] || []), ...detailForm.modelsText.split(/\r?\n/).map((id) => ({ id: id.trim(), name: id.trim() })).filter((model) => model.id)]
    const deduped = new Map<string, ModelOption>()
    for (const option of options) if (!deduped.has(option.id)) deduped.set(option.id, option)
    return Array.from(deduped.values())
  }, [detailForm, detailProvider, modelsCatalog])

  const updateDetailForm = useCallback((updates: Partial<DetailFormState>) => {
    setDetailForm((current) => (current ? { ...current, ...updates } : current))
    setDetailError(null)
  }, [])

  const openProviderDialog = useCallback((providerId: ProviderId, returnView: "overview" | "picker" = "overview", connectionId?: string) => {
    const provider = providerMetaById[providerId]
    const connection = connectionId ? connections.connections.find((item) => item.id === connectionId) : undefined
    setDetailProviderId(providerId)
    setDetailReturnView(returnView)
    setDetailForm(buildDetailForm(provider, modelsCatalog, connection))
    setDetailError(null)
    setView("detail")
  }, [connections.connections, modelsCatalog])

  const closeProviderDialog = useCallback(() => {
    setDetailError(null)
    setView(detailReturnView)
  }, [detailReturnView])

  const saveConnections = useCallback(async (nextConnections: SavedProviderConnections, runtimeConnectionId: string, runtimeModelId?: string) => {
    const runtimeConnection = nextConnections.connections.find((connection) => connection.id === runtimeConnectionId)
    if (!runtimeConnection) throw new Error("Selected provider configuration is missing")
    await workspaceIpc.writeFile(PROVIDER_CONNECTIONS_PATH, JSON.stringify(nextConnections, null, 2))
    await modelsActionsIpc.saveConfig(connectionToRuntimeConfig(runtimeConnection, runtimeModelId))
    setConnections(nextConnections)
  }, [])

  const handleConnect = useCallback(async () => {
    if (!detailProvider || !detailForm) return
    if (detailProvider.runtimeFlavor === "openai-compatible" && !detailForm.name.trim()) {
      setDetailError("Provider name is required")
      return
    }
    if (requiresApiKey(detailProvider.runtimeFlavor) && !detailForm.apiKey.trim()) {
      setDetailError("API key is required")
      return
    }
    if (requiresBaseURL(detailProvider.runtimeFlavor) && !detailForm.baseURL.trim()) {
      setDetailError("Base URL is required")
      return
    }

    const models = normalizeModelNames(detailForm.modelsText.split(/\r?\n/).map((model) => model.trim()), detailForm.defaultModel)
    if (models.length === 0) {
      setDetailError("Add at least one model")
      return
    }
    const defaultModel = detailForm.defaultModel.trim() || models[0]
    if (!defaultModel) {
      setDetailError("Default model is required")
      return
    }

    const connectionName = detailProvider.runtimeFlavor === "openai-compatible" ? detailForm.name.trim() : detailProvider.name
    const existingIds = new Set(connections.connections.map((connection) => connection.id))
    const connectionId = ensureUniqueConnectionId(existingIds, detailForm.connectionId || providerConnectionId(detailProvider.runtimeFlavor, connectionName), detailForm.connectionId)
    const nextConnection = {
      id: connectionId,
      name: connectionName,
      provider: {
        flavor: detailProvider.runtimeFlavor,
        apiKey: detailForm.apiKey.trim() || undefined,
        baseURL: detailForm.baseURL.trim() || undefined,
      },
      models: normalizeModelNames(models, defaultModel),
      defaultModel,
    }

    setDetailSaving(true)
    setDetailError(null)
    try {
      const result = await modelsActionsIpc.test(connectionToRuntimeConfig(nextConnection))
      if (!result.success) {
        setDetailError(result.error || "Connection test failed")
        return
      }

      const nextConnections: SavedProviderConnections = {
        activeProviderId: nextConnection.id,
        connections: detailForm.connectionId
          ? connections.connections.map((connection) => (connection.id === detailForm.connectionId ? nextConnection : connection))
          : [...connections.connections, nextConnection],
      }

      await saveConnections(nextConnections, nextConnection.id)
      setDetailProviderId(null)
      setDetailForm(null)
      setView("overview")
      toast.success(`Connected ${nextConnection.name}`)
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Connection test failed")
    } finally {
      setDetailSaving(false)
    }
  }, [connections.connections, detailForm, detailProvider, saveConnections])

  const handleDisconnect = useCallback(async (connectionId: string) => {
    const nextList = connections.connections.filter((connection) => connection.id !== connectionId)
    const nextActiveId = connections.activeProviderId === connectionId ? nextList[0]?.id : connections.activeProviderId
    const nextConnections = { activeProviderId: nextActiveId, connections: nextList }
    try {
      if (nextList.length > 0 && nextActiveId) {
        await saveConnections(nextConnections, nextActiveId)
      } else {
        await workspaceIpc.writeFile(PROVIDER_CONNECTIONS_PATH, JSON.stringify(nextConnections, null, 2))
        setConnections(nextConnections)
      }
      toast.success("Provider disconnected")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect provider")
    }
  }, [connections, saveConnections])

  if (configLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading providers...</div>
  }

  const renderOverviewRow = (provider: ProviderMeta, returnView: "overview" | "picker" = "overview") => (
    <div key={provider.id} className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3 last:border-none">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openProviderDialog(provider.id, returnView)}>
        <ProviderIcon id={provider.icon} className="size-5 shrink-0 text-foreground" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{provider.name}</span>
            {tag(provider.tag)}
          </div>
          <p className="pt-0.5 text-xs text-muted-foreground">{provider.description}</p>
        </div>
      </button>
      <Button variant="secondary" size="sm" className="min-w-24" onClick={() => openProviderDialog(provider.id, returnView)}>
        <Plus className="mr-1 size-3.5" />
        Connect
      </Button>
    </div>
  )

  const renderConnectedRow = (connection: SavedProviderConnections["connections"][number]) => {
    const provider = providerMetaById[connection.provider.flavor]
    return (
      <div key={connection.id} className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3 last:border-none">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openProviderDialog(provider.id, "overview", connection.id)}>
          <ProviderIcon id={provider.icon} className="size-5 shrink-0 text-foreground" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{connection.name}</span>
              {tag(connections.activeProviderId === connection.id ? "Active" : provider.tag)}
            </div>
            <p className="pt-0.5 text-xs text-muted-foreground">
              {connection.defaultModel}
              {connection.models.length > 1 ? ` +${connection.models.length - 1} more` : ""}
            </p>
          </div>
        </button>
        <Button variant="ghost" size="sm" onClick={() => void handleDisconnect(connection.id)}>Disconnect</Button>
      </div>
    )
  }

  if (view === "picker") {
    const popularProviders = filteredProviders.filter((provider) => provider.group === "popular")
    const otherProviders = filteredProviders.filter((provider) => provider.group === "other")
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-1 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setView("overview")}><ChevronLeft className="size-4" /></Button>
          <div>
            <h3 className="text-base font-semibold text-foreground">Connect provider</h3>
            <p className="text-sm text-muted-foreground">Browse the full provider catalog.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search providers" className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" autoFocus />
        </div>
        {popularProviders.length > 0 ? <section className="flex flex-col gap-2"><h4 className="text-sm font-medium text-foreground">Popular</h4><div className="rounded-xl border bg-muted/25 px-4">{popularProviders.map((provider) => renderOverviewRow(provider, "picker"))}</div></section> : null}
        {otherProviders.length > 0 ? <section className="flex flex-col gap-2"><h4 className="text-sm font-medium text-foreground">Other</h4><div className="rounded-xl border bg-muted/25 px-4">{otherProviders.map((provider) => renderOverviewRow(provider, "picker"))}</div></section> : null}
      </div>
    )
  }

  if (view === "detail" && detailProvider && detailForm) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={closeProviderDialog}><ChevronLeft className="size-4" /></Button>
          <div className="flex min-w-0 items-center gap-3">
            <ProviderIcon id={detailProvider.icon} className="size-5 shrink-0 text-foreground" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{detailForm.connectionId ? `Edit ${detailForm.name}` : `Connect ${detailProvider.name}`}</h3>
                {tag(detailProvider.tag)}
              </div>
              <p className="text-sm text-muted-foreground">{detailProvider.connectDescription}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {detailProvider.runtimeFlavor === "openai-compatible" ? <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Provider name</label><Input value={detailForm.name} onChange={(event) => updateDetailForm({ name: event.target.value })} placeholder="9router" className="h-12" autoFocus /></div> : null}
          {detailProvider.runtimeFlavor !== "ollama" ? <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">{apiKeyLabel(detailProvider.name, detailProvider.runtimeFlavor)}</label><Input type="password" value={detailForm.apiKey} onChange={(event) => updateDetailForm({ apiKey: event.target.value })} placeholder="API key" className="h-12" /></div> : null}
          {requiresBaseURL(detailProvider.runtimeFlavor) ? <div className="space-y-2"><label className="text-sm font-medium text-muted-foreground">Base URL</label><Input value={detailForm.baseURL} onChange={(event) => updateDetailForm({ baseURL: event.target.value })} placeholder={defaultBaseURLs[detailProvider.runtimeFlavor] ?? "https://"} className="h-12" /></div> : null}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Default assistant model</label>
              {detailOptions.length > 0 ? (
                <div className="w-full">
                  <Select value={detailForm.defaultModel} onValueChange={(value) => updateDetailForm({ defaultModel: value })}>
                    <SelectTrigger className="h-12 !w-full min-w-0 justify-between">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {detailOptions.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name || model.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
              <Input value={detailForm.defaultModel} onChange={(event) => updateDetailForm({ defaultModel: event.target.value })} placeholder="gpt-4.1" className="h-12" />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Available models</label>
            <textarea value={detailForm.modelsText} onChange={(event) => updateDetailForm({ modelsText: event.target.value })} placeholder={"gpt-4.1\ngpt-4.1-mini"} className="min-h-36 w-full rounded-md border bg-transparent px-3 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="text-xs text-muted-foreground">One model per line. These models will show up in the chat model picker for this provider.</p>
            {modelsLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Loading discovered models...</div> : null}
          </div>
          {detailError ? <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{detailError}</div> : null}
          <div><Button variant="secondary" size="lg" onClick={() => void handleConnect()} disabled={detailSaving} className="min-w-28">{detailSaving ? <><Loader2 className="mr-2 size-4 animate-spin" />Connecting...</> : "Continue"}</Button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
      <section className="flex flex-col gap-2"><h3 className="text-sm font-medium text-foreground">Connected providers</h3><div className="rounded-xl border bg-muted/25 px-4">{connectedConnections.length > 0 ? connectedConnections.map((connection) => renderConnectedRow(connection)) : <div className="py-5 text-sm text-muted-foreground">No providers connected yet.</div>}</div></section>
      <section className="flex flex-col gap-2"><h3 className="text-sm font-medium text-foreground">Popular providers</h3><div className="rounded-xl border bg-muted/25 px-4">{popularOverviewProviders.map((provider) => renderOverviewRow(provider))}</div></section>
      <section className="flex flex-col gap-2"><h3 className="text-sm font-medium text-foreground">Other</h3><div className="rounded-xl border bg-muted/25 px-4">{otherOverviewProviders.map((provider) => renderOverviewRow(provider))}</div></section>
      <Button variant="ghost" className="w-fit px-0 text-sm text-foreground hover:bg-transparent" onClick={() => { setPickerSearch(""); setView("picker") }}>View all providers</Button>
    </div>
  )
}
