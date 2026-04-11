import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ProviderIcon } from '@/components/provider-icon'
import { cn } from '@/lib/utils'
import {
  MODEL_CONFIG_PATH,
  PROVIDER_CONNECTIONS_PATH,
  connectionToRuntimeConfig,
  parseProviderConnections,
  type ModelConfig,
  type RuntimeProviderFlavor,
  type SavedProviderConnections,
} from '@/features/providers/provider-connections'
import { modelsActionsIpc } from '@/services/models-actions-ipc'
import { modelsIpc } from '@/services/models-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'

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
  latestModelIds: Set<string>
}

const providerMeta: Record<RuntimeProviderFlavor, { name: string; icon: string; rank: number }> = {
  anthropic: { name: 'Anthropic', icon: 'anthropic', rank: 0 },
  openai: { name: 'OpenAI', icon: 'openai', rank: 1 },
  google: { name: 'Google', icon: 'google', rank: 2 },
  openrouter: { name: 'OpenRouter', icon: 'openrouter', rank: 3 },
  aigateway: { name: 'Vercel AI Gateway', icon: 'vercel', rank: 4 },
  deepseek: { name: 'DeepSeek', icon: 'deepseek', rank: 10 },
  groq: { name: 'Groq', icon: 'groq', rank: 11 },
  mistral: { name: 'Mistral', icon: 'mistral', rank: 12 },
  xai: { name: 'xAI', icon: 'xai', rank: 13 },
  togetherai: { name: 'Together AI', icon: 'togetherai', rank: 14 },
  perplexity: { name: 'Perplexity', icon: 'perplexity', rank: 15 },
  azure: { name: 'Azure OpenAI', icon: 'azure', rank: 16 },
  'amazon-bedrock': { name: 'Amazon Bedrock', icon: 'amazon-bedrock', rank: 17 },
  cohere: { name: 'Cohere', icon: 'cohere', rank: 18 },
  'github-models': { name: 'GitHub Models', icon: 'github-models', rank: 19 },
  'google-vertex': { name: 'Google Vertex', icon: 'google-vertex', rank: 20 },
  'cloudflare-workers-ai': { name: 'Cloudflare Workers AI', icon: 'cloudflare-workers-ai', rank: 21 },
  'fireworks-ai': { name: 'Fireworks AI', icon: 'fireworks-ai', rank: 22 },
  deepinfra: { name: 'DeepInfra', icon: 'deepinfra', rank: 23 },
  lmstudio: { name: 'LM Studio', icon: 'lmstudio', rank: 24 },
  zhipuai: { name: 'Zhipu AI', icon: 'zhipuai', rank: 25 },
  moonshotai: { name: 'Moonshot AI', icon: 'moonshotai', rank: 26 },
  siliconflow: { name: 'SiliconFlow', icon: 'siliconflow', rank: 27 },
  requesty: { name: 'Requesty', icon: 'requesty', rank: 28 },
  'openai-compatible': { name: 'Custom', icon: 'synthetic', rank: 29 },
  ollama: { name: 'Ollama', icon: 'synthetic', rank: 30 },
}

function normalizeModelList(models: ModelOption[]) {
  const deduped = new Map<string, ModelOption>()
  for (const model of models) {
    if (!model.id) continue
    if (!deduped.has(model.id)) deduped.set(model.id, model)
  }
  return Array.from(deduped.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
}

function getLatestModelIds(models: ModelOption[]) {
  const dated = models.filter((model) => model.release_date)
  if (dated.length === 0) return new Set<string>()
  const latest = [...dated].sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))[0]?.release_date
  return new Set(dated.filter((model) => model.release_date === latest).map((model) => model.id))
}

function isFreeModel(model: ModelOption) {
  const haystack = `${model.name || ''} ${model.id}`.toLowerCase()
  return haystack.includes('free')
}

export function ChatModelSelector() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [groups, setGroups] = useState<ProviderGroup[]>([])
  const [runtimeConfig, setRuntimeConfig] = useState<ModelConfig | null>(null)
  const [connections, setConnections] = useState<SavedProviderConnections>({ connections: [] })
  const [saving, setSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const [runtimeResult, modelsResult] = await Promise.all([
        workspaceIpc.readFile(MODEL_CONFIG_PATH).catch(() => null),
        modelsIpc.list().catch(() => ({ providers: [] })),
      ])

      let nextRuntime: ModelConfig | null = null
      if (runtimeResult?.data) {
        nextRuntime = JSON.parse(runtimeResult.data) as ModelConfig
      }

      let nextConnections: SavedProviderConnections = { connections: [] }
      try {
        const connectionsResult = await workspaceIpc.readFile(PROVIDER_CONNECTIONS_PATH)
        nextConnections = parseProviderConnections(JSON.parse(connectionsResult.data), nextRuntime, (flavor) => providerMeta[flavor]?.name || flavor)
      } catch {
        nextConnections = parseProviderConnections(null, nextRuntime, (flavor) => providerMeta[flavor]?.name || flavor)
      }

      if (!nextRuntime && nextConnections.activeProviderId) {
        const activeConnection = nextConnections.connections.find((connection) => connection.id === nextConnections.activeProviderId)
        nextRuntime = activeConnection ? connectionToRuntimeConfig(activeConnection) : null
      }

      const catalog = new Map<string, ModelOption[]>()
      for (const provider of modelsResult.providers || []) {
        catalog.set(provider.id, provider.models || [])
      }

      const nextGroups = nextConnections.connections
        .map((connection) => {
          const discoveredModels = catalog.get(connection.provider.flavor) || []
          const fallbackModels = connection.models.map((model) => ({ id: model, name: model }))
          const models = normalizeModelList([...discoveredModels, ...fallbackModels])
          const meta = providerMeta[connection.provider.flavor]
          return {
            id: connection.id,
            flavor: connection.provider.flavor,
            name: connection.name,
            icon: meta?.icon || 'synthetic',
            models,
            latestModelIds: getLatestModelIds(models),
          }
        })
        .filter((group) => group.models.length > 0)
        .sort((a, b) => {
          const aRank = providerMeta[a.flavor]?.rank ?? 999
          const bRank = providerMeta[b.flavor]?.rank ?? 999
          if (aRank !== bRank) return aRank - bRank
          return a.name.localeCompare(b.name)
        })

      setRuntimeConfig(nextRuntime)
      setConnections(nextConnections)
      setGroups(nextGroups)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (!open) return
    void loadConfig()
  }, [open, loadConfig])

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return groups
    return groups
      .map((group) => ({
        ...group,
        models: group.models.filter((model) => `${group.name} ${model.name || ''} ${model.id}`.toLowerCase().includes(query)),
      }))
      .filter((group) => group.models.length > 0 || group.name.toLowerCase().includes(query))
  }, [groups, search])

  const currentProviderId = connections.activeProviderId
  const currentFlavor = runtimeConfig?.provider.flavor
  const currentModelId = runtimeConfig?.model

  const handleSelect = useCallback(async (connectionId: string, modelId: string) => {
    const selectedConnection = connections.connections.find((connection) => connection.id === connectionId)
    if (!selectedConnection) {
      toast.error('Connect this provider in Settings > Providers first')
      return
    }

    const nextRuntime = connectionToRuntimeConfig(selectedConnection, modelId)

    const nextConnections: SavedProviderConnections = {
      activeProviderId: connectionId,
      connections: connections.connections.map((connection) =>
        connection.id === connectionId ? { ...connection, defaultModel: modelId } : connection,
      ),
    }

    setSaving(true)
    try {
      await workspaceIpc.writeFile(PROVIDER_CONNECTIONS_PATH, JSON.stringify(nextConnections, null, 2))
      await modelsActionsIpc.saveConfig(nextRuntime)
      setRuntimeConfig(nextRuntime)
      setConnections(nextConnections)
      setOpen(false)
      toast.success(`Switched to ${modelId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to switch model')
    } finally {
      setSaving(false)
    }
  }, [connections])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-7 max-w-[240px] justify-start gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-muted focus-visible:ring-0"
        >
          {currentFlavor ? (
            <ProviderIcon id={providerMeta[currentFlavor]?.icon || 'synthetic'} className="size-3.5 shrink-0" />
          ) : (
            <Search className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{currentModelId || 'Select model'}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="flex h-80 w-80 flex-col overflow-hidden p-2"
      >
        <div className="flex items-center gap-2 border-b pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md border border-border/70 bg-muted/40 px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search models"
              className="h-8 rounded-none border-0 !bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:!bg-transparent"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => toast.message('Open Settings > Providers to connect more providers')}
            aria-label="Connect provider"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => toast.message('Manage models in Settings > Providers')}
            aria-label="Manage models"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading models...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
              <div>No connected models found.</div>
              <div className="text-xs text-muted-foreground/80">Connect a provider in Settings &gt; Providers first.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((group) => (
                <div key={group.id}>
                  <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.name}</div>
                  <div className="space-y-1">
                    {group.models.map((model) => {
                      const selected = group.id === currentProviderId && model.id === currentModelId
                      return (
                        <button
                          key={`${group.id}:${model.id}`}
                          type="button"
                          disabled={saving}
                          onClick={() => void handleSelect(group.id, model.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                            selected ? 'bg-muted text-foreground' : 'hover:bg-muted/60'
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{model.name || model.id}</span>
                              {isFreeModel(model) && (
                                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                                  Free
                                </Badge>
                              )}
                              {group.latestModelIds.has(model.id) && (
                                <Badge variant="outline" className="text-[10px]">
                                  Latest
                                </Badge>
                              )}
                            </div>
                            {(model.name || '') !== model.id && (
                              <div className="truncate pt-0.5 text-xs text-muted-foreground">{model.id}</div>
                            )}
                          </div>
                          {selected && <Check className="size-4 shrink-0 text-foreground" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
