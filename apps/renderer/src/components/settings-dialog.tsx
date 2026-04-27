"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { Server, Key, Shield, Palette, Loader2, CheckCircle2, Plug, Search, X, RefreshCw, Download } from "lucide-react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useTheme } from "@/contexts/theme-context"
import { ProviderSettingsPanel } from "@/components/provider-settings-panel"
import { AccountsSettingsPanel } from "@/components/settings/accounts-settings-panel"
import { SearchSettingsPanel } from "@/components/settings/search-settings-panel"
import { appIpc } from "@/services/app-ipc"
import { toast } from "sonner"
import { workspaceIpc } from "@/services/workspace-ipc"
import { modelsIpc } from "@/services/models-ipc"
import { modelsActionsIpc } from "@/services/models-actions-ipc"

type ConfigTab = "accounts" | "models" | "search" | "mcp" | "security" | "appearance"
const CHAT_NOTIFICATIONS_STORAGE_KEY = 'flazz:chat-notifications-enabled'
const LAST_UPDATE_TOAST_VERSION_STORAGE_KEY = 'flazz:last-update-toast-version'

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
    id: "search",
    label: "Search",
    icon: Search,
    description: "Choose the default quick-search provider and manage Brave or Exa API keys",
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
    path: "config/system-policy.json",
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

function AccountsSettings() {
  return <AccountsSettingsPanel />
}

type AppVersionInfo = Awaited<ReturnType<typeof appIpc.getVersions>>
type AppUpdateInfo = Awaited<ReturnType<typeof appIpc.checkForUpdates>>
type AppUpdateStatus = Awaited<ReturnType<typeof appIpc.getUpdateStatus>>

function AppearanceSettings({ dialogOpen }: { dialogOpen: boolean }) {
  const { colorScheme, setColorScheme } = useTheme()
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true
    const raw = window.localStorage.getItem(CHAT_NOTIFICATIONS_STORAGE_KEY)
    return raw == null ? true : raw === "true"
  })
  const [versionInfo, setVersionInfo] = React.useState<AppVersionInfo | null>(null)
  const [updateInfo, setUpdateInfo] = React.useState<AppUpdateInfo | null>(null)
  const [updateStatus, setUpdateStatus] = React.useState<AppUpdateStatus | null>(null)
  const [versionLoading, setVersionLoading] = React.useState(false)
  const [checkingUpdates, setCheckingUpdates] = React.useState(false)

  const checkForUpdates = React.useCallback(
    async (announce: boolean) => {
      setCheckingUpdates(true)
      try {
        const result = await appIpc.checkForUpdates()
        setUpdateInfo(result)
        const latestStatus = await appIpc.getUpdateStatus()
        setUpdateStatus(latestStatus)

        if (result.error) {
          if (announce) {
            toast.error(result.error)
          }
          return
        }

        if (result.updateAvailable && result.latestVersion) {
          const shouldAnnounce =
            announce ||
            (typeof window !== "undefined" &&
              window.localStorage.getItem(LAST_UPDATE_TOAST_VERSION_STORAGE_KEY) !== result.latestVersion)

          if (shouldAnnounce) {
            toast.success(`Flazz ${result.latestVersion} is available`, {
              description: announce ? "Use Update to download and install the latest version." : "A new version is ready to download.",
            })
            if (typeof window !== "undefined") {
              window.localStorage.setItem(LAST_UPDATE_TOAST_VERSION_STORAGE_KEY, result.latestVersion)
            }
          }
          return
        }

        if (announce) {
          toast.success("You already have the latest version")
        }
      } catch (error) {
        if (announce) {
          toast.error(error instanceof Error ? error.message : "Failed to check for updates")
        }
      } finally {
        setCheckingUpdates(false)
      }
    },
    [],
  )

  React.useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(CHAT_NOTIFICATIONS_STORAGE_KEY, String(chatNotificationsEnabled))
    window.dispatchEvent(new CustomEvent("flazz:chat-notifications-changed", {
      detail: { enabled: chatNotificationsEnabled },
    }))
  }, [chatNotificationsEnabled])

  React.useEffect(() => {
    if (!dialogOpen) return

    let cancelled = false

    const loadVersionState = async () => {
      setVersionLoading(true)
      try {
        const [info, status] = await Promise.all([
          appIpc.getVersions(),
          appIpc.getUpdateStatus(),
        ])
        if (!cancelled) {
          setVersionInfo(info)
          setUpdateStatus(status)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load app version")
        }
      } finally {
        if (!cancelled) {
          setVersionLoading(false)
        }
      }
    }

    void loadVersionState()
    void checkForUpdates(false)
    const cleanup = appIpc.onUpdateStatusChanged((nextStatus) => {
      setUpdateStatus(nextStatus)
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [dialogOpen, checkForUpdates])

  const handleUpdate = React.useCallback(async () => {
    const result = await appIpc.performUpdate()
    if (result.started) {
      toast.success(result.message ?? (result.fallback ? "Opened the latest Flazz download." : "Started updating Flazz."))
      return
    }
    toast.error(result.message ?? "Failed to start the update")
  }, [])

  const versionDescription = versionLoading
    ? "Loading current version..."
    : versionInfo
      ? `Current version ${versionInfo.app}${versionInfo.packaged ? "" : " (dev build)"}`
      : "Version information is unavailable."
  const updateAvailable = updateStatus?.status === "available" || Boolean(updateInfo?.updateAvailable)
  const updateButtonLabel = updateStatus?.status === "downloaded"
    ? "Restart to update"
    : updateStatus?.status === "downloading"
      ? "Downloading…"
      : updateStatus?.autoUpdateSupported === false
        ? "Open download"
        : "Update"
  const updateProgressText = updateStatus?.status === "downloading" && updateStatus.progressPercent != null
    ? `${Math.round(updateStatus.progressPercent)}% downloaded`
    : updateStatus?.message

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
        <AppearanceRow
          title="Chat notifications"
          description="Show a system notification when Flazz finishes a run or needs your answer while you're not looking at that chat."
        >
          <Switch checked={chatNotificationsEnabled} onCheckedChange={setChatNotificationsEnabled} />
        </AppearanceRow>
        <AppearanceRow
          title="Version"
          description={
            <div className="flex flex-wrap items-center gap-2">
              <span>{versionDescription}</span>
              {updateAvailable && (updateStatus?.latestVersion ?? updateInfo?.latestVersion) ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  New {updateStatus?.latestVersion ?? updateInfo?.latestVersion}
                </Badge>
              ) : null}
              {updateProgressText ? (
                <span className={cn(updateStatus?.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {updateProgressText}
                </span>
              ) : null}
            </div>
          }
        >
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void checkForUpdates(true)}
              disabled={checkingUpdates}
            >
              {checkingUpdates ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Check for updates
            </Button>
            {updateAvailable ? (
              <Button
                size="sm"
                onClick={() => void handleUpdate()}
                disabled={updateStatus?.status === "checking" || updateStatus?.status === "downloading"}
              >
                {updateStatus?.status === "downloading"
                  ? <Loader2 className="mr-2 size-4 animate-spin" />
                  : <Download className="mr-2 size-4" />}
                {updateButtonLabel}
              </Button>
            ) : null}
          </div>
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
  const [providerConfigs, setProviderConfigs] = useState<Record<LlmProviderFlavor, { apiKey: string; baseURL: string; model: string; memoryGraphModel: string }>>({
    openai: { apiKey: "", baseURL: "", model: "", memoryGraphModel: "" },
    anthropic: { apiKey: "", baseURL: "", model: "", memoryGraphModel: "" },
    google: { apiKey: "", baseURL: "", model: "", memoryGraphModel: "" },
    openrouter: { apiKey: "", baseURL: "", model: "", memoryGraphModel: "" },
    aigateway: { apiKey: "", baseURL: "", model: "", memoryGraphModel: "" },
    ollama: { apiKey: "", baseURL: "http://localhost:11434", model: "", memoryGraphModel: "" },
    "openai-compatible": { apiKey: "", baseURL: "http://localhost:1234/v1", model: "", memoryGraphModel: "" },
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
    (prov: LlmProviderFlavor, updates: Partial<{ apiKey: string; baseURL: string; model: string; memoryGraphModel: string }>) => {
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
              memoryGraphModel: parsed.memoryGraphModel || "",
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
        memoryGraphModel: activeConfig.memoryGraphModel.trim() || undefined,
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
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Memory extraction model</span>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : showModelInput ? (
            <Input
              value={activeConfig.memoryGraphModel}
              onChange={(e) => updateConfig(provider, { memoryGraphModel: e.target.value })}
              placeholder={activeConfig.model || "Enter model"}
            />
          ) : (
            <Select
              value={activeConfig.memoryGraphModel || "__same__"}
              onValueChange={(value) => updateConfig(provider, { memoryGraphModel: value === "__same__" ? "" : value })}
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
    if (tab === "appearance" || tab === "models" || tab === "search" || tab === "accounts") return
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
      if (tab === "security") {
        const fallbackContent = formatJson(JSON.stringify([
          "cat",
          "date",
          "echo",
          "grep",
          "jq",
          "ls",
          "pwd",
          "yq",
          "whoami",
        ]))
        setContent(fallbackContent)
        setOriginalContent(fallbackContent)
      } else {
        setError(`Failed to load ${tabConfig.label} config`)
        setContent("")
        setOriginalContent("")
      }
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
        showCloseButton={false}
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
            <div className="px-4 py-3 border-b relative">
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="Close settings"
                  className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <X className="size-4" />
                </button>
              </DialogClose>
              <h3 className="font-medium text-sm">{activeTabConfig.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeTabConfig.description}
              </p>
            </div>

            {/* Content */}
            <div className={cn("flex-1 p-4 min-h-0 overflow-y-auto", activeTab === "models" || activeTab === "accounts" ? "pr-3" : "")}>
              {activeTab === "models" ? (
                <ProviderSettingsPanel dialogOpen={open} />
              ) : activeTab === "search" ? (
                <SearchSettingsPanel dialogOpen={open} />
              ) : activeTab === "accounts" ? (
                <div className="h-full min-h-0 overflow-y-auto">
                  <AccountsSettings />
                </div>
              ) : activeTab === "appearance" ? (
                <AppearanceSettings dialogOpen={open} />
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

