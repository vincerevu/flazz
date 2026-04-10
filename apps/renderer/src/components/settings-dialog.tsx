"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { Server, Key, Shield, Palette, Loader2, CheckCircle2, Plug, AlertTriangle, Plus, ChevronLeft } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useTheme } from "@/contexts/theme-context"
import { ProviderSettingsPanel } from "@/components/provider-settings-panel"
import {
  SiConfluence,
  SiDiscord,
  SiDropbox,
  SiFacebook,
  SiGithub,
  SiGoogle,
  SiHubspot,
  SiJira,
  SiLinear,
  SiNotion,
  SiSalesforce,
  SiSlack,
  SiTrello,
  SiZalo,
  SiZoom,
} from "react-icons/si"
import { FaLinkedinIn, FaMicrosoft } from "react-icons/fa6"
import { toast } from "sonner"
import { workspaceIpc } from "@/services/workspace-ipc"
import { modelsIpc } from "@/services/models-ipc"
import { modelsActionsIpc } from "@/services/models-actions-ipc"
import { oauthIpc } from "@/services/oauth-ipc"
import { composioIpc } from "@/services/composio-ipc"
import { composioActionsIpc } from "@/services/composio-actions-ipc"
import { getGoogleOAuthCredentials, setGoogleOAuthCredentials } from "@/lib/google-client-id-store"

type ConfigTab = "accounts" | "models" | "mcp" | "security" | "appearance"

interface TabConfig {
  id: ConfigTab
  label: string
  icon: React.ElementType
  path?: string
  description: string
}

const tabs: TabConfig[] = [
  {
    id: "accounts",
    label: "Integrations",
    icon: Plug,
    description: "Connect Gmail, Slack, and external services used by Flazz",
  },
  {
    id: "models",
    label: "Providers",
    icon: Key,
    path: "config/models.json",
    description: "Connect and manage model providers",
  },
  {
    id: "mcp",
    label: "MCP Servers",
    icon: Server,
    path: "config/mcp.json",
    description: "Configure MCP server connections",
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    path: "config/security.json",
    description: "Configure allowed shell commands",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Customize the look and feel",
  },
]

interface SettingsDialogProps {
  children: React.ReactNode
}

function AppearanceRow({
  title,
  description,
  children,
}: {
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border py-3 last:border-none sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="pt-0.5 text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="flex w-full justify-end sm:w-auto sm:shrink-0">{children}</div>
    </div>
  )
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

type IntegrationMeta = {
  id: "google" | "slack" | "notion" | "github" | "linear" | "zalo" | "facebook" | "linkedin" | "discord" | "jira" | "confluence" | "trello" | "hubspot" | "salesforce" | "dropbox" | "onedrive" | "zoom"
  name: string
  description: string
  group: "popular" | "other"
  icon: React.ElementType
}

function BrandIconBadge({
  icon: Icon,
  className,
  iconClassName,
}: {
  icon: React.ElementType
  className?: string
  iconClassName?: string
}) {
  return (
    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background shadow-sm", className)}>
      <Icon className={cn("size-5", iconClassName)} aria-hidden="true" />
    </div>
  )
}

const integrationBrandClassName: Record<IntegrationMeta["id"], string> = {
  google: "text-[#4285F4]",
  slack: "text-[#611F69]",
  notion: "text-black dark:text-white",
  github: "text-zinc-950 dark:text-white",
  linear: "text-[#5E6AD2]",
  zalo: "text-[#0068FF]",
  facebook: "text-[#1877F2]",
  linkedin: "text-[#0A66C2]",
  discord: "text-[#5865F2]",
  jira: "text-[#1868DB]",
  confluence: "text-[#1868DB]",
  trello: "text-[#026AA7]",
  hubspot: "text-[#FF7A59]",
  salesforce: "text-[#00A1E0]",
  dropbox: "text-[#0061FF]",
  onedrive: "text-[#0A64AD]",
  zoom: "text-[#2D8CFF]",
}

function AccountsSettings() {
  const [oauthConfig, setOauthConfig] = useState<Record<string, { connected: boolean; error?: string | null }>>({})
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [slackConnected, setSlackConnected] = useState(false)
  const [slackLoading, setSlackLoading] = useState(true)
  const [slackConnecting, setSlackConnecting] = useState(false)
  const [composioConfigured, setComposioConfigured] = useState(false)
  const [view, setView] = useState<"overview" | "detail">("overview")
  const [detailIntegrationId, setDetailIntegrationId] = useState<IntegrationMeta["id"] | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [googleClientId, setGoogleClientId] = useState("")
  const [googleClientSecret, setGoogleClientSecret] = useState("")
  const [slackApiKey, setSlackApiKey] = useState("")

  const googleEntry = oauthConfig.google
  const googleConnected = Boolean(googleEntry?.connected)
  const googleNeedsAttention = Boolean(googleEntry?.error)
  const googleDescription = googleNeedsAttention
    ? "Your Google connection needs attention. Reconnect to resume Gmail, Calendar, and Drive sync."
    : googleConnected
      ? "Sync Gmail, Calendar, and Drive into your Flazz knowledge workspace."
      : "Connect Google to sync Gmail, Calendar, and Drive into Flazz."
  const slackDescription = slackConnected
    ? "Connected to your Slack workspace for channel browsing and message actions."
    : "Connect Slack to browse channels and send messages from Flazz."

  const integrations: IntegrationMeta[] = [
    {
      id: "google",
      name: "Google",
      description: googleDescription,
      group: "popular",
      icon: SiGoogle,
    },
    {
      id: "slack",
      name: "Slack",
      description: slackDescription,
      group: "popular",
      icon: SiSlack,
    },
    {
      id: "notion",
      name: "Notion",
      description: "Connect Notion to access notes, docs, and workspace knowledge.",
      group: "popular",
      icon: SiNotion,
    },
    {
      id: "github",
      name: "GitHub",
      description: "Connect GitHub to work with repos, issues, and pull requests.",
      group: "popular",
      icon: SiGithub,
    },
    {
      id: "linear",
      name: "Linear",
      description: "Connect Linear to read and update issues, projects, and cycles.",
      group: "popular",
      icon: SiLinear,
    },
    {
      id: "zalo",
      name: "Zalo",
      description: "Connect Zalo for regional team communication and message workflows.",
      group: "popular",
      icon: SiZalo,
    },
    {
      id: "facebook",
      name: "Facebook",
      description: "Connect Facebook to capture page, message, and social activity context.",
      group: "popular",
      icon: SiFacebook,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      description: "Connect LinkedIn for professional profile, company, and outreach context.",
      group: "popular",
      icon: FaLinkedinIn,
    },
    {
      id: "discord",
      name: "Discord",
      description: "Connect Discord to monitor channels and coordinate communities.",
      group: "other",
      icon: SiDiscord,
    },
    {
      id: "jira",
      name: "Jira",
      description: "Connect Jira to track tickets, projects, and delivery workflows.",
      group: "other",
      icon: SiJira,
    },
    {
      id: "confluence",
      name: "Confluence",
      description: "Connect Confluence to search team docs, wikis, and specs.",
      group: "other",
      icon: SiConfluence,
    },
    {
      id: "trello",
      name: "Trello",
      description: "Connect Trello to review boards, lists, and cards.",
      group: "other",
      icon: SiTrello,
    },
    {
      id: "hubspot",
      name: "HubSpot",
      description: "Connect HubSpot to sync CRM records, deals, and contacts.",
      group: "other",
      icon: SiHubspot,
    },
    {
      id: "salesforce",
      name: "Salesforce",
      description: "Connect Salesforce to access account, lead, and pipeline context.",
      group: "other",
      icon: SiSalesforce,
    },
    {
      id: "dropbox",
      name: "Dropbox",
      description: "Connect Dropbox to browse shared docs and synced files.",
      group: "other",
      icon: SiDropbox,
    },
    {
      id: "onedrive",
      name: "OneDrive",
      description: "Connect OneDrive to access Microsoft cloud files and folders.",
      group: "other",
      icon: FaMicrosoft,
    },
    {
      id: "zoom",
      name: "Zoom",
      description: "Connect Zoom to access meetings, recordings, and follow-ups.",
      group: "other",
      icon: SiZoom,
    },
  ]

  const refreshOauthState = useCallback(async () => {
    try {
      const result = await oauthIpc.getState()
      setOauthConfig((result.config ?? {}) as Record<string, { connected: boolean; error?: string | null }>)
    } catch {
      setOauthConfig({})
    }
  }, [])

  const refreshSlackStatus = useCallback(async () => {
    try {
      setSlackLoading(true)
      const [connectionResult, configResult] = await Promise.all([
        composioActionsIpc.getConnectionStatus("slack"),
        composioActionsIpc.isConfigured(),
      ])
      setSlackConnected(connectionResult.isConnected)
      setComposioConfigured(configResult.configured)
    } catch {
      setSlackConnected(false)
      setComposioConfigured(false)
    } finally {
      setSlackLoading(false)
    }
  }, [])

  const resetDetailState = useCallback(() => {
    const existingCredentials = getGoogleOAuthCredentials()
    setGoogleClientId(existingCredentials?.clientId ?? "")
    setGoogleClientSecret(existingCredentials?.clientSecret ?? "")
    setSlackApiKey("")
    setDetailError(null)
  }, [])

  const openIntegrationDetail = useCallback((integrationId: IntegrationMeta["id"]) => {
    resetDetailState()
    setDetailIntegrationId(integrationId)
    setView("detail")
  }, [resetDetailState])

  const startGoogleConnect = useCallback(async (clientId?: string, clientSecret?: string) => {
    setGoogleConnecting(true)
    try {
      const result = await oauthIpc.connect("google", clientId, clientSecret)
      if (!result.success) {
        setDetailError(result.error || "Failed to connect Google")
        setGoogleConnecting(false)
      }
    } catch {
      setDetailError("Failed to connect Google")
      setGoogleConnecting(false)
    }
  }, [])

  const handleConnectGoogle = useCallback(async () => {
    const trimmedClientId = googleClientId.trim()
    if (!trimmedClientId) {
      setDetailError("Client ID is required")
      return
    }
    setGoogleOAuthCredentials(trimmedClientId, googleClientSecret.trim() || undefined)
    await startGoogleConnect(trimmedClientId, googleClientSecret.trim() || undefined)
  }, [googleClientId, googleClientSecret, startGoogleConnect])

  const handleDisconnectGoogle = useCallback(async () => {
    try {
      const result = await oauthIpc.disconnect("google")
      if (result.success) {
        await refreshOauthState()
        setView("overview")
        toast.success("Disconnected Google")
      } else {
        setDetailError("Failed to disconnect Google")
      }
    } catch {
      setDetailError("Failed to disconnect Google")
    }
  }, [refreshOauthState])

  const startSlackConnect = useCallback(async () => {
    try {
      setSlackConnecting(true)
      const result = await composioActionsIpc.initiateConnection("slack")
      if (!result.success) {
        setDetailError(result.error || "Failed to connect Slack")
        setSlackConnecting(false)
      }
    } catch {
      setDetailError("Failed to connect Slack")
      setSlackConnecting(false)
    }
  }, [])

  const handleConnectSlack = useCallback(async () => {
    if (!composioConfigured) {
      const trimmedApiKey = slackApiKey.trim()
      if (!trimmedApiKey) {
        setDetailError("Composio API key is required before connecting Slack")
        return
      }
      try {
        await composioActionsIpc.setApiKey(trimmedApiKey)
        setComposioConfigured(true)
        toast.success("Composio API key saved")
      } catch {
        setDetailError("Failed to save Composio API key")
        return
      }
    }
    await startSlackConnect()
  }, [composioConfigured, slackApiKey, startSlackConnect])

  const handleDisconnectSlack = useCallback(async () => {
    try {
      setSlackLoading(true)
      const result = await composioActionsIpc.disconnect("slack")
      if (result.success) {
        setSlackConnected(false)
        setView("overview")
        toast.success("Disconnected Slack")
      } else {
        setDetailError("Failed to disconnect Slack")
      }
    } catch {
      setDetailError("Failed to disconnect Slack")
    } finally {
      setSlackLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void refreshOauthState()
    void refreshSlackStatus()
    const cleanupOauth = oauthIpc.onDidConnect((event) => {
      if (!mounted || event.provider !== "google") return
      setGoogleConnecting(false)
      void refreshOauthState()
      if (event.success) {
        setDetailError(null)
        setView("overview")
        toast.success("Connected Google")
      } else {
        setDetailError(event.error || "Failed to connect Google")
        toast.error(event.error || "Failed to connect Google")
      }
    })
    const cleanupComposio = composioIpc.onDidConnect((event) => {
      if (!mounted || event.toolkitSlug !== "slack") return
      setSlackConnecting(false)
      void refreshSlackStatus()
      if (event.success) {
        setDetailError(null)
        setView("overview")
        toast.success("Connected Slack")
      } else {
        setDetailError(event.error || "Failed to connect Slack")
        toast.error(event.error || "Failed to connect Slack")
      }
    })

    return () => {
      mounted = false
      cleanupOauth()
      cleanupComposio()
    }
  }, [refreshOauthState, refreshSlackStatus])

  const connectedIntegrations = integrations.filter((integration) =>
    integration.id === "google" ? googleConnected || googleNeedsAttention : integration.id === "slack" ? slackConnected : false,
  )
  const popularIntegrations = integrations.filter((integration) => {
    if (integration.group !== "popular") return false
    if (integration.id === "google") return !googleConnected && !googleNeedsAttention
    if (integration.id === "slack") return !slackConnected
    return true
  })
  const otherIntegrations = integrations.filter((integration) => {
    if (integration.group !== "other") return false
    if (integration.id === "google") return !googleConnected && !googleNeedsAttention
    if (integration.id === "slack") return !slackConnected
    return true
  })

  const detailIntegration = detailIntegrationId
    ? integrations.find((integration) => integration.id === detailIntegrationId) ?? null
    : null
  const detailIcon = detailIntegration?.icon
  const detailConnected = detailIntegration?.id === "google"
    ? googleConnected
    : detailIntegration?.id === "slack"
      ? slackConnected
      : false
  const detailNeedsAttention = detailIntegration?.id === "google" ? googleNeedsAttention : false
  const detailLoading = detailIntegration?.id === "google"
    ? googleConnecting
    : detailIntegration?.id === "slack"
      ? slackLoading || slackConnecting
      : false

  const renderIntegrationRow = (integration: IntegrationMeta) => {
    const IntegrationIcon = integration.icon
    const isGoogle = integration.id === "google"
    const isSlack = integration.id === "slack"
    const connected = isGoogle ? googleConnected : isSlack ? slackConnected : false
    const needsAttention = isGoogle ? googleNeedsAttention : false
    const loading = isGoogle ? googleConnecting : isSlack ? slackLoading || slackConnecting : false

    return (
      <div key={integration.id} className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3 last:border-none">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => openIntegrationDetail(integration.id)}
        >
          <BrandIconBadge
            icon={IntegrationIcon}
            className="bg-background"
            iconClassName={cn("size-[18px]", integrationBrandClassName[integration.id])}
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
        {needsAttention ? (
          <Button variant="secondary" size="sm" className="min-w-24" onClick={() => openIntegrationDetail(integration.id)}>
            Reconnect
          </Button>
        ) : connected ? (
          <Button variant="ghost" size="sm" onClick={() => openIntegrationDetail(integration.id)}>
            Manage
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="min-w-24"
            onClick={() => openIntegrationDetail(integration.id)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-1 size-3.5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Plus className="mr-1 size-3.5" />
                Connect
              </>
            )}
          </Button>
        )}
      </div>
    )
  }

  if (view === "detail" && detailIntegration && detailIcon) {
    const DetailIcon = detailIcon

    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-1 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setView("overview")}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <BrandIconBadge
              icon={DetailIcon}
              className="bg-background"
              iconClassName={cn("size-[18px]", integrationBrandClassName[detailIntegration.id])}
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

        {detailIntegration.id === "google" ? (
          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Client ID</label>
              <div className="text-xs text-muted-foreground">
                Need help setting this up?{" "}
                <a
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                  href="https://github.com/Flazzlabs/Flazz/blob/main/google-setup.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the setup guide
                </a>
                .
              </div>
              <Input
                value={googleClientId}
                onChange={(event) => setGoogleClientId(event.target.value)}
                placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
                className="h-12"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Client secret</label>
              <div className="text-xs text-muted-foreground">
                Optional for public desktop clients, but some Google OAuth setups still require it during token exchange.
              </div>
              <Input
                type="password"
                value={googleClientSecret}
                onChange={(event) => setGoogleClientSecret(event.target.value)}
                placeholder="Enter client secret if Google requires it"
                className="h-12"
              />
            </div>

            {detailError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {detailError}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="lg" onClick={() => void handleConnectGoogle()} disabled={detailLoading} className="min-w-28">
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
                <Button variant="ghost" size="lg" onClick={() => void handleDisconnectGoogle()} disabled={detailLoading}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>
        ) : detailIntegration.id === "slack" ? (
          <div className="flex flex-col gap-5">
            {!composioConfigured ? (
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
                  value={slackApiKey}
                  onChange={(event) => setSlackApiKey(event.target.value)}
                  placeholder="Enter your Composio API key"
                  className="h-12"
                  autoFocus
                />
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Slack uses the Composio connection already configured in Flazz. Continue to start the OAuth handshake with Slack.
              </div>
            )}

            {detailError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {detailError}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="lg" onClick={() => void handleConnectSlack()} disabled={detailLoading} className="min-w-28">
                {detailLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
              {detailConnected ? (
                <Button variant="ghost" size="lg" onClick={() => void handleDisconnectSlack()} disabled={detailLoading}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {detailIntegration.name} is listed in the catalog, but the runtime integration is not wired yet. This row is ready for the same single-pane connect flow once the backend connector is added.
            </div>
            <div>
              <Button variant="secondary" onClick={() => toast.info(`${detailIntegration.name} integration is coming soon.`)}>
                Coming soon
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Connected integrations</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {connectedIntegrations.length > 0 ? (
            connectedIntegrations.map((integration) => renderIntegrationRow(integration))
          ) : (
            <div className="py-5 text-sm text-muted-foreground">No integrations connected yet.</div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Popular integrations</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {popularIntegrations.length > 0 ? (
            popularIntegrations.map((integration) => renderIntegrationRow(integration))
          ) : (
            <div className="py-5 text-sm text-muted-foreground">Popular integrations are already connected.</div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 pb-4">
        <h3 className="text-sm font-medium text-foreground">Other</h3>
        <div className="rounded-xl border bg-muted/25 px-4">
          {otherIntegrations.length > 0 ? (
            otherIntegrations.map((integration) => renderIntegrationRow(integration))
          ) : (
            <div className="py-5 text-sm text-muted-foreground">More integrations coming soon.</div>
          )}
        </div>
      </section>
    </div>
  )
}

function AppearanceSettings() {
  const { colorScheme, setColorScheme } = useTheme()

  return (
    <div className="flex flex-col gap-2">
      <h3 className="pb-2 text-sm font-medium text-foreground">Appearance</h3>
      <div className="rounded-xl border bg-muted/25 px-4">
        <AppearanceRow
          title="Color scheme"
          description="Choose whether Flazz follows the system, light, or dark theme"
        >
          <Select value={colorScheme} onValueChange={(value) => setColorScheme(value as "light" | "dark" | "system")}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                System
              </SelectItem>
              <SelectItem value="light">
                Light
              </SelectItem>
              <SelectItem value="dark">
                Dark
              </SelectItem>
            </SelectContent>
          </Select>
        </AppearanceRow>
      </div>
    </div>
  )
}

// --- Model Settings UI ---

type LlmProviderFlavor = "openai" | "anthropic" | "google" | "openrouter" | "aigateway" | "ollama" | "openai-compatible"

interface LlmModelOption {
  id: string
  name?: string
  release_date?: string
}

const primaryProviders: Array<{ id: LlmProviderFlavor; name: string; description: string }> = [
  { id: "openai", name: "OpenAI", description: "GPT models" },
  { id: "anthropic", name: "Anthropic", description: "Claude models" },
  { id: "google", name: "Gemini", description: "Google AI Studio" },
  { id: "ollama", name: "Ollama (Local)", description: "Run models locally" },
]

const moreProviders: Array<{ id: LlmProviderFlavor; name: string; description: string }> = [
  { id: "openrouter", name: "OpenRouter", description: "Multiple models, one key" },
  { id: "aigateway", name: "AI Gateway (Vercel)", description: "Vercel's AI Gateway" },
  { id: "openai-compatible", name: "OpenAI-Compatible", description: "Custom OpenAI-compatible API" },
]

const preferredDefaults: Partial<Record<LlmProviderFlavor, string>> = {
  openai: "gpt-5.2",
  anthropic: "claude-opus-4-6-20260202",
}

const defaultBaseURLs: Partial<Record<LlmProviderFlavor, string>> = {
  ollama: "http://localhost:11434",
  "openai-compatible": "http://localhost:1234/v1",
}

function ModelSettings({ dialogOpen }: { dialogOpen: boolean }) {
  const [provider, setProvider] = useState<LlmProviderFlavor>("openai")
  const [providerConfigs, setProviderConfigs] = useState<Record<LlmProviderFlavor, { apiKey: string; baseURL: string; model: string; knowledgeGraphModel: string }>>({
    openai: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
    anthropic: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
    google: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
    openrouter: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
    aigateway: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "" },
    ollama: { apiKey: "", baseURL: "http://localhost:11434", model: "", knowledgeGraphModel: "" },
    "openai-compatible": { apiKey: "", baseURL: "http://localhost:1234/v1", model: "", knowledgeGraphModel: "" },
  })
  const [modelsCatalog, setModelsCatalog] = useState<Record<string, LlmModelOption[]>>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [testState, setTestState] = useState<{ status: "idle" | "testing" | "success" | "error"; error?: string }>({ status: "idle" })
  const [configLoading, setConfigLoading] = useState(true)
  const [showMoreProviders, setShowMoreProviders] = useState(false)

  const activeConfig = providerConfigs[provider]
  const showApiKey = provider === "openai" || provider === "anthropic" || provider === "google" || provider === "openrouter" || provider === "aigateway" || provider === "openai-compatible"
  const requiresApiKey = provider === "openai" || provider === "anthropic" || provider === "google" || provider === "openrouter" || provider === "aigateway"
  const showBaseURL = provider === "ollama" || provider === "openai-compatible" || provider === "aigateway"
  const requiresBaseURL = provider === "ollama" || provider === "openai-compatible"
  const isLocalProvider = provider === "ollama" || provider === "openai-compatible"
  const modelsForProvider = modelsCatalog[provider] || []
  const showModelInput = isLocalProvider || modelsForProvider.length === 0
  const isMoreProvider = moreProviders.some(p => p.id === provider)

  const canTest =
    activeConfig.model.trim().length > 0 &&
    (!requiresApiKey || activeConfig.apiKey.trim().length > 0) &&
    (!requiresBaseURL || activeConfig.baseURL.trim().length > 0)

  const updateConfig = useCallback(
    (prov: LlmProviderFlavor, updates: Partial<{ apiKey: string; baseURL: string; model: string; knowledgeGraphModel: string }>) => {
      setProviderConfigs(prev => ({
        ...prev,
        [prov]: { ...prev[prov], ...updates },
      }))
      setTestState({ status: "idle" })
    },
    []
  )

  // Load current config from file
  useEffect(() => {
    if (!dialogOpen) return

    async function loadCurrentConfig() {
      try {
        setConfigLoading(true)
        const result = await workspaceIpc.readFile("config/models.json")
        const parsed = JSON.parse(result.data)
        if (parsed?.provider?.flavor && parsed?.model) {
          const flavor = parsed.provider.flavor as LlmProviderFlavor
          setProvider(flavor)
          setProviderConfigs(prev => ({
            ...prev,
            [flavor]: {
              apiKey: parsed.provider.apiKey || "",
              baseURL: parsed.provider.baseURL || (defaultBaseURLs[flavor] || ""),
              model: parsed.model,
              knowledgeGraphModel: parsed.knowledgeGraphModel || "",
            },
          }))
        }
      } catch {
        // No existing config or parse error - use defaults
      } finally {
        setConfigLoading(false)
      }
    }

    loadCurrentConfig()
  }, [dialogOpen])

  // Load models catalog
  useEffect(() => {
    if (!dialogOpen) return

    async function loadModels() {
      try {
        setModelsLoading(true)
        setModelsError(null)
        const result = await modelsIpc.list()
        const catalog: Record<string, LlmModelOption[]> = {}
        for (const p of result.providers || []) {
          catalog[p.id] = p.models || []
        }
        setModelsCatalog(catalog)
      } catch {
        setModelsError("Failed to load models list")
        setModelsCatalog({})
      } finally {
        setModelsLoading(false)
      }
    }

    loadModels()
  }, [dialogOpen])

  // Set default models from catalog when catalog loads
  useEffect(() => {
    if (Object.keys(modelsCatalog).length === 0) return
    setProviderConfigs(prev => {
      const next = { ...prev }
      const cloudProviders: LlmProviderFlavor[] = ["openai", "anthropic", "google"]
      for (const prov of cloudProviders) {
        const models = modelsCatalog[prov]
        if (models?.length && !next[prov].model) {
          const preferred = preferredDefaults[prov]
          const hasPreferred = preferred && models.some(m => m.id === preferred)
          next[prov] = { ...next[prov], model: hasPreferred ? preferred : (models[0]?.id || "") }
        }
      }
      return next
    })
  }, [modelsCatalog])

  const handleTestAndSave = useCallback(async () => {
    if (!canTest) return
    setTestState({ status: "testing" })
    try {
      const providerConfig = {
        provider: {
          flavor: provider,
          apiKey: activeConfig.apiKey.trim() || undefined,
          baseURL: activeConfig.baseURL.trim() || undefined,
        },
        model: activeConfig.model.trim(),
        knowledgeGraphModel: activeConfig.knowledgeGraphModel.trim() || undefined,
      }
      const result = await modelsActionsIpc.test(providerConfig)
      if (result.success) {
        await modelsActionsIpc.saveConfig(providerConfig)
        setTestState({ status: "success" })
        toast.success("Model configuration saved")
      } else {
        setTestState({ status: "error", error: result.error })
        toast.error(result.error || "Connection test failed")
      }
    } catch {
      setTestState({ status: "error", error: "Connection test failed" })
      toast.error("Connection test failed")
    }
  }, [canTest, provider, activeConfig])

  const renderProviderCard = (p: { id: LlmProviderFlavor; name: string; description: string }) => (
    <button
      key={p.id}
      onClick={() => {
        setProvider(p.id)
        setTestState({ status: "idle" })
      }}
      className={cn(
        "rounded-md border px-3 py-2.5 text-left transition-colors",
        provider === p.id
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-accent"
      )}
    >
      <div className="text-sm font-medium">{p.name}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
    </button>
  )

  if (configLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin mr-2" />
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Provider selection */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Provider</span>
        <div className="grid gap-2 grid-cols-2">
          {primaryProviders.map(renderProviderCard)}
        </div>
        {(showMoreProviders || isMoreProvider) ? (
          <div className="grid gap-2 grid-cols-2 mt-2">
            {moreProviders.map(renderProviderCard)}
          </div>
        ) : (
          <button
            onClick={() => setShowMoreProviders(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            More providers...
          </button>
        )}
      </div>

      {/* Model selection - side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assistant model</span>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : showModelInput ? (
            <Input
              value={activeConfig.model}
              onChange={(e) => updateConfig(provider, { model: e.target.value })}
              placeholder="Enter model"
            />
          ) : (
            <Select
              value={activeConfig.model}
              onValueChange={(value) => updateConfig(provider, { model: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {modelsForProvider.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name || model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {modelsError && (
            <div className="text-xs text-destructive">{modelsError}</div>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Knowledge graph model</span>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : showModelInput ? (
            <Input
              value={activeConfig.knowledgeGraphModel}
              onChange={(e) => updateConfig(provider, { knowledgeGraphModel: e.target.value })}
              placeholder={activeConfig.model || "Enter model"}
            />
          ) : (
            <Select
              value={activeConfig.knowledgeGraphModel || "__same__"}
              onValueChange={(value) => updateConfig(provider, { knowledgeGraphModel: value === "__same__" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__same__">Same as assistant</SelectItem>
                {modelsForProvider.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name || model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* API Key */}
      {showApiKey && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {provider === "openai-compatible" ? "API Key (optional)" : "API Key"}
          </span>
          <Input
            type="password"
            value={activeConfig.apiKey}
            onChange={(e) => updateConfig(provider, { apiKey: e.target.value })}
            placeholder="Paste your API key"
          />
        </div>
      )}

      {/* Base URL */}
      {showBaseURL && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Base URL</span>
          <Input
            value={activeConfig.baseURL}
            onChange={(e) => updateConfig(provider, { baseURL: e.target.value })}
            placeholder={
              provider === "ollama"
                ? "http://localhost:11434"
                : provider === "openai-compatible"
                  ? "http://localhost:1234/v1"
                  : "https://ai-gateway.vercel.sh/v1"
            }
          />
        </div>
      )}

      {/* Test status */}
      {testState.status === "error" && (
        <div className="text-sm text-destructive">
          {testState.error || "Connection test failed"}
        </div>
      )}
      {testState.status === "success" && (
        <div className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle2 className="size-4" />
          Connected and saved
        </div>
      )}

      {/* Test & Save button */}
      <Button
        onClick={handleTestAndSave}
        disabled={!canTest || testState.status === "testing"}
        className="w-full"
      >
        {testState.status === "testing" ? (
          <><Loader2 className="size-4 animate-spin mr-2" />Testing connection...</>
        ) : (
          "Test & Save"
        )}
      </Button>
    </div>
  )
}

void ModelSettings

// --- Main Settings Dialog ---

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ConfigTab>("accounts")
  const [content, setContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeTabConfig = tabs.find((t) => t.id === activeTab)!
  const isJsonTab = activeTab === "mcp" || activeTab === "security"

  const formatJson = (jsonString: string): string => {
    try {
      return JSON.stringify(JSON.parse(jsonString), null, 2)
    } catch {
      return jsonString
    }
  }

  const loadConfig = useCallback(async (tab: ConfigTab) => {
    if (tab === "appearance" || tab === "models" || tab === "accounts") return
    const tabConfig = tabs.find((t) => t.id === tab)!
    if (!tabConfig.path) return
    setLoading(true)
    setError(null)
    try {
      const result = await workspaceIpc.readFile(tabConfig.path)
      const formattedContent = formatJson(result.data)
      setContent(formattedContent)
      setOriginalContent(formattedContent)
    } catch {
      setError(`Failed to load ${tabConfig.label} config`)
      setContent("")
      setOriginalContent("")
    } finally {
      setLoading(false)
    }
  }, [])

  const saveConfig = async () => {
    if (!isJsonTab || !activeTabConfig.path) return
    setSaving(true)
    setError(null)
    try {
      JSON.parse(content)
      await workspaceIpc.writeFile(activeTabConfig.path, content)
      setOriginalContent(content)
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Invalid JSON syntax")
      } else {
        setError(`Failed to save ${activeTabConfig.label} config`)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleFormat = () => {
    setContent(formatJson(content))
  }

  const hasChanges = content !== originalContent

  useEffect(() => {
    if (open && isJsonTab) {
      loadConfig(activeTab)
    }
  }, [open, activeTab, isJsonTab, loadConfig])

  const handleTabChange = (tab: ConfigTab) => {
    if (isJsonTab && hasChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) {
        return
      }
    }
    setActiveTab(tab)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="max-w-[900px]! w-[900px] h-[min(720px,calc(100vh-3rem))] p-0 gap-0 overflow-hidden"
      >
        <div className="flex h-full overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r bg-muted/30 p-2 flex flex-col">
            <div className="px-2 py-3 mb-2">
              <h2 className="font-semibold text-sm">Settings</h2>
            </div>
            <nav className="flex flex-col gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors text-left",
                    activeTab === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b">
              <h3 className="font-medium text-sm">{activeTabConfig.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeTabConfig.description}
              </p>
            </div>

            {/* Content */}
            <div className={cn("flex-1 p-4 min-h-0 overflow-y-auto", activeTab === "models" || activeTab === "accounts" ? "pr-3" : "")}>
              {activeTab === "models" ? (
                <ProviderSettingsPanel dialogOpen={open} />
              ) : activeTab === "accounts" ? (
                <div className="h-full min-h-0 overflow-y-auto">
                  <AccountsSettings />
                </div>
              ) : activeTab === "appearance" ? (
                <AppearanceSettings />
              ) : loading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Loading...
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full resize-none bg-muted/50 rounded-md p-3 font-mono text-sm border-0 focus:outline-none focus:ring-1 focus:ring-ring"
                  spellCheck={false}
                  placeholder="Loading configuration..."
                />
              )}
            </div>

            {/* Footer - only show for JSON config tabs */}
            {isJsonTab && (
              <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {error && (
                    <span className="text-xs text-destructive">{error}</span>
                  )}
                  {hasChanges && !error && (
                    <span className="text-xs text-muted-foreground">
                      Unsaved changes
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFormat}
                    disabled={loading || saving}
                  >
                    Format
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveConfig}
                    disabled={loading || saving || !hasChanges}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
