"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, KeyRound, Loader2, Search as SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { ProviderIcon } from "@/components/provider-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { workspaceIpc } from "@/services/workspace-ipc"

type SearchProviderId = "ddg-search" | "brave-search" | "exa-search"
type SearchProviderView = "overview" | "detail"
type SearchProviderConfig = {
  apiKey: string
}
type SearchSettingsConfig = {
  defaultQuickSearchProvider: "ddg-search" | "brave-search"
}

type SearchProviderMeta = {
  id: SearchProviderId
  name: string
  description: string
  connectDescription: string
  icon: string
  configPath?: string
  toolName: string
  docsLabel: string
  defaultEligible?: boolean
}

const searchProviders: SearchProviderMeta[] = [
  {
    id: "ddg-search",
    name: "DuckDuckGo",
    description: "Keyless quick web search fallback for titles, URLs, and short summaries.",
    connectDescription: "DuckDuckGo works without an API key and is the built-in default quick search path.",
    icon: "ddg-search",
    toolName: "web-search",
    docsLabel: "DuckDuckGo",
    defaultEligible: true,
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Quick web search for titles, URLs, and short result summaries.",
    connectDescription: "Add your Brave Search API key so Flazz can use the built-in `web-search` tool.",
    icon: "brave-search",
    configPath: "config/brave-search.json",
    toolName: "web-search",
    docsLabel: "Brave Search API",
    defaultEligible: true,
  },
  {
    id: "exa-search",
    name: "Exa",
    description: "Deep research search with richer article text, highlights, and metadata.",
    connectDescription: "Add your Exa API key so Flazz can use the built-in `research-search` tool.",
    icon: "exa-search",
    configPath: "config/exa-search.json",
    toolName: "research-search",
    docsLabel: "Exa Search API",
  },
]

const providerById = Object.fromEntries(searchProviders.map((provider) => [provider.id, provider])) as Record<SearchProviderId, SearchProviderMeta>
const SEARCH_SETTINGS_PATH = "config/search-settings.json"

function parseSearchConfig(raw: string | null | undefined): SearchProviderConfig {
  if (!raw) return { apiKey: "" }
  try {
    const parsed = JSON.parse(raw) as { apiKey?: unknown }
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    }
  } catch {
    return { apiKey: "" }
  }
}

function parseSearchSettings(raw: string | null | undefined): SearchSettingsConfig {
  if (!raw) return { defaultQuickSearchProvider: "ddg-search" }
  try {
    const parsed = JSON.parse(raw) as { defaultQuickSearchProvider?: unknown }
    return {
      defaultQuickSearchProvider: parsed.defaultQuickSearchProvider === "brave-search" ? "brave-search" : "ddg-search",
    }
  } catch {
    return { defaultQuickSearchProvider: "ddg-search" }
  }
}

function connectedTag() {
  return (
    <span className="inline-flex items-center rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
      Connected
    </span>
  )
}

function missingTag() {
  return (
    <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
      Missing key
    </span>
  )
}

export function SearchSettingsPanel({ dialogOpen }: { dialogOpen: boolean }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<SearchProviderView>("overview")
  const [configs, setConfigs] = useState<Record<SearchProviderId, SearchProviderConfig>>({
    "ddg-search": { apiKey: "" },
    "brave-search": { apiKey: "" },
    "exa-search": { apiKey: "" },
  })
  const [settingsConfig, setSettingsConfig] = useState<SearchSettingsConfig>({
    defaultQuickSearchProvider: "ddg-search",
  })
  const [detailProviderId, setDetailProviderId] = useState<SearchProviderId | null>(null)
  const [detailApiKey, setDetailApiKey] = useState("")
  const [detailError, setDetailError] = useState<string | null>(null)

  const loadConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const [loaded, settingsResult] = await Promise.all([
        Promise.all(
        searchProviders.map(async (provider) => {
          if (!provider.configPath) {
            return [provider.id, { apiKey: "" }] as const
          }
          try {
            const result = await workspaceIpc.readFile(provider.configPath)
            return [provider.id, parseSearchConfig(result.data)] as const
          } catch {
            return [provider.id, { apiKey: "" }] as const
          }
        }),
        ),
        workspaceIpc.readFile(SEARCH_SETTINGS_PATH).catch(() => ({ data: "" })),
      ])
      setConfigs(Object.fromEntries(loaded) as Record<SearchProviderId, SearchProviderConfig>)
      setSettingsConfig(parseSearchSettings(settingsResult.data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!dialogOpen) return
    setView("overview")
    setDetailProviderId(null)
    setDetailApiKey("")
    setDetailError(null)
    void loadConfigs()
  }, [dialogOpen, loadConfigs])

  const connectedProviders = useMemo(
    () => searchProviders.filter((provider) => provider.configPath && configs[provider.id]?.apiKey.trim()),
    [configs],
  )

  const disconnectedProviders = useMemo(
    () => searchProviders.filter((provider) => provider.configPath && !configs[provider.id]?.apiKey.trim()),
    [configs],
  )

  const quickSearchProviders = useMemo(
    () => searchProviders.filter((provider) => provider.defaultEligible && (!provider.configPath || Boolean(configs[provider.id]?.apiKey.trim()))),
    [configs],
  )

  const detailProvider = detailProviderId ? providerById[detailProviderId] : null

  const openDetail = useCallback((providerId: SearchProviderId) => {
    setDetailProviderId(providerId)
    setDetailApiKey(configs[providerId]?.apiKey ?? "")
    setDetailError(null)
    setView("detail")
  }, [configs])

  const closeDetail = useCallback(() => {
    setView("overview")
    setDetailError(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!detailProvider) return
    if (!detailProvider.configPath) {
      setView("overview")
      setDetailProviderId(null)
      return
    }
    if (!detailApiKey.trim()) {
      setDetailError("API key is required")
      return
    }

    setSaving(true)
    setDetailError(null)
    try {
      const nextConfig = { apiKey: detailApiKey.trim() }
      await workspaceIpc.writeFile(
        detailProvider.configPath,
        JSON.stringify(nextConfig, null, 2) + "\n",
        { mkdirp: true },
      )
      setConfigs((current) => ({
        ...current,
        [detailProvider.id]: nextConfig,
      }))
      toast.success(`${detailProvider.name} API key saved`)
      setView("overview")
      setDetailProviderId(null)
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Failed to save API key")
    } finally {
      setSaving(false)
    }
  }, [detailApiKey, detailProvider])

  const handleDisconnect = useCallback(async () => {
    if (!detailProvider) return
    if (!detailProvider.configPath) {
      return
    }
    setSaving(true)
    setDetailError(null)
    try {
      const nextConfig = { apiKey: "" }
      await workspaceIpc.writeFile(
        detailProvider.configPath,
        JSON.stringify(nextConfig, null, 2) + "\n",
        { mkdirp: true },
      )
      setConfigs((current) => ({
        ...current,
        [detailProvider.id]: nextConfig,
      }))
      toast.success(`${detailProvider.name} disconnected`)
      setView("overview")
      setDetailProviderId(null)
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Failed to disconnect provider")
    } finally {
      setSaving(false)
    }
  }, [detailProvider])

  const handleDefaultProviderChange = useCallback(async (providerId: "ddg-search" | "brave-search") => {
    const previousProvider = settingsConfig.defaultQuickSearchProvider
    setSettingsConfig({ defaultQuickSearchProvider: providerId })
    try {
      await workspaceIpc.writeFile(
        SEARCH_SETTINGS_PATH,
        JSON.stringify({ defaultQuickSearchProvider: providerId }, null, 2) + "\n",
        { mkdirp: true },
      )
      const providerName = providerById[providerId].name
      toast.success(`${providerName} set as default quick search`)
    } catch (error) {
      setSettingsConfig({ defaultQuickSearchProvider: previousProvider })
      toast.error(error instanceof Error ? error.message : "Failed to save default search provider")
    }
  }, [settingsConfig.defaultQuickSearchProvider])

  const renderProviderRow = (provider: SearchProviderMeta) => {
    const isConnected = Boolean(configs[provider.id]?.apiKey.trim())
    return (
      <div key={provider.id} className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3 last:border-none">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => openDetail(provider.id)}
        >
          <ProviderIcon id={provider.icon} className="size-5 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{provider.name}</span>
                {isConnected ? connectedTag() : missingTag()}
                {provider.defaultEligible && settingsConfig.defaultQuickSearchProvider === provider.id ? (
                  <span className="inline-flex items-center rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    Default
                  </span>
                ) : null}
              </div>
              <p className="pt-0.5 text-xs text-muted-foreground">{provider.description}</p>
            </div>
        </button>
        <Button variant={isConnected ? "outline" : "secondary"} size="sm" className="min-w-24" onClick={() => openDetail(provider.id)}>
          {isConnected ? "Manage" : "Connect"}
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading search providers...
      </div>
    )
  }

  if (view === "detail" && detailProvider) {
    const isConnected = Boolean(configs[detailProvider.id]?.apiKey.trim())
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={closeDetail}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <ProviderIcon id={detailProvider.icon} className="size-5 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{detailProvider.name}</h3>
                {detailProvider.configPath ? (isConnected ? connectedTag() : missingTag()) : (
                  <span className="inline-flex items-center rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    No key needed
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{detailProvider.connectDescription}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {detailProvider.configPath ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">API key</label>
              <Input
                type="password"
                value={detailApiKey}
                onChange={(event) => {
                  setDetailApiKey(event.target.value)
                  setDetailError(null)
                }}
                placeholder={`Paste your ${detailProvider.docsLabel} key`}
                className="h-12"
                autoFocus
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
              DuckDuckGo is available immediately as the built-in keyless quick-search default.
            </div>
          )}

          <div className="rounded-xl border bg-muted/25 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border bg-background p-2 text-muted-foreground">
                <KeyRound className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Built-in tool</div>
                <p className="pt-0.5 text-sm text-muted-foreground">
                  This key enables <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{detailProvider.toolName}</code>.
                </p>
                {detailProvider.configPath ? (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Stored at <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{detailProvider.configPath}</code>
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {detailError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {detailError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {detailProvider.configPath ? (
              <>
                <Button variant="secondary" size="lg" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving...
                    </>
                  ) : isConnected ? (
                    "Save changes"
                  ) : (
                    "Connect"
                  )}
                </Button>
                {isConnected ? (
                  <Button variant="ghost" size="lg" onClick={() => void handleDisconnect()} disabled={saving}>
                    Disconnect
                  </Button>
                ) : null}
              </>
            ) : (
              <Button variant="secondary" size="lg" onClick={closeDetail}>
                Back
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <SearchIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Default quick search provider</h3>
        </div>
        <div className="rounded-xl border bg-muted/25 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {quickSearchProviders.map((provider) => {
              const isSelected = settingsConfig.defaultQuickSearchProvider === provider.id
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => void handleDefaultProviderChange(provider.id as "ddg-search" | "brave-search")}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-background"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ProviderIcon id={provider.icon} className="size-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{provider.name}</span>
                        {isSelected ? (
                          <span className="inline-flex items-center rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <p className="pt-0.5 text-xs text-muted-foreground">{provider.description}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <SearchIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Connected search providers</h3>
        </div>
        <div className="rounded-xl border bg-muted/25 px-4">
          {connectedProviders.length > 0 ? (
            connectedProviders.map(renderProviderRow)
          ) : (
            <div className="py-5 text-sm text-muted-foreground">No search providers connected yet.</div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Available providers</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {disconnectedProviders.map(renderProviderRow)}
        </div>
      </section>
    </div>
  )
}
