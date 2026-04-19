"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, Plus, Plug, Search } from "lucide-react"
import { FaLinkedinIn, FaMicrosoft } from "react-icons/fa6"
import {
  SiDropbox,
  SiGithub,
  SiGoogle,
  SiHubspot,
  SiJira,
  SiLinear,
  SiNotion,
  SiSalesforce,
  SiSlack,
  SiTrello,
} from "react-icons/si"
import { toast } from "sonner"
import { COMPOSIO_SECTION_BY_SLUG } from "@flazz/shared"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { composioIpc } from "@/services/composio-ipc"
import { composioActionsIpc } from "@/services/composio-actions-ipc"

type IntegrationMeta = {
  slug: string
  name: string
  description: string
  group: "popular" | "other"
  icon: React.ElementType
  supportsManagedOauth: boolean
}

type IntegrationConnectionState = {
  isConnected: boolean
  status?: string
}

function IntegrationStatusBadge({
  tone,
  children,
}: {
  tone: "connected" | "warning"
  children: React.ReactNode
}) {
  const classes =
    tone === "connected"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-300"

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", classes)}>
      {children}
    </span>
  )
}

function BrandIconBadge({
  icon: Icon,
  iconClassName,
}: {
  icon: React.ElementType
  iconClassName?: string
}) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background shadow-sm">
      <Icon className={cn("size-5", iconClassName)} aria-hidden="true" />
    </div>
  )
}

const integrationBrandClassName: Record<string, string> = {
  gmail: "text-[#EA4335]",
  googlecalendar: "text-[#4285F4]",
  googlemeet: "text-[#0F9D58]",
  googledrive: "text-[#34A853]",
  slack: "text-[#611F69]",
  notion: "text-black dark:text-white",
  github: "text-zinc-950 dark:text-white",
  linear: "text-[#5E6AD2]",
  linkedin: "text-[#0A66C2]",
  jira: "text-[#1868DB]",
  trello: "text-[#026AA7]",
  hubspot: "text-[#FF7A59]",
  salesforce: "text-[#00A1E0]",
  dropbox: "text-[#0061FF]",
  onedrive: "text-[#0A64AD]",
}

const integrationIconBySlug: Record<string, React.ElementType> = {
  gmail: SiGoogle,
  googlecalendar: SiGoogle,
  googlemeet: SiGoogle,
  googledrive: SiGoogle,
  slack: SiSlack,
  notion: SiNotion,
  github: SiGithub,
  linear: SiLinear,
  linkedin: FaLinkedinIn,
  jira: SiJira,
  trello: SiTrello,
  hubspot: SiHubspot,
  salesforce: SiSalesforce,
  dropbox: SiDropbox,
  onedrive: FaMicrosoft,
}

export function AccountsSettingsPanel() {
  const [toolkits, setToolkits] = useState<IntegrationMeta[]>([])
  const [connectionStatus, setConnectionStatus] = useState<Record<string, IntegrationConnectionState>>({})
  const [composioConfigured, setComposioConfigured] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<"overview" | "picker" | "detail">("overview")
  const [detailIntegrationSlug, setDetailIntegrationSlug] = useState<string | null>(null)
  const [detailReturnView, setDetailReturnView] = useState<"overview" | "picker">("overview")
  const [detailError, setDetailError] = useState<string | null>(null)
  const [composioApiKey, setComposioApiKey] = useState("")
  const [pickerSearch, setPickerSearch] = useState("")

  const refreshConnectionStatuses = useCallback(async (catalog: IntegrationMeta[]) => {
    if (catalog.length === 0) {
      setConnectionStatus({})
      return
    }

    const entries = await Promise.all(
      catalog.map(async (toolkit) => {
        try {
          const result = await composioActionsIpc.getConnectionStatus(toolkit.slug)
          return [toolkit.slug, result] as const
        } catch {
          return [toolkit.slug, { isConnected: false }] as const
        }
      }),
    )

    setConnectionStatus(Object.fromEntries(entries))
  }, [])

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      const configResult = await composioActionsIpc.isConfigured()
      setComposioConfigured(configResult.configured)

      if (!configResult.configured) {
        setToolkits([])
        setConnectionStatus({})
        return
      }

      const result = await composioActionsIpc.listToolkits()
      const fetchedCatalog: IntegrationMeta[] = result.items
        .map((item) => ({
          slug: item.slug,
          name: item.name || item.slug,
          description: item.meta.description || "Connect this integration through Composio.",
          group: COMPOSIO_SECTION_BY_SLUG[item.slug] || "other",
          icon: integrationIconBySlug[item.slug] || Plug,
          supportsManagedOauth: (item.composio_managed_auth_schemes || []).includes("OAUTH2"),
        }))
        .sort((a, b) => {
          if (a.group !== b.group) {
            return a.group === "popular" ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })

      setToolkits(fetchedCatalog)
      await refreshConnectionStatuses(fetchedCatalog)
    } catch {
      setToolkits([])
      setConnectionStatus({})
    } finally {
      setCatalogLoading(false)
    }
  }, [refreshConnectionStatuses])

  const handleSaveApiKey = useCallback(async () => {
    const trimmedApiKey = composioApiKey.trim()
    if (!trimmedApiKey) {
      setDetailError("Composio API key is required")
      return
    }

    setCatalogLoading(true)
    try {
      const result = await composioActionsIpc.setApiKey(trimmedApiKey)
      if (!result.success) {
        setDetailError(result.error || "Failed to save Composio API key")
        return
      }
      setDetailError(null)
      setComposioConfigured(true)
      toast.success("Composio API key saved")
      await refreshCatalog()
    } catch {
      setDetailError("Failed to save Composio API key")
    } finally {
      setCatalogLoading(false)
    }
  }, [composioApiKey, refreshCatalog])

  const handleConnect = useCallback(async (toolkitSlug: string) => {
    if (!composioConfigured) {
      const trimmedApiKey = composioApiKey.trim()
      if (!trimmedApiKey) {
        setDetailError("Composio API key is required before connecting an integration")
        return
      }

      try {
        const result = await composioActionsIpc.setApiKey(trimmedApiKey)
        if (!result.success) {
          setDetailError(result.error || "Failed to save Composio API key")
          return
        }
        setComposioConfigured(true)
        toast.success("Composio API key saved")
      } catch {
        setDetailError("Failed to save Composio API key")
        return
      }
    }

    setConnectingToolkit(toolkitSlug)
    setStatusLoading((prev) => ({ ...prev, [toolkitSlug]: true }))

    try {
      const result = await composioActionsIpc.initiateConnection(toolkitSlug)
      if (!result.success) {
        setDetailError(result.error || `Failed to connect ${toolkitSlug}`)
        setConnectingToolkit(null)
        setStatusLoading((prev) => ({ ...prev, [toolkitSlug]: false }))
      }
    } catch {
      setDetailError(`Failed to connect ${toolkitSlug}`)
      setConnectingToolkit(null)
      setStatusLoading((prev) => ({ ...prev, [toolkitSlug]: false }))
    }
  }, [composioApiKey, composioConfigured])

  const handleDisconnect = useCallback(async (toolkitSlug: string) => {
    setStatusLoading((prev) => ({ ...prev, [toolkitSlug]: true }))
    try {
      const result = await composioActionsIpc.disconnect(toolkitSlug)
      if (result.success) {
        await refreshCatalog()
        setView("overview")
        toast.success(`Disconnected ${toolkitSlug}`)
      } else {
        setDetailError(`Failed to disconnect ${toolkitSlug}`)
      }
    } catch {
      setDetailError(`Failed to disconnect ${toolkitSlug}`)
    } finally {
      setStatusLoading((prev) => ({ ...prev, [toolkitSlug]: false }))
    }
  }, [refreshCatalog])

  useEffect(() => {
    let mounted = true
    void refreshCatalog()

    const cleanup = composioIpc.onDidConnect((event) => {
      if (!mounted) return
      setConnectingToolkit(null)
      setStatusLoading((prev) => ({ ...prev, [event.toolkitSlug]: false }))
      void refreshCatalog()

      if (event.success) {
        setDetailError(null)
        setView("overview")
        toast.success(`Connected ${event.toolkitSlug}`)
      } else {
        setDetailError(event.error || `Failed to connect ${event.toolkitSlug}`)
        toast.error(event.error || `Failed to connect ${event.toolkitSlug}`)
      }
    })

    return () => {
      mounted = false
      cleanup()
    }
  }, [refreshCatalog])

  const connectedIntegrations = useMemo(
    () =>
      toolkits.filter((integration) => {
        const status = connectionStatus[integration.slug]
        return status?.isConnected || Boolean(status?.status)
      }),
    [connectionStatus, toolkits],
  )

  const popularIntegrations = useMemo(
    () =>
      toolkits.filter((integration) => {
        const status = connectionStatus[integration.slug]
        return integration.group === "popular" && !status?.isConnected && !status?.status
      }),
    [connectionStatus, toolkits],
  )

  const otherIntegrations = useMemo(
    () =>
      toolkits.filter((integration) => {
        const status = connectionStatus[integration.slug]
        return integration.group === "other" && !status?.isConnected && !status?.status
      }),
    [connectionStatus, toolkits],
  )

  const filteredToolkits = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    if (!query) return toolkits
    return toolkits.filter((integration) => {
      return (
        integration.name.toLowerCase().includes(query) ||
        integration.slug.toLowerCase().includes(query) ||
        integration.description.toLowerCase().includes(query)
      )
    })
  }, [pickerSearch, toolkits])

  const pickerPopularIntegrations = useMemo(
    () =>
      filteredToolkits.filter((integration) => {
        const status = connectionStatus[integration.slug]
        return integration.group === "popular" && !status?.isConnected && !status?.status
      }),
    [connectionStatus, filteredToolkits],
  )

  const pickerOtherIntegrations = useMemo(
    () =>
      filteredToolkits.filter((integration) => {
        const status = connectionStatus[integration.slug]
        return integration.group === "other" && !status?.isConnected && !status?.status
      }),
    [connectionStatus, filteredToolkits],
  )

  const overviewPopularIntegrations = popularIntegrations.slice(0, 6)
  const overviewOtherIntegrations = otherIntegrations.slice(0, 6)
  const hasMoreIntegrations =
    popularIntegrations.length > overviewPopularIntegrations.length ||
    otherIntegrations.length > overviewOtherIntegrations.length

  const detailIntegration = detailIntegrationSlug
    ? toolkits.find((integration) => integration.slug === detailIntegrationSlug) ?? null
    : null
  const detailStatus = detailIntegration ? connectionStatus[detailIntegration.slug] : undefined
  const detailConnected = Boolean(detailStatus?.isConnected)
  const detailNeedsAttention = Boolean(detailStatus?.status && !detailStatus?.isConnected)
  const detailLoading = detailIntegration
    ? Boolean(statusLoading[detailIntegration.slug] || connectingToolkit === detailIntegration.slug)
    : false

  const openIntegrationDetail = (integrationSlug: string, returnView: "overview" | "picker" = "overview") => {
    setDetailError(null)
    setComposioApiKey("")
    setDetailIntegrationSlug(integrationSlug)
    setDetailReturnView(returnView)
    setView("detail")
  }

  const renderIntegrationRow = (integration: IntegrationMeta, returnView: "overview" | "picker" = "overview") => {
    const IntegrationIcon = integration.icon
    const status = connectionStatus[integration.slug]
    const connected = Boolean(status?.isConnected)
    const needsAttention = Boolean(status?.status && !status?.isConnected)
    const loading = Boolean(statusLoading[integration.slug] || connectingToolkit === integration.slug)

    return (
      <div key={integration.slug} className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3 last:border-none">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => openIntegrationDetail(integration.slug, returnView)}
        >
          <BrandIconBadge
            icon={IntegrationIcon}
            iconClassName={cn("size-[18px]", integrationBrandClassName[integration.slug])}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{integration.name}</span>
              {needsAttention ? (
                <IntegrationStatusBadge tone="warning">
                  <AlertTriangle className="size-3.5" />
                  Needs attention
                </IntegrationStatusBadge>
              ) : connected ? (
                <IntegrationStatusBadge tone="connected">
                  <CheckCircle2 className="size-3.5" />
                  Connected
                </IntegrationStatusBadge>
              ) : null}
            </div>
            <p className="pt-0.5 text-xs text-muted-foreground">{integration.description}</p>
          </div>
        </button>
        <Button
          variant={connected ? "ghost" : "secondary"}
          size="sm"
          className={connected ? undefined : "min-w-24"}
          onClick={() => openIntegrationDetail(integration.slug, returnView)}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-1 size-3.5 animate-spin" />
              Connecting...
            </>
          ) : needsAttention ? (
            "Reconnect"
          ) : connected ? (
            "Manage"
          ) : (
            <>
              <Plus className="mr-1 size-3.5" />
              Connect
            </>
          )}
        </Button>
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
            <h3 className="text-base font-semibold text-foreground">Connect integration</h3>
            <p className="text-sm text-muted-foreground">Browse the live Composio integrations catalog.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={pickerSearch}
            onChange={(event) => setPickerSearch(event.target.value)}
            placeholder="Search integrations"
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>

        {pickerPopularIntegrations.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-foreground">Popular integrations</h4>
            <div className="rounded-xl border bg-muted/25 px-4">
              {pickerPopularIntegrations.map((integration) => renderIntegrationRow(integration, "picker"))}
            </div>
          </section>
        ) : null}

        {pickerOtherIntegrations.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-foreground">Other</h4>
            <div className="rounded-xl border bg-muted/25 px-4">
              {pickerOtherIntegrations.map((integration) => renderIntegrationRow(integration, "picker"))}
            </div>
          </section>
        ) : null}

        {pickerPopularIntegrations.length === 0 && pickerOtherIntegrations.length === 0 ? (
          <div className="rounded-xl border bg-muted/25 px-4 py-5 text-sm text-muted-foreground">
            No integrations matched your search.
          </div>
        ) : null}
      </div>
    )
  }

  if (view === "detail" && detailIntegration) {
    const DetailIcon = detailIntegration.icon

    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => {
              setDetailError(null)
              setView(detailReturnView)
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <BrandIconBadge
              icon={DetailIcon}
              iconClassName={cn("size-[18px]", integrationBrandClassName[detailIntegration.slug])}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">Connect {detailIntegration.name}</h3>
                {detailNeedsAttention ? (
                  <IntegrationStatusBadge tone="warning">
                    <AlertTriangle className="size-3.5" />
                    Needs attention
                  </IntegrationStatusBadge>
                ) : detailConnected ? (
                  <IntegrationStatusBadge tone="connected">
                    <CheckCircle2 className="size-3.5" />
                    Connected
                  </IntegrationStatusBadge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{detailIntegration.description}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Flazz will use Composio to manage the OAuth handshake for {detailIntegration.name}.
          </div>

          {!detailIntegration.supportsManagedOauth ? (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              {detailIntegration.name} is in the Composio catalog, but managed OAuth is not available for this toolkit yet.
            </div>
          ) : null}

          {detailError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {detailError}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => void handleConnect(detailIntegration.slug)}
              disabled={detailLoading || !detailIntegration.supportsManagedOauth}
              className="min-w-28"
            >
              {detailLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Connecting...
                </>
              ) : detailNeedsAttention ? (
                "Reconnect"
              ) : (
                "Continue"
              )}
            </Button>
            {detailConnected ? (
              <Button variant="ghost" size="lg" onClick={() => void handleDisconnect(detailIntegration.slug)} disabled={detailLoading}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
      {!composioConfigured ? (
        <section className="flex flex-col gap-3">
          <div className="rounded-xl border bg-muted/25 p-5">
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-foreground">Connect Composio first</h3>
                <p className="text-sm text-muted-foreground">
                  Save one Composio API key, then Flazz will fetch the live integrations catalog from Composio.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Composio API key</label>
                <div className="text-xs text-muted-foreground">
                  Get your API key from{" "}
                  <a
                    href="https://app.composio.dev/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    app.composio.dev/settings
                  </a>
                  .
                </div>
                <Input
                  type="password"
                  value={composioApiKey}
                  onChange={(event) => setComposioApiKey(event.target.value)}
                  placeholder="Enter your Composio API key"
                  className="h-12"
                />
              </div>
              {detailError ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {detailError}
                </div>
              ) : null}
              <div>
                <Button variant="secondary" onClick={() => void handleSaveApiKey()} disabled={catalogLoading}>
                  {catalogLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Composio key"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {composioConfigured ? (
        <>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Connected integrations</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {catalogLoading ? (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading integrations...
            </div>
          ) : connectedIntegrations.length > 0 ? (
            connectedIntegrations.map((integration) => renderIntegrationRow(integration))
          ) : (
            <div className="py-5 text-sm text-muted-foreground">No integrations connected yet.</div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Popular integrations</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {overviewPopularIntegrations.length > 0 ? (
            overviewPopularIntegrations.map((integration) => renderIntegrationRow(integration))
          ) : (
            <div className="py-5 text-sm text-muted-foreground">Popular integrations are already connected.</div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 pb-4">
        <h3 className="text-sm font-medium text-foreground">Other</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {overviewOtherIntegrations.length > 0 ? (
            overviewOtherIntegrations.map((integration) => renderIntegrationRow(integration))
          ) : (
            <div className="py-5 text-sm text-muted-foreground">More integrations coming soon.</div>
          )}
        </div>
      </section>
      {hasMoreIntegrations ? (
        <Button
          variant="ghost"
          className="w-fit px-0 text-sm text-foreground hover:bg-transparent"
          onClick={() => {
            setPickerSearch("")
            setView("picker")
          }}
        >
          Show more integrations
        </Button>
      ) : null}
        </>
      ) : null}
    </div>
  )
}
