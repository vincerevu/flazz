"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, X } from "lucide-react"

import { ProviderIcon } from "@/components/provider-icon"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  MODEL_CONFIG_PATH,
  PROVIDER_CONNECTIONS_PATH,
  parseProviderConnections,
  type RuntimeProviderFlavor,
  type SavedProviderConnections,
} from "@/features/providers/provider-connections"
import { workspaceIpc } from "@/services/workspace-ipc"
import { modelsIpc } from "@/services/models-ipc"

type ModelOption = {
  id: string
  name?: string
  release_date?: string
}

type ProviderGroup = {
  id: string
  flavor: RuntimeProviderFlavor
  name: string
  icon: string
  models: ModelOption[]
}
const VISIBILITY_STORAGE_KEY = "Flazz-model-visibility-v1"

const providerMeta: Record<RuntimeProviderFlavor, { name: string; icon: string; rank: number }> = {
  anthropic: { name: "Anthropic", icon: "anthropic", rank: 0 },
  openai: { name: "OpenAI", icon: "openai", rank: 1 },
  google: { name: "Google", icon: "google", rank: 2 },
  openrouter: { name: "OpenRouter", icon: "openrouter", rank: 3 },
  aigateway: { name: "Vercel AI Gateway", icon: "vercel", rank: 4 },
  deepseek: { name: "DeepSeek", icon: "deepseek", rank: 10 },
  groq: { name: "Groq", icon: "groq", rank: 11 },
  mistral: { name: "Mistral", icon: "mistral", rank: 12 },
  xai: { name: "xAI", icon: "xai", rank: 13 },
  togetherai: { name: "Together AI", icon: "togetherai", rank: 14 },
  perplexity: { name: "Perplexity", icon: "perplexity", rank: 15 },
  azure: { name: "Azure OpenAI", icon: "azure", rank: 16 },
  "amazon-bedrock": { name: "Amazon Bedrock", icon: "amazon-bedrock", rank: 17 },
  cohere: { name: "Cohere", icon: "cohere", rank: 18 },
  "github-models": { name: "GitHub Models", icon: "github-models", rank: 19 },
  "google-vertex": { name: "Google Vertex", icon: "google-vertex", rank: 20 },
  "cloudflare-workers-ai": { name: "Cloudflare Workers AI", icon: "cloudflare-workers-ai", rank: 21 },
  "fireworks-ai": { name: "Fireworks AI", icon: "fireworks-ai", rank: 22 },
  deepinfra: { name: "DeepInfra", icon: "deepinfra", rank: 23 },
  lmstudio: { name: "LM Studio", icon: "lmstudio", rank: 24 },
  zhipuai: { name: "Zhipu AI", icon: "zhipuai", rank: 25 },
  moonshotai: { name: "Moonshot AI", icon: "moonshotai", rank: 26 },
  siliconflow: { name: "SiliconFlow", icon: "siliconflow", rank: 27 },
  requesty: { name: "Requesty", icon: "requesty", rank: 28 },
  "openai-compatible": { name: "Custom", icon: "synthetic", rank: 29 },
  ollama: { name: "Ollama", icon: "synthetic", rank: 30 },
}

function modelKey(providerID: string, modelID: string) {
  return `${providerID}:${modelID}`
}

function normalizeModelList(models: ModelOption[]) {
  const deduped = new Map<string, ModelOption>()
  for (const model of models) {
    if (!model.id) continue
    if (!deduped.has(model.id)) {
      deduped.set(model.id, model)
    }
  }
  return Array.from(deduped.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
}

function readVisibilityState() {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(VISIBILITY_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

export function SettingsModelsPanel({ dialogOpen }: { dialogOpen: boolean }) {
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [groups, setGroups] = useState<ProviderGroup[]>([])
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => readVisibilityState())

  useEffect(() => {
    try {
      localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(visibility))
    } catch {}
  }, [visibility])

  useEffect(() => {
    if (!dialogOpen) return

    async function load() {
      setLoading(true)
      try {
        const [runtimeConfigResult, modelsListResult] = await Promise.all([
          workspaceIpc.readFile(MODEL_CONFIG_PATH).catch(() => null),
          modelsIpc.list().catch(() => ({ providers: [] })),
        ])

        const runtimeConfig = runtimeConfigResult?.data ? JSON.parse(runtimeConfigResult.data) : null
        let connections: SavedProviderConnections = { connections: [] }

        try {
          const connectionResult = await workspaceIpc.readFile(PROVIDER_CONNECTIONS_PATH)
          connections = parseProviderConnections(JSON.parse(connectionResult.data), runtimeConfig, (flavor) => providerMeta[flavor]?.name || flavor)
        } catch {
          connections = parseProviderConnections(null, runtimeConfig, (flavor) => providerMeta[flavor]?.name || flavor)
        }

        const catalog = new Map<string, ModelOption[]>()
        for (const provider of modelsListResult.providers || []) {
          catalog.set(provider.id, provider.models || [])
        }

        const nextGroups = connections.connections
          .map((connection) => {
            const discoveredModels = catalog.get(connection.provider.flavor) || []
            const fallbackModels = connection.models.map((model) => ({ id: model, name: model }))
            const models = normalizeModelList([...discoveredModels, ...fallbackModels])
            const meta = providerMeta[connection.provider.flavor]
            return {
              id: connection.id,
              flavor: connection.provider.flavor,
              name: connection.name,
              icon: meta?.icon || "synthetic",
              models,
            }
          })
          .sort((a, b) => {
            const aRank = providerMeta[a.flavor]?.rank ?? 999
            const bRank = providerMeta[b.flavor]?.rank ?? 999
            if (aRank !== bRank) return aRank - bRank
            return a.name.localeCompare(b.name)
          })

        setGroups(nextGroups)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [dialogOpen])

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return groups

    return groups
      .map((group) => ({
        ...group,
        models: group.models.filter((model) => {
          const haystack = `${group.name} ${model.name || ""} ${model.id}`.toLowerCase()
          return haystack.includes(query)
        }),
      }))
      .filter((group) => group.models.length > 0 || group.name.toLowerCase().includes(query))
  }, [groups, search])

  const isVisible = (providerID: string, modelID: string) =>
    visibility[modelKey(providerID, modelID)] ?? true

  const setModelVisibility = (providerID: string, modelID: string, next: boolean) => {
    setVisibility((current) => ({
      ...current,
      [modelKey(providerID, modelID)]: next,
    }))
  }

  const setProviderVisibility = (providerID: string, models: ModelOption[], next: boolean) => {
    setVisibility((current) => {
      const updated = { ...current }
      for (const model of models) {
        updated[modelKey(providerID, model.id)] = next
      }
      return updated
    })
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading models...
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col overflow-y-auto px-1 pb-6">
      <div className="sticky top-0 z-10 bg-background pb-5 pt-2">
        <div className="pb-4">
          <h3 className="text-sm font-medium text-foreground">Models</h3>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search models"
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border bg-muted/25 px-4 py-8 text-center text-sm text-muted-foreground">
          Connect at least one provider in the Providers tab to manage models here.
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-xl border bg-muted/25 px-4 py-8 text-center text-sm text-muted-foreground">
          No models matched your search.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {filteredGroups.map((group) => {
            const allVisible = group.models.length > 0 && group.models.every((model) => isVisible(group.id, model.id))

            return (
              <section key={group.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 pb-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderIcon id={group.icon} className="size-5 shrink-0 text-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">{group.name}</span>
                  </div>
                  {group.models.length > 0 ? (
                    <Switch
                      checked={allVisible}
                      onCheckedChange={(checked) => setProviderVisibility(group.id, group.models, checked)}
                      aria-label={`Toggle all ${group.name} models`}
                    />
                  ) : null}
                </div>

                <div className="rounded-xl border bg-muted/25 px-4">
                  {group.models.length > 0 ? (
                    group.models.map((model) => (
                      <div
                        key={model.id}
                        className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-3 last:border-none sm:flex-nowrap"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{model.name || model.id}</div>
                          <div className="truncate pt-0.5 text-xs text-muted-foreground">{model.id}</div>
                        </div>
                        <div className="shrink-0">
                          <Switch
                            checked={isVisible(group.id, model.id)}
                            onCheckedChange={(checked) => setModelVisibility(group.id, model.id, checked)}
                            aria-label={`Toggle model ${model.name || model.id}`}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-5 text-sm text-muted-foreground">
                      No models discovered for this provider yet.
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
