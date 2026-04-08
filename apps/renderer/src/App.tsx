import * as React from 'react'
import { useCallback, useEffect, useState, useRef } from 'react'
import * as ipcShared from '@x/shared/src/ipc.js'
import * as workspace from '@x/shared/src/workspace.js'
import './App.css'
import z from 'zod';
import { CheckIcon, HistoryIcon, LoaderIcon, Maximize2, Minimize2, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownEditor } from './components/markdown-editor';
import { ChatSidebar } from './components/chat-sidebar';
import { ChatInputWithMentions } from './components/chat-input-with-mentions';
import { ChatMessageAttachments } from '@/components/chat-message-attachments'
import { GraphView, type GraphEdge, type GraphNode } from '@/components/graph-view';
import { useDebounce } from './hooks/use-debounce';
import { SidebarContentPanel } from '@/components/sidebar-content';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ScrollPositionPreserver,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { WebSearchResult } from '@/components/ai-elements/web-search-result';
import { PermissionRequest } from '@/components/ai-elements/permission-request';
import { AskHumanRequest } from '@/components/ai-elements/ask-human-request';
import { Suggestions } from '@/components/ai-elements/suggestions';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { stripKnowledgePrefix, toKnowledgePath, wikiLabel } from '@/lib/wiki-links'
import { SearchDialog } from '@/components/search-dialog'
import { BackgroundTaskDetail } from '@/components/background-task-detail'
import { VersionHistoryPanel } from '@/components/version-history-panel'
import { FileCardProvider } from '@/contexts/file-card-context'
import { MarkdownPreOverride } from '@/components/ai-elements/markdown-code-override'
import { TabBar, type ChatTab, type FileTab } from '@/components/tab-bar'
import {
  type ChatTabViewState,
  type ConversationItem,
  createEmptyChatTabViewState,
  getWebSearchCardData,
  isChatMessage,
  isErrorMessage,
  isToolCall,
  normalizeToolInput,
  normalizeToolOutput,
  parseAttachedFiles,
  toToolState,
} from '@/lib/chat-conversation'
import { AgentScheduleConfig } from '@x/shared/src/agent-schedule.js'
import { AgentScheduleState } from '@x/shared/src/agent-schedule-state.js'
import { useTheme } from '@/contexts/theme-context'
import { RendererAppShell } from '@/components/app-shell/renderer-app-shell'
import { useChatRuntime } from '@/features/chat/use-chat-runtime'

type DirEntry = z.infer<typeof workspace.DirEntry>
type DesktopWindowState = ipcShared.IPCChannels['app:getWindowState']['res']

interface TreeNode extends DirEntry {
  children?: TreeNode[]
  loaded?: boolean
}

const streamdownComponents = { pre: MarkdownPreOverride }

const wikiLinkRegex = /\[\[([^[\]]+)\]\]/g
const graphPalette = [
  { hue: 210, sat: 72, light: 52 },
  { hue: 28, sat: 78, light: 52 },
  { hue: 120, sat: 62, light: 48 },
  { hue: 170, sat: 66, light: 46 },
  { hue: 280, sat: 70, light: 56 },
  { hue: 330, sat: 68, light: 54 },
  { hue: 55, sat: 80, light: 52 },
  { hue: 0, sat: 72, light: 52 },
]

const GRAPH_TAB_PATH = '__Flazz_graph_view__'

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const untitledBaseName = 'untitled'
const untitledIndexedNamePattern = /^untitled-\d+$/

const isUntitledPlaceholderName = (name: string) =>
  name === untitledBaseName || untitledIndexedNamePattern.test(name)

const getHeadingTitle = (markdown: string) => {
  const lines = markdown.split('\n')
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/)
    if (match) return match[1].trim()
    const trimmed = line.trim()
    if (trimmed !== '') return trimmed
  }
  return null
}

const sanitizeHeadingForFilename = (heading: string) => {
  let name = heading.trim()
  if (!name) return null
  if (name.toLowerCase().endsWith('.md')) {
    name = name.slice(0, -3)
  }
  name = name.replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim()
  return name || null
}

const getBaseName = (path: string) => {
  const file = path.split('/').pop() ?? ''
  return file.replace(/\.md$/i, '')
}

const WIKI_LINK_TOKEN_REGEX = /\[\[([^[\]]+)\]\]/g
const KNOWLEDGE_PREFIX = 'knowledge/'

const normalizeRelPathForWiki = (relPath: string) =>
  relPath.replace(/\\/g, '/').replace(/^\/+/, '')

const stripKnowledgePrefixForWiki = (relPath: string) => {
  const normalized = normalizeRelPathForWiki(relPath)
  return normalized.toLowerCase().startsWith(KNOWLEDGE_PREFIX)
    ? normalized.slice(KNOWLEDGE_PREFIX.length)
    : normalized
}

const stripMarkdownExtensionForWiki = (wikiPath: string) =>
  wikiPath.toLowerCase().endsWith('.md') ? wikiPath.slice(0, -3) : wikiPath

const wikiPathCompareKey = (wikiPath: string) =>
  stripMarkdownExtensionForWiki(wikiPath).toLowerCase()

const splitWikiPathPrefix = (rawPath: string) => {
  let normalized = rawPath.trim().replace(/^\/+/, '').replace(/^\.\//, '')
  const hadKnowledgePrefix = /^knowledge\//i.test(normalized)
  if (hadKnowledgePrefix) {
    normalized = normalized.slice(KNOWLEDGE_PREFIX.length)
  }
  return { pathWithoutPrefix: normalized, hadKnowledgePrefix }
}

const rewriteWikiLinksForRenamedFileInMarkdown = (
  markdown: string,
  fromRelPath: string,
  toRelPath: string
) => {
  const normalizedFrom = normalizeRelPathForWiki(fromRelPath)
  const normalizedTo = normalizeRelPathForWiki(toRelPath)
  const lowerFrom = normalizedFrom.toLowerCase()
  const lowerTo = normalizedTo.toLowerCase()
  if (!lowerFrom.startsWith(KNOWLEDGE_PREFIX) || !lowerFrom.endsWith('.md')) return markdown
  if (!lowerTo.startsWith(KNOWLEDGE_PREFIX) || !lowerTo.endsWith('.md')) return markdown

  const fromWikiPath = stripKnowledgePrefixForWiki(normalizedFrom)
  const toWikiPath = stripKnowledgePrefixForWiki(normalizedTo)
  const fromCompareKey = wikiPathCompareKey(fromWikiPath)
  const fromBaseName = stripMarkdownExtensionForWiki(fromWikiPath).split('/').pop()?.toLowerCase() ?? null
  const toWikiPathWithoutExtension = stripMarkdownExtensionForWiki(toWikiPath)
  const toBaseName = toWikiPathWithoutExtension.split('/').pop() ?? toWikiPathWithoutExtension

  return markdown.replace(WIKI_LINK_TOKEN_REGEX, (fullMatch, innerRaw: string) => {
    const pipeIndex = innerRaw.indexOf('|')
    const pathAndAnchor = pipeIndex >= 0 ? innerRaw.slice(0, pipeIndex) : innerRaw
    const aliasSuffix = pipeIndex >= 0 ? innerRaw.slice(pipeIndex) : ''

    const hashIndex = pathAndAnchor.indexOf('#')
    const pathPart = hashIndex >= 0 ? pathAndAnchor.slice(0, hashIndex) : pathAndAnchor
    const anchorSuffix = hashIndex >= 0 ? pathAndAnchor.slice(hashIndex) : ''

    const leadingWhitespace = pathPart.match(/^\s*/)?.[0] ?? ''
    const trailingWhitespace = pathPart.match(/\s*$/)?.[0] ?? ''
    const rawPath = pathPart.trim()
    if (!rawPath) return fullMatch

    const { pathWithoutPrefix, hadKnowledgePrefix } = splitWikiPathPrefix(rawPath)
    if (!pathWithoutPrefix) return fullMatch

    const matchesFullPath = wikiPathCompareKey(pathWithoutPrefix) === fromCompareKey
    const isBareTarget = !pathWithoutPrefix.includes('/')
    const targetBaseName = stripMarkdownExtensionForWiki(pathWithoutPrefix).toLowerCase()
    const matchesBareSelfName = Boolean(fromBaseName && isBareTarget && targetBaseName === fromBaseName)
    if (!matchesFullPath && !matchesBareSelfName) return fullMatch

    const preserveMarkdownExtension = rawPath.toLowerCase().endsWith('.md')
    const rewrittenTarget = matchesBareSelfName
      ? (preserveMarkdownExtension ? `${toBaseName}.md` : toBaseName)
      : (preserveMarkdownExtension ? toWikiPath : toWikiPathWithoutExtension)
    const finalPath = hadKnowledgePrefix ? `${KNOWLEDGE_PREFIX}${rewrittenTarget}` : rewrittenTarget

    return `[[${leadingWhitespace}${finalPath}${trailingWhitespace}${anchorSuffix}${aliasSuffix}]]`
  })
}

const getAncestorDirectoryPaths = (path: string): string[] => {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return []
  const ancestors: string[] = []
  for (let i = 1; i < parts.length - 1; i++) {
    ancestors.push(parts.slice(0, i + 1).join('/'))
  }
  return ancestors
}

const isGraphTabPath = (path: string) => path === GRAPH_TAB_PATH

// Sort nodes (dirs first, then alphabetically)
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  }).map(node => {
    if (node.children) {
      node.children = sortNodes(node.children)
    }
    return node
  })
}

// Build tree structure from flat entries
function buildTree(entries: DirEntry[]): TreeNode[] {
  const treeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Create nodes
  entries.forEach(entry => {
    const node: TreeNode = { ...entry, children: [], loaded: false }
    treeMap.set(entry.path, node)
  })

  // Build hierarchy
  entries.forEach(entry => {
    const node = treeMap.get(entry.path)!
    const parts = entry.path.split('/')
    if (parts.length === 1) {
      roots.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = treeMap.get(parentPath)
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  })

  return sortNodes(roots)
}

const collectDirPaths = (nodes: TreeNode[]): string[] =>
  nodes.flatMap(n => n.kind === 'dir' ? [n.path, ...(n.children ? collectDirPaths(n.children) : [])] : [])

const collectFilePaths = (nodes: TreeNode[]): string[] =>
  nodes.flatMap(n => n.kind === 'file' ? [n.path] : (n.children ? collectFilePaths(n.children) : []))

/** A snapshot of which view the user is on */
type ViewState =
  | { type: 'chat'; runId: string | null }
  | { type: 'file'; path: string }
  | { type: 'graph' }
  | { type: 'task'; name: string }

function viewStatesEqual(a: ViewState, b: ViewState): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'chat' && b.type === 'chat') return a.runId === b.runId
  if (a.type === 'file' && b.type === 'file') return a.path === b.path
  if (a.type === 'task' && b.type === 'task') return a.name === b.name
  return true // both graph
}

function App() {
  type ShortcutPane = 'left' | 'right'
  type MarkdownHistoryHandlers = { undo: () => boolean; redo: () => boolean }
  const { resolvedTheme } = useTheme()

  // File browser state (for Knowledge section)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [editorContent, setEditorContent] = useState<string>('')
  const editorContentRef = useRef<string>('')
  const [editorContentByPath, setEditorContentByPath] = useState<Record<string, string>>({})
  const editorContentByPathRef = useRef<Map<string, string>>(new Map())
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [recentWikiFiles, setRecentWikiFiles] = useState<string[]>([])
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [expandedFrom, setExpandedFrom] = useState<{ path: string | null; graph: boolean } | null>(null)
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  })
  const [graphStatus, setGraphStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [graphError, setGraphError] = useState<string | null>(null)
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true)
  const [isRightPaneMaximized, setIsRightPaneMaximized] = useState(false)
  const [activeShortcutPane, setActiveShortcutPane] = useState<ShortcutPane>('left')
  const [windowState, setWindowState] = useState<DesktopWindowState | null>(null)
  const isMac = windowState?.platform === 'darwin' || (typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'))
  const supportsCustomTitlebar = windowState?.supportsCustomTitlebar ?? !isMac
  const titlebarLogoSrc = resolvedTheme === 'dark' ? '/logo-white.png' : '/logo-black.png'

  // Keep the latest selected path in a ref (avoids stale async updates when switching rapidly)
  const selectedPathRef = useRef<string | null>(null)
  const editorPathRef = useRef<string | null>(null)
  const fileLoadRequestIdRef = useRef(0)
  const initialContentByPathRef = useRef<Map<string, string>>(new Map())

  const handleWindowMinimize = useCallback(() => {
    void window.ipc.invoke('app:minimizeWindow', null)
  }, [])

  const handleWindowToggleMaximize = useCallback(() => {
    void window.ipc.invoke('app:toggleMaximizeWindow', null).then((nextState) => {
      setWindowState(nextState)
    })
  }, [])

  const handleWindowClose = useCallback(() => {
    void window.ipc.invoke('app:closeWindow', null)
  }, [])

  useEffect(() => {
    let isMounted = true

    void window.ipc.invoke('app:getWindowState', null).then((nextState) => {
      if (isMounted) {
        setWindowState(nextState)
      }
    }).catch((error) => {
      console.error('Failed to load window state', error)
    })

    const cleanup = window.ipc.on('app:windowStateChanged', (nextState) => {
      setWindowState(nextState)
    })

    return () => {
      isMounted = false
      cleanup()
    }
  }, [])

  // Global navigation history (back/forward) across views (chat/file/graph/task)
  const historyRef = useRef<{ back: ViewState[]; forward: ViewState[] }>({ back: [], forward: [] })
  const [viewHistory, setViewHistory] = useState(historyRef.current)
  const setHistory = useCallback((next: { back: ViewState[]; forward: ViewState[] }) => {
    historyRef.current = next
    setViewHistory(next)
  }, [])

  // Auto-save state
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const debouncedContent = useDebounce(editorContent, 500)
  const initialContentRef = useRef<string>('')
  const renameInProgressRef = useRef(false)

  // Version history state
  const [versionHistoryPath, setVersionHistoryPath] = useState<string | null>(null)
  const [viewingHistoricalVersion, setViewingHistoricalVersion] = useState<{
    oid: string
    content: string
  } | null>(null)

  const [agentId] = useState<string>('copilot')
  const [presetMessage, setPresetMessage] = useState<string | undefined>(undefined)

  // Chat tab state
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([{ id: 'default-chat-tab', runId: null }])
  const [activeChatTabId, setActiveChatTabId] = useState('default-chat-tab')
  const [chatViewStateByTab, setChatViewStateByTab] = useState<Record<string, ChatTabViewState>>({
    'default-chat-tab': createEmptyChatTabViewState(),
  })
  const chatViewStateByTabRef = useRef(chatViewStateByTab)
  const chatTabIdCounterRef = useRef(0)
  const newChatTabId = () => `chat-tab-${++chatTabIdCounterRef.current}`
  const chatDraftsRef = useRef(new Map<string, string>())
  const chatScrollTopByTabRef = useRef(new Map<string, number>())
  const [toolOpenByTab, setToolOpenByTab] = useState<Record<string, Record<string, boolean>>>({})
  const activeChatTabIdRef = useRef(activeChatTabId)
  activeChatTabIdRef.current = activeChatTabId
  const setChatDraftForTab = useCallback((tabId: string, text: string) => {
    if (text) {
      chatDraftsRef.current.set(tabId, text)
    } else {
      chatDraftsRef.current.delete(tabId)
    }
  }, [])
  const isToolOpenForTab = useCallback((tabId: string, toolId: string): boolean => {
    return toolOpenByTab[tabId]?.[toolId] ?? false
  }, [toolOpenByTab])
  const setToolOpenForTab = useCallback((tabId: string, toolId: string, open: boolean) => {
    setToolOpenByTab((prev) => {
      const prevForTab = prev[tabId] ?? {}
      if (prevForTab[toolId] === open) return prev
      return {
        ...prev,
        [tabId]: {
          ...prevForTab,
          [toolId]: open,
        },
      }
    })
  }, [])
  const getChatScrollContainer = useCallback((tabId: string): HTMLElement | null => {
    if (typeof document === 'undefined') return null
    const panel = document.querySelector<HTMLElement>(
      `[data-chat-tab-panel="${tabId}"][aria-hidden="false"]`
    )
    if (!panel) return null
    const logRoot = panel.querySelector<HTMLElement>('[role="log"]')
    if (!logRoot) return null
    const children = Array.from(logRoot.children) as HTMLElement[]
    for (const child of children) {
      const style = window.getComputedStyle(child)
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return child
      }
    }
    return null
  }, [])
  const saveChatScrollForTab = useCallback((tabId: string) => {
    const container = getChatScrollContainer(tabId)
    if (!container) return
    chatScrollTopByTabRef.current.set(tabId, container.scrollTop)
  }, [getChatScrollContainer])

  // File tab state
  const [fileTabs, setFileTabs] = useState<FileTab[]>([])
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null)
  const [editorSessionByTabId, setEditorSessionByTabId] = useState<Record<string, number>>({})
  const fileHistoryHandlersRef = useRef<Map<string, MarkdownHistoryHandlers>>(new Map())
  const fileTabIdCounterRef = useRef(0)
  const newFileTabId = () => `file-tab-${++fileTabIdCounterRef.current}`

  const getFileTabTitle = useCallback((tab: FileTab) => {
    if (isGraphTabPath(tab.path)) return 'Graph View'
    return tab.path.split('/').pop()?.replace(/\.md$/i, '') || tab.path
  }, [])

  const {
    runs,
    loadRuns,
    runId,
    conversation,
    currentAssistantMessage,
    isProcessing,
    isStopping,
    processingRunIds,
    pendingAskHumanRequests,
    allPermissionRequests,
    permissionResponses,
    chatRuntimeSnapshot,
    loadRun,
    cancelPendingRunLoads,
    resetChatRuntime,
    restoreChatRuntime,
    handlePromptSubmit,
    handleStop,
    handlePermissionResponse,
    handleAskHumanResponse,
  } = useChatRuntime({
    agentId,
    onActiveTabRunIdChange: (nextRunId) => {
      setChatTabs((prev) => prev.map((tab) => (
        tab.id === activeChatTabId
          ? { ...tab, runId: nextRunId }
          : tab
      )))
    },
  })

  const getChatTabTitle = useCallback((tab: ChatTab) => {
    if (!tab.runId) return 'New chat'
    return runs.find((run) => run.id === tab.runId)?.title || '(Untitled chat)'
  }, [runs])

  const isChatTabProcessing = useCallback((tab: ChatTab) => {
    return tab.runId ? processingRunIds.has(tab.runId) : false
  }, [processingRunIds])

  useEffect(() => {
    chatViewStateByTabRef.current = chatViewStateByTab
  }, [chatViewStateByTab])

  useEffect(() => {
    setChatViewStateByTab((prev) => ({ ...prev, [activeChatTabId]: chatRuntimeSnapshot }))
  }, [
    activeChatTabId,
    chatRuntimeSnapshot,
  ])

  useEffect(() => {
    const tabIds = new Set(chatTabs.map((tab) => tab.id))
    setChatViewStateByTab((prev) => {
      let changed = false
      const next: Record<string, ChatTabViewState> = {}
      for (const [tabId, state] of Object.entries(prev)) {
        if (tabIds.has(tabId)) {
          next[tabId] = state
        } else {
          changed = true
        }
      }
      for (const tabId of tabIds) {
        if (!next[tabId]) {
          next[tabId] = createEmptyChatTabViewState()
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [chatTabs])

  // Workspace root for full paths
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('')


  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // Background tasks state
  type BackgroundTaskItem = {
    name: string
    description?: string
    schedule: z.infer<typeof AgentScheduleConfig>["agents"][string]["schedule"]
    enabled: boolean
    startingMessage?: string
    status?: z.infer<typeof AgentScheduleState>["agents"][string]["status"]
    nextRunAt?: string | null
    lastRunAt?: string | null
    lastError?: string | null
    runCount?: number
  }
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTaskItem[]>([])
  const [selectedBackgroundTask, setSelectedBackgroundTask] = useState<string | null>(null)

  // Keep selectedPathRef in sync for async guards
  useEffect(() => {
    selectedPathRef.current = selectedPath
    if (!selectedPath) {
      editorPathRef.current = null
    }
  }, [selectedPath])

  // Keep active file visible in the Knowledge tree by auto-expanding its ancestor folders.
  useEffect(() => {
    if (!selectedPath) return
    const ancestorDirs = getAncestorDirectoryPaths(selectedPath)
    if (ancestorDirs.length === 0) return

    setExpandedPaths((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const dirPath of ancestorDirs) {
        if (!next.has(dirPath)) {
          next.add(dirPath)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedPath])

  const setEditorCacheForPath = useCallback((path: string, content: string) => {
    editorContentByPathRef.current.set(path, content)
    setEditorContentByPath((prev) => {
      if (prev[path] === content) return prev
      return { ...prev, [path]: content }
    })
  }, [])

  const removeEditorCacheForPath = useCallback((path: string) => {
    editorContentByPathRef.current.delete(path)
    setEditorContentByPath((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }, [])

  const handleEditorChange = useCallback((path: string, markdown: string) => {
    setEditorCacheForPath(path, markdown)
    const nextSelectedPath = selectedPathRef.current
    if (nextSelectedPath !== path) {
      return
    }
    // Avoid clobbering editorPath during rapid transitions (e.g. autosave rename) where refs may lag a tick.
    if (!editorPathRef.current || (nextSelectedPath && editorPathRef.current === nextSelectedPath)) {
      editorPathRef.current = nextSelectedPath
    }
    editorContentRef.current = markdown
    setEditorContent(markdown)
  }, [setEditorCacheForPath])
  // Load directory tree
  const loadDirectory = useCallback(async () => {
    try {
      const result = await window.ipc.invoke('workspace:readdir', {
        path: 'knowledge',
        opts: { recursive: true, includeHidden: false }
      })
      return buildTree(result)
    } catch (err) {
      console.error('Failed to load directory:', err)
      return []
    }
  }, [])

  // Load initial tree
  useEffect(() => {
    loadDirectory().then(setTree)
  }, [loadDirectory])

  // Listen to workspace change events
  useEffect(() => {
    const cleanup = window.ipc.on('workspace:didChange', async (event) => {
      loadDirectory().then(setTree)

      const changedPath = event.type === 'changed' ? event.path : null
      const changedPaths = (event.type === 'bulkChanged' ? event.paths : []) ?? []
      const eventPaths = (() => {
        if (event.type === 'changed') return [event.path]
        if (event.type === 'bulkChanged') return event.paths ?? []
        if (event.type === 'moved') return [event.from, event.to]
        if (event.type === 'created' || event.type === 'deleted') return [event.path]
        return []
      })()
      const selectedPathAtEvent = selectedPathRef.current

      // Reload background tasks if agent-schedule.json changed
      if (
        changedPath === 'config/agent-schedule.json'
        || changedPaths.includes('config/agent-schedule.json')
      ) {
        loadBackgroundTasks()
      }

      // Invalidate cached content for files changed outside the active editor.
      // This prevents stale backlinks after rename-rewrite passes touch many files.
      for (const path of eventPaths) {
        if (!path.endsWith('.md')) continue
        if (selectedPathAtEvent && path === selectedPathAtEvent) continue
        removeEditorCacheForPath(path)
        initialContentByPathRef.current.delete(path)
      }

      // Keep selection stable if a file is moved externally.
      if (
        event.type === 'moved'
        && selectedPathAtEvent
        && event.from === selectedPathAtEvent
      ) {
        setSelectedPath(event.to)
      }

      // Reload current file if it was changed externally
      if (!selectedPathAtEvent) return
      const pathToReload = selectedPathAtEvent

      const isCurrentFileChanged =
        changedPath === pathToReload || changedPaths.includes(pathToReload)

      if (isCurrentFileChanged) {
        // Only reload if no unsaved edits
        const baseline = initialContentByPathRef.current.get(pathToReload) ?? initialContentRef.current
        if (editorContentRef.current === baseline) {
          const result = await window.ipc.invoke('workspace:readFile', { path: pathToReload })
          if (selectedPathRef.current !== pathToReload) return
          setFileContent(result.data)
          setEditorContent(result.data)
          setEditorCacheForPath(pathToReload, result.data)
          editorContentRef.current = result.data
          editorPathRef.current = pathToReload
          initialContentByPathRef.current.set(pathToReload, result.data)
          initialContentRef.current = result.data
        }
      }
    })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDirectory, removeEditorCacheForPath, setEditorCacheForPath])

  // Load file content when selected
  useEffect(() => {
    if (!selectedPath) {
      setFileContent('')
      setEditorContent('')
      editorContentRef.current = ''
      initialContentRef.current = ''
      setLastSaved(null)
      return
    }
    if (selectedPath.endsWith('.md')) {
      const cachedContent = editorContentByPathRef.current.get(selectedPath)
      if (cachedContent !== undefined) {
        setFileContent(cachedContent)
        setEditorContent(cachedContent)
        editorContentRef.current = cachedContent
        editorPathRef.current = selectedPath
        initialContentRef.current = initialContentByPathRef.current.get(selectedPath) ?? cachedContent
        return
      }
    }
    const requestId = (fileLoadRequestIdRef.current += 1)
    const pathToLoad = selectedPath
    let cancelled = false
    ;(async () => {
      try {
        const stat = await window.ipc.invoke('workspace:stat', { path: pathToLoad })
        if (cancelled || fileLoadRequestIdRef.current !== requestId || selectedPathRef.current !== pathToLoad) return
        if (stat.kind === 'file') {
          const result = await window.ipc.invoke('workspace:readFile', { path: pathToLoad })
          if (cancelled || fileLoadRequestIdRef.current !== requestId || selectedPathRef.current !== pathToLoad) return
          setFileContent(result.data)
          const normalizeForCompare = (s: string) => s.split('\n').map(line => line.trimEnd()).join('\n').trim()
          const isSameEditorFile = editorPathRef.current === pathToLoad
          const wouldClobberActiveEdits =
            isSameEditorFile
            && normalizeForCompare(editorContentRef.current) !== normalizeForCompare(result.data)
          if (!wouldClobberActiveEdits) {
            setEditorContent(result.data)
            if (pathToLoad.endsWith('.md')) {
              setEditorCacheForPath(pathToLoad, result.data)
            }
            editorContentRef.current = result.data
            editorPathRef.current = pathToLoad
            initialContentByPathRef.current.set(pathToLoad, result.data)
            initialContentRef.current = result.data
            setLastSaved(null)
          } else {
            // Still update the editor's path so subsequent autosaves write to the correct file.
            editorPathRef.current = pathToLoad
          }
        } else {
          setFileContent('')
          setEditorContent('')
          editorContentRef.current = ''
          initialContentRef.current = ''
        }
      } catch (err) {
        console.error('Failed to load file:', err)
        if (!cancelled && fileLoadRequestIdRef.current === requestId && selectedPathRef.current === pathToLoad) {
          setFileContent('')
          setEditorContent('')
          editorContentRef.current = ''
          initialContentRef.current = ''
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPath, setEditorCacheForPath])

  // Track recently opened markdown files for wiki links
  useEffect(() => {
    if (!selectedPath || !selectedPath.endsWith('.md')) return
    const wikiPath = stripKnowledgePrefix(selectedPath)
    setRecentWikiFiles((prev) => {
      const next = [wikiPath, ...prev.filter((path) => path !== wikiPath)]
      return next.slice(0, 50)
    })
  }, [selectedPath])

  // Auto-save when content changes
  useEffect(() => {
    const pathAtStart = editorPathRef.current
    if (!pathAtStart || !pathAtStart.endsWith('.md')) return

    const baseline = initialContentByPathRef.current.get(pathAtStart) ?? initialContentRef.current
    if (debouncedContent === baseline) return
    if (!debouncedContent) return

    const saveFile = async () => {
      const wasActiveAtStart = selectedPathRef.current === pathAtStart
      if (wasActiveAtStart) setIsSaving(true)
      let pathToSave = pathAtStart
      let contentToSave = debouncedContent
      let renamedFrom: string | null = null
      let renamedTo: string | null = null
      try {
        // Only rename the currently active file (avoids renaming/jumping while user switches rapidly)
        if (
          wasActiveAtStart &&
          selectedPathRef.current === pathAtStart &&
          !renameInProgressRef.current &&
          pathAtStart.startsWith('knowledge/')
        ) {
          const currentBase = getBaseName(pathAtStart)
          if (isUntitledPlaceholderName(currentBase)) {
            const headingTitle = getHeadingTitle(debouncedContent)
            const desiredName = headingTitle ? sanitizeHeadingForFilename(headingTitle) : null
            if (desiredName && desiredName !== currentBase) {
              const parentDir = pathAtStart.split('/').slice(0, -1).join('/')
              let targetPath = `${parentDir}/${desiredName}.md`
              if (targetPath !== pathAtStart) {
                let suffix = 1
                while (true) {
                  const exists = await window.ipc.invoke('workspace:exists', { path: targetPath })
                  if (!exists.exists) break
                  targetPath = `${parentDir}/${desiredName}-${suffix}.md`
                  suffix += 1
                }
                renameInProgressRef.current = true
                await window.ipc.invoke('workspace:rename', { from: pathAtStart, to: targetPath })
                pathToSave = targetPath
                contentToSave = rewriteWikiLinksForRenamedFileInMarkdown(
                  debouncedContent,
                  pathAtStart,
                  targetPath
                )
                renamedFrom = pathAtStart
                renamedTo = targetPath
                editorPathRef.current = targetPath
                setFileTabs(prev => prev.map(tab => (tab.path === pathAtStart ? { ...tab, path: targetPath } : tab)))
                initialContentByPathRef.current.delete(pathAtStart)
                const cachedContent = editorContentByPathRef.current.get(pathAtStart)
                if (cachedContent !== undefined) {
                  const rewrittenCachedContent = rewriteWikiLinksForRenamedFileInMarkdown(
                    cachedContent,
                    pathAtStart,
                    targetPath
                  )
                  editorContentByPathRef.current.delete(pathAtStart)
                  editorContentByPathRef.current.set(targetPath, rewrittenCachedContent)
                  setEditorContentByPath((prev) => {
                    const oldContent = prev[pathAtStart]
                    if (oldContent === undefined) return prev
                    const next = { ...prev }
                    delete next[pathAtStart]
                    next[targetPath] = rewriteWikiLinksForRenamedFileInMarkdown(
                      oldContent,
                      pathAtStart,
                      targetPath
                    )
                    return next
                  })
                }
                if (selectedPathRef.current === pathAtStart) {
                  editorContentRef.current = contentToSave
                  setEditorContent(contentToSave)
                }
              }
            }
          }
        }
        await window.ipc.invoke('workspace:writeFile', {
          path: pathToSave,
          data: contentToSave,
          opts: { encoding: 'utf8' }
        })
        initialContentByPathRef.current.set(pathToSave, contentToSave)

        // If we renamed the active file, update state/history AFTER the write completes so the editor
        // doesn't reload stale on-disk content mid-typing (which can drop the latest character).
        if (renamedFrom && renamedTo) {
          const fromPath = renamedFrom
          const toPath = renamedTo
          const replaceRenamedPath = (stack: ViewState[]) =>
            stack.map((v) => (v.type === 'file' && v.path === fromPath ? ({ type: 'file', path: toPath } satisfies ViewState) : v))
          setHistory({
            back: replaceRenamedPath(historyRef.current.back),
            forward: replaceRenamedPath(historyRef.current.forward),
          })

          if (selectedPathRef.current === fromPath) {
            setSelectedPath(toPath)
          }
        }

        // Only update "current file" UI state if we're still on this file
        if (selectedPathRef.current === pathAtStart || selectedPathRef.current === pathToSave) {
          initialContentRef.current = contentToSave
          setLastSaved(new Date())
        }
      } catch (err) {
        console.error('Failed to save file:', err)
      } finally {
        renameInProgressRef.current = false
        if (wasActiveAtStart && (selectedPathRef.current === pathAtStart || selectedPathRef.current === pathToSave)) {
          setIsSaving(false)
        }
      }
    }
    saveFile()
  }, [debouncedContent, setHistory])

  // Close version history panel when switching files
  useEffect(() => {
    if (versionHistoryPath && selectedPath !== versionHistoryPath) {
      setVersionHistoryPath(null)
      setViewingHistoricalVersion(null)
    }
  }, [selectedPath, versionHistoryPath])

  // Load background tasks
  const loadBackgroundTasks = useCallback(async () => {
    try {
      const [configResult, stateResult] = await Promise.all([
        window.ipc.invoke('agent-schedule:getConfig', null),
        window.ipc.invoke('agent-schedule:getState', null),
      ])

      const tasks: BackgroundTaskItem[] = Object.entries(configResult.agents).map(([name, entry]) => {
        const state = stateResult.agents[name]
        return {
          name,
          description: entry.description,
          schedule: entry.schedule,
          enabled: entry.enabled ?? true,
          startingMessage: entry.startingMessage,
          status: state?.status,
          nextRunAt: state?.nextRunAt,
          lastRunAt: state?.lastRunAt,
          lastError: state?.lastError,
          runCount: state?.runCount ?? 0,
        }
      })

      setBackgroundTasks(tasks)
    } catch (err) {
      console.error('Failed to load background tasks:', err)
    }
  }, [])

  // Load background tasks on mount
  useEffect(() => {
    loadBackgroundTasks()
  }, [loadBackgroundTasks])

  // Handle toggling background task enabled state
  const handleToggleBackgroundTask = useCallback(async (taskName: string, enabled: boolean) => {
    const task = backgroundTasks.find(t => t.name === taskName)
    if (!task) return

    try {
      await window.ipc.invoke('agent-schedule:updateAgent', {
        agentName: taskName,
        entry: {
          schedule: task.schedule,
          enabled,
          startingMessage: task.startingMessage,
          description: task.description,
        },
      })
      // Reload to get updated state
      await loadBackgroundTasks()
    } catch (err) {
      console.error('Failed to update background task:', err)
    }
  }, [backgroundTasks, loadBackgroundTasks])

  const handleNewChat = useCallback(() => {
    resetChatRuntime()
    setSelectedBackgroundTask(null)
    setChatViewStateByTab(prev => ({
      ...prev,
      [activeChatTabIdRef.current]: createEmptyChatTabViewState(),
    }))
  }, [resetChatRuntime])

  // Chat tab operations
  const applyChatTab = useCallback((tab: ChatTab) => {
    if (tab.runId) {
      void loadRun(tab.runId)
    } else {
      resetChatRuntime()
    }
  }, [loadRun, resetChatRuntime])

  const restoreChatTabState = useCallback((tabId: string, fallbackRunId: string | null): boolean => {
    const cached = chatViewStateByTabRef.current[tabId]
    if (!cached) return false
    return restoreChatRuntime(cached, fallbackRunId)
  }, [restoreChatRuntime])

  const openChatInNewTab = useCallback((targetRunId: string) => {
    const existingTab = chatTabs.find(t => t.runId === targetRunId)
    if (existingTab) {
      cancelPendingRunLoads()
      setActiveChatTabId(existingTab.id)
      const restored = restoreChatTabState(existingTab.id, existingTab.runId)
      if (processingRunIds.has(targetRunId) || !restored) {
        void loadRun(targetRunId)
      }
      return
    }
    const id = newChatTabId()
    setChatTabs(prev => [...prev, { id, runId: targetRunId }])
    setActiveChatTabId(id)
    void loadRun(targetRunId)
  }, [cancelPendingRunLoads, chatTabs, loadRun, processingRunIds, restoreChatTabState])

  const switchChatTab = useCallback((tabId: string) => {
    const tab = chatTabs.find(t => t.id === tabId)
    if (!tab) return
    if (tabId === activeChatTabId) return
    saveChatScrollForTab(activeChatTabId)
    cancelPendingRunLoads()
    setActiveChatTabId(tabId)
    const restored = restoreChatTabState(tabId, tab.runId)
    if (tab.runId && processingRunIds.has(tab.runId)) {
      void loadRun(tab.runId)
      return
    }
    if (!restored) {
      applyChatTab(tab)
    }
  }, [activeChatTabId, applyChatTab, cancelPendingRunLoads, chatTabs, loadRun, processingRunIds, restoreChatTabState, saveChatScrollForTab])

  const closeChatTab = useCallback((tabId: string) => {
    if (chatTabs.length <= 1) return
    const idx = chatTabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    saveChatScrollForTab(tabId)
    const nextTabs = chatTabs.filter(t => t.id !== tabId)
    setChatTabs(nextTabs)
    setChatViewStateByTab(prev => {
      if (!(tabId in prev)) return prev
      const next = { ...prev }
      delete next[tabId]
      return next
    })
    chatDraftsRef.current.delete(tabId)
    chatScrollTopByTabRef.current.delete(tabId)
    setToolOpenByTab((prev) => {
      if (!(tabId in prev)) return prev
      const next = { ...prev }
      delete next[tabId]
      return next
    })

    if (tabId === activeChatTabId && nextTabs.length > 0) {
      const newIdx = Math.min(idx, nextTabs.length - 1)
      const newActiveTab = nextTabs[newIdx]
      cancelPendingRunLoads()
      setActiveChatTabId(newActiveTab.id)
      const restored = restoreChatTabState(newActiveTab.id, newActiveTab.runId)
      if (newActiveTab.runId && processingRunIds.has(newActiveTab.runId)) {
        void loadRun(newActiveTab.runId)
      } else if (!restored) {
        applyChatTab(newActiveTab)
      }
    }
  }, [activeChatTabId, applyChatTab, cancelPendingRunLoads, chatTabs, loadRun, processingRunIds, restoreChatTabState, saveChatScrollForTab])

  useEffect(() => {
    let cleanupScrollListener: (() => void) | undefined
    let pollRaf: number | undefined
    let restoreRafA: number | undefined
    let restoreRafB: number | undefined
    let restoreTimeout: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const restoreScrollTop = (container: HTMLElement, top: number) => {
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
      const clampedTop = clampNumber(top, 0, maxScroll)
      container.scrollTop = clampedTop
    }

    const attach = (): boolean => {
      if (cancelled) return true
      const container = getChatScrollContainer(activeChatTabId)
      if (!container) return false

      const savedTop = chatScrollTopByTabRef.current.get(activeChatTabId)
      if (savedTop !== undefined) {
        // Reinforce restoration across a couple frames because stick-to-bottom
        // may schedule scroll adjustments during mount/resize.
        restoreScrollTop(container, savedTop)
        restoreRafA = requestAnimationFrame(() => {
          restoreScrollTop(container, savedTop)
          restoreRafB = requestAnimationFrame(() => {
            restoreScrollTop(container, savedTop)
          })
        })
        restoreTimeout = setTimeout(() => {
          restoreScrollTop(container, savedTop)
        }, 220)
      }

      const onScroll = () => {
        chatScrollTopByTabRef.current.set(activeChatTabId, container.scrollTop)
      }
      container.addEventListener('scroll', onScroll, { passive: true })
      cleanupScrollListener = () => {
        chatScrollTopByTabRef.current.set(activeChatTabId, container.scrollTop)
        container.removeEventListener('scroll', onScroll)
      }
      return true
    }

    let attempts = 0
    const maxAttempts = 60
    const pollAttach = () => {
      if (cancelled) return
      if (attach()) return
      if (attempts >= maxAttempts) return
      attempts += 1
      pollRaf = requestAnimationFrame(pollAttach)
    }
    pollAttach()

    return () => {
      cancelled = true
      cleanupScrollListener?.()
      if (pollRaf !== undefined) cancelAnimationFrame(pollRaf)
      if (restoreRafA !== undefined) cancelAnimationFrame(restoreRafA)
      if (restoreRafB !== undefined) cancelAnimationFrame(restoreRafB)
      if (restoreTimeout !== undefined) clearTimeout(restoreTimeout)
    }
  }, [
    activeChatTabId,
    selectedPath,
    isGraphOpen,
    isChatSidebarOpen,
    isRightPaneMaximized,
    getChatScrollContainer,
  ])

  // File tab operations
  const openFileInNewTab = useCallback((path: string) => {
    const existingTab = fileTabs.find(t => t.path === path)
    if (existingTab) {
      setActiveFileTabId(existingTab.id)
      setIsGraphOpen(false)
      setSelectedPath(path)
      return
    }
    const id = newFileTabId()
    setFileTabs(prev => [...prev, { id, path }])
    setActiveFileTabId(id)
    setIsGraphOpen(false)
    setSelectedPath(path)
  }, [fileTabs])

  const switchFileTab = useCallback((tabId: string) => {
    const tab = fileTabs.find(t => t.id === tabId)
    if (!tab) return
    setActiveFileTabId(tabId)
    setSelectedBackgroundTask(null)
    setExpandedFrom(null)
    // If chat-only maximize is active, drop back to a visible knowledge layout.
    if (isRightPaneMaximized) {
      setIsRightPaneMaximized(false)
    }
    if (isGraphTabPath(tab.path)) {
      setSelectedPath(null)
      setIsGraphOpen(true)
      return
    }
    setIsGraphOpen(false)
    setSelectedPath(tab.path)
  }, [fileTabs, isRightPaneMaximized])

  const closeFileTab = useCallback((tabId: string) => {
    const closingTab = fileTabs.find(t => t.id === tabId)
    if (closingTab && !isGraphTabPath(closingTab.path)) {
      removeEditorCacheForPath(closingTab.path)
      initialContentByPathRef.current.delete(closingTab.path)
      if (editorPathRef.current === closingTab.path) {
        editorPathRef.current = null
      }
    }
    setFileTabs(prev => {
      if (prev.length <= 1) {
        // Last file tab - close it and go back to chat
        setActiveFileTabId(null)
        setSelectedPath(null)
        setIsGraphOpen(false)
        return []
      }
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return prev
      const next = prev.filter(t => t.id !== tabId)
      if (tabId === activeFileTabId && next.length > 0) {
        const newIdx = Math.min(idx, next.length - 1)
        const newActiveTab = next[newIdx]
        setActiveFileTabId(newActiveTab.id)
        if (isGraphTabPath(newActiveTab.path)) {
          setSelectedPath(null)
          setIsGraphOpen(true)
        } else {
          setIsGraphOpen(false)
          setSelectedPath(newActiveTab.path)
        }
      }
      return next
    })
    setEditorSessionByTabId((prev) => {
      if (!(tabId in prev)) return prev
      const next = { ...prev }
      delete next[tabId]
      return next
    })
    fileHistoryHandlersRef.current.delete(tabId)
  }, [activeFileTabId, fileTabs, removeEditorCacheForPath])

  const handleNewChatTab = useCallback(() => {
    // If there's already an empty "New chat" tab, switch to it
    const emptyTab = chatTabs.find(t => !t.runId)
    if (emptyTab) {
      if (emptyTab.id !== activeChatTabId) {
        setActiveChatTabId(emptyTab.id)
      }
    } else {
      // Create a new tab
      const id = newChatTabId()
      setChatTabs(prev => [...prev, { id, runId: null }])
      setActiveChatTabId(id)
    }
    handleNewChat()
    // Left-pane "new chat" should always open full chat view.
    if (selectedPath || isGraphOpen) {
      setExpandedFrom({ path: selectedPath, graph: isGraphOpen })
    } else {
      setExpandedFrom(null)
    }
    setIsRightPaneMaximized(false)
    setSelectedPath(null)
    setIsGraphOpen(false)
  }, [chatTabs, activeChatTabId, handleNewChat, selectedPath, isGraphOpen])

  // Sidebar variant: create/switch chat tab without leaving file/graph context.
  const handleNewChatTabInSidebar = useCallback(() => {
    const emptyTab = chatTabs.find(t => !t.runId)
    if (emptyTab) {
      if (emptyTab.id !== activeChatTabId) {
        setActiveChatTabId(emptyTab.id)
      }
    } else {
      const id = newChatTabId()
      setChatTabs(prev => [...prev, { id, runId: null }])
      setActiveChatTabId(id)
    }
    handleNewChat()
  }, [chatTabs, activeChatTabId, handleNewChat])

  const toggleKnowledgePane = useCallback(() => {
    setIsRightPaneMaximized(false)
    setIsChatSidebarOpen(prev => !prev)
  }, [])

  const toggleRightPaneMaximize = useCallback(() => {
    setIsChatSidebarOpen(true)
    setIsRightPaneMaximized(prev => !prev)
  }, [])

  const handleOpenFullScreenChat = useCallback(() => {
    // Remember where we came from so the close button can return
    if (selectedPath || isGraphOpen) {
      setExpandedFrom({ path: selectedPath, graph: isGraphOpen })
    }
    setIsRightPaneMaximized(false)
    setSelectedPath(null)
    setIsGraphOpen(false)
  }, [selectedPath, isGraphOpen])

  const handleCloseFullScreenChat = useCallback(() => {
    if (expandedFrom) {
      if (expandedFrom.graph) {
        setIsGraphOpen(true)
      } else if (expandedFrom.path) {
        setSelectedPath(expandedFrom.path)
      }
      setExpandedFrom(null)
      setIsRightPaneMaximized(false)
    }
  }, [expandedFrom])

  const currentViewState = React.useMemo<ViewState>(() => {
    if (selectedBackgroundTask) return { type: 'task', name: selectedBackgroundTask }
    if (selectedPath) return { type: 'file', path: selectedPath }
    if (isGraphOpen) return { type: 'graph' }
    return { type: 'chat', runId }
  }, [selectedBackgroundTask, selectedPath, isGraphOpen, runId])

  const appendUnique = useCallback((stack: ViewState[], entry: ViewState) => {
    const last = stack[stack.length - 1]
    if (last && viewStatesEqual(last, entry)) return stack
    return [...stack, entry]
  }, [])

  const ensureFileTabForPath = useCallback((path: string) => {
    const existingTab = fileTabs.find((tab) => tab.path === path)
    if (existingTab) {
      setActiveFileTabId(existingTab.id)
      return
    }

    if (activeFileTabId) {
      const activeTab = fileTabs.find((tab) => tab.id === activeFileTabId)
      if (activeTab && !isGraphTabPath(activeTab.path)) {
        setFileTabs((prev) => prev.map((tab) => (
          tab.id === activeFileTabId ? { ...tab, path } : tab
        )))
        // Rebinds this tab to a different note path: reset editor session to clear undo history.
        setEditorSessionByTabId((prev) => ({
          ...prev,
          [activeFileTabId]: (prev[activeFileTabId] ?? 0) + 1,
        }))
        return
      }
    }

    const id = newFileTabId()
    setFileTabs((prev) => [...prev, { id, path }])
    setActiveFileTabId(id)
  }, [fileTabs, activeFileTabId])

  const ensureGraphFileTab = useCallback(() => {
    const existingGraphTab = fileTabs.find((tab) => isGraphTabPath(tab.path))
    if (existingGraphTab) {
      setActiveFileTabId(existingGraphTab.id)
      return
    }
    const id = newFileTabId()
    setFileTabs((prev) => [...prev, { id, path: GRAPH_TAB_PATH }])
    setActiveFileTabId(id)
  }, [fileTabs])

  const applyViewState = useCallback(async (view: ViewState) => {
    switch (view.type) {
      case 'file':
        setSelectedBackgroundTask(null)
        setIsGraphOpen(false)
        setExpandedFrom(null)
        // Preserve split vs knowledge-max mode when navigating knowledge files.
        // Only exit chat-only maximize, because that would hide the selected file.
        if (isRightPaneMaximized) {
          setIsRightPaneMaximized(false)
        }
        setSelectedPath(view.path)
        ensureFileTabForPath(view.path)
        return
      case 'graph':
        setSelectedBackgroundTask(null)
        setSelectedPath(null)
        setExpandedFrom(null)
        setIsGraphOpen(true)
        ensureGraphFileTab()
        if (isRightPaneMaximized) {
          setIsRightPaneMaximized(false)
        }
        return
      case 'task':
        setSelectedPath(null)
        setIsGraphOpen(false)
        setExpandedFrom(null)
        setIsRightPaneMaximized(false)
        setSelectedBackgroundTask(view.name)
        return
      case 'chat':
        setSelectedPath(null)
        setIsGraphOpen(false)
        setExpandedFrom(null)
        setIsRightPaneMaximized(false)
        setSelectedBackgroundTask(null)
        if (view.runId) {
          await loadRun(view.runId)
        } else {
          handleNewChat()
        }
        return
    }
  }, [ensureFileTabForPath, ensureGraphFileTab, handleNewChat, isRightPaneMaximized, loadRun])

  const navigateToView = useCallback(async (nextView: ViewState) => {
    const current = currentViewState
    if (viewStatesEqual(current, nextView)) return

    const nextHistory = {
      back: appendUnique(historyRef.current.back, current),
      forward: [] as ViewState[],
    }
    setHistory(nextHistory)
    await applyViewState(nextView)
  }, [appendUnique, applyViewState, currentViewState, setHistory])

  const navigateBack = useCallback(async () => {
    const { back, forward } = historyRef.current
    if (back.length === 0) return

    let i = back.length - 1
    while (i >= 0 && viewStatesEqual(back[i], currentViewState)) i -= 1
    if (i < 0) {
      setHistory({ back: [], forward })
      return
    }

    const target = back[i]
    const nextHistory = {
      back: back.slice(0, i),
      forward: appendUnique(forward, currentViewState),
    }
    setHistory(nextHistory)
    await applyViewState(target)
  }, [appendUnique, applyViewState, currentViewState, setHistory])

  const navigateForward = useCallback(async () => {
    const { back, forward } = historyRef.current
    if (forward.length === 0) return

    let i = forward.length - 1
    while (i >= 0 && viewStatesEqual(forward[i], currentViewState)) i -= 1
    if (i < 0) {
      setHistory({ back, forward: [] })
      return
    }

    const target = forward[i]
    const nextHistory = {
      back: appendUnique(back, currentViewState),
      forward: forward.slice(0, i),
    }
    setHistory(nextHistory)
    await applyViewState(target)
  }, [appendUnique, applyViewState, currentViewState, setHistory])

  const canNavigateBack = React.useMemo(() => {
    for (let i = viewHistory.back.length - 1; i >= 0; i--) {
      if (!viewStatesEqual(viewHistory.back[i], currentViewState)) return true
    }
    return false
  }, [viewHistory.back, currentViewState])

  const canNavigateForward = React.useMemo(() => {
    for (let i = viewHistory.forward.length - 1; i >= 0; i--) {
      if (!viewStatesEqual(viewHistory.forward[i], currentViewState)) return true
    }
    return false
  }, [viewHistory.forward, currentViewState])

  const navigateToFile = useCallback((path: string) => {
    void navigateToView({ type: 'file', path })
  }, [navigateToView])

  const navigateToFullScreenChat = useCallback(() => {
    // Only treat this as navigation when coming from another view
    if (currentViewState.type !== 'chat') {
      const nextHistory = {
        back: appendUnique(historyRef.current.back, currentViewState),
        forward: [] as ViewState[],
      }
      setHistory(nextHistory)
    }
    handleOpenFullScreenChat()
  }, [appendUnique, currentViewState, handleOpenFullScreenChat, setHistory])

  // Handle image upload for the markdown editor
  const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
    try {
      // Read file as data URL (includes mime type)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Also save to .assets folder for persistence
      const timestamp = Date.now()
      const extension = file.name.split('.').pop() || 'png'
      const filename = `image-${timestamp}.${extension}`
      const assetsPath = 'knowledge/.assets'
      const imagePath = `${assetsPath}/${filename}`

      try {
        // Extract base64 data (remove data URL prefix)
        const base64Data = dataUrl.split(',')[1]
        await window.ipc.invoke('workspace:writeFile', {
          path: imagePath,
          data: base64Data,
          opts: { encoding: 'base64', mkdirp: true }
        })
      } catch (err) {
        console.error('Failed to save image to disk:', err)
        // Continue anyway - image will still display via data URL
      }

      // Return data URL for immediate display in editor
      return dataUrl
    } catch (error) {
      console.error('Failed to upload image:', error)
      return null
    }
  }, [])

  // Keyboard shortcut: Ctrl+L to toggle main chat view
  const isFullScreenChat = !selectedPath && !isGraphOpen && !selectedBackgroundTask
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        if (isFullScreenChat && expandedFrom) {
          handleCloseFullScreenChat()
        } else {
          navigateToFullScreenChat()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleCloseFullScreenChat, isFullScreenChat, expandedFrom, navigateToFullScreenChat])

  // Keyboard shortcut: Cmd+K / Ctrl+K to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Route undo/redo to the active markdown tab only (prevents cross-tab browser undo behavior).
  useEffect(() => {
    const handleHistoryKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey) return

      const key = e.key.toLowerCase()
      const wantsUndo = key === 'z' && !e.shiftKey
      const wantsRedo = (key === 'z' && e.shiftKey) || (!isMac && key === 'y')
      if (!wantsUndo && !wantsRedo) return

      if (!selectedPath || !selectedPath.endsWith('.md') || !activeFileTabId) return

      const target = e.target as EventTarget | null
      if (target instanceof HTMLElement) {
        const inTipTapEditor = Boolean(target.closest('.tiptap-editor'))
        const inOtherTextInput = (
          target instanceof HTMLInputElement
          || target instanceof HTMLTextAreaElement
          || target.isContentEditable
        ) && !inTipTapEditor
        if (inOtherTextInput) return
      }

      const handlers = fileHistoryHandlersRef.current.get(activeFileTabId)
      if (!handlers) return

      e.preventDefault()
      e.stopPropagation()
      if (wantsUndo) {
        handlers.undo()
      } else {
        handlers.redo()
      }
    }

    document.addEventListener('keydown', handleHistoryKeyDown, true)
    return () => document.removeEventListener('keydown', handleHistoryKeyDown, true)
  }, [activeFileTabId, isMac, selectedPath])

  // Keyboard shortcuts for tab management
  useEffect(() => {
    const handleTabKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const rightPaneAvailable = Boolean((selectedPath || isGraphOpen) && isChatSidebarOpen)
      const targetPane: ShortcutPane = rightPaneAvailable
        ? (isRightPaneMaximized ? 'right' : activeShortcutPane)
        : 'left'
      const inFileView = targetPane === 'left' && Boolean(selectedPath || isGraphOpen)
      const selectedKnowledgePath = isGraphOpen ? GRAPH_TAB_PATH : selectedPath
      const targetFileTabId = activeFileTabId ?? (
        selectedKnowledgePath
          ? (fileTabs.find((tab) => tab.path === selectedKnowledgePath)?.id ?? null)
          : null
      )

      // Cmd+W — close active tab
      if (e.key === 'w') {
        e.preventDefault()
        if (inFileView && targetFileTabId) {
          closeFileTab(targetFileTabId)
        } else {
          closeChatTab(activeChatTabId)
        }
        return
      }

      // Cmd+1..9 — switch to tab N (Cmd+9 always goes to last tab)
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const n = parseInt(e.key, 10)
        if (inFileView) {
          const idx = e.key === '9' ? fileTabs.length - 1 : n - 1
          const tab = fileTabs[idx]
          if (tab) switchFileTab(tab.id)
        } else {
          const idx = e.key === '9' ? chatTabs.length - 1 : n - 1
          const tab = chatTabs[idx]
          if (tab) switchChatTab(tab.id)
        }
        return
      }

      // Cmd+Shift+] — next tab, Cmd+Shift+[ — previous tab
      if (e.shiftKey && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        const direction = e.key === ']' ? 1 : -1
        if (inFileView) {
          const currentIdx = fileTabs.findIndex(t => t.id === targetFileTabId)
          if (currentIdx === -1) return
          const nextIdx = (currentIdx + direction + fileTabs.length) % fileTabs.length
          switchFileTab(fileTabs[nextIdx].id)
        } else {
          const currentIdx = chatTabs.findIndex(t => t.id === activeChatTabId)
          if (currentIdx === -1) return
          const nextIdx = (currentIdx + direction + chatTabs.length) % chatTabs.length
          switchChatTab(chatTabs[nextIdx].id)
        }
        return
      }
    }
    document.addEventListener('keydown', handleTabKeyDown)
    return () => document.removeEventListener('keydown', handleTabKeyDown)
  }, [selectedPath, isGraphOpen, isChatSidebarOpen, isRightPaneMaximized, activeShortcutPane, chatTabs, fileTabs, activeChatTabId, activeFileTabId, closeChatTab, closeFileTab, switchChatTab, switchFileTab])

  const toggleExpand = (path: string, kind: 'file' | 'dir') => {
    if (kind === 'file') {
      navigateToFile(path)
      return
    }

    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedPaths(newExpanded)
  }

  // Knowledge quick actions
  const knowledgeFiles = React.useMemo(() => {
    const files = collectFilePaths(tree).filter((path) => path.endsWith('.md'))
    return Array.from(new Set(files.map(stripKnowledgePrefix)))
  }, [tree])
  const knowledgeFilePaths = React.useMemo(() => (
    knowledgeFiles.reduce<string[]>((acc, filePath) => {
      const resolved = toKnowledgePath(filePath)
      if (resolved) acc.push(resolved)
      return acc
    }, [])
  ), [knowledgeFiles])

  // Compute visible files (files whose parent directories are expanded)
  const visibleKnowledgeFiles = React.useMemo(() => {
    const visible: string[] = []
    const isPathVisible = (path: string) => {
      const parts = path.split('/')
      // Root level files in knowledge are always visible
      if (parts.length <= 2) return true
      // Check if all parent directories are expanded
      for (let i = 1; i < parts.length - 1; i++) {
        const parentPath = parts.slice(0, i + 1).join('/')
        if (!expandedPaths.has(parentPath)) return false
      }
      return true
    }

    for (const file of knowledgeFiles) {
      const fullPath = toKnowledgePath(file)
      if (fullPath && isPathVisible(fullPath)) {
        visible.push(file)
      }
    }
    return visible
  }, [knowledgeFiles, expandedPaths])

  // Load workspace root on mount
  useEffect(() => {
    window.ipc.invoke('workspace:getRoot', null).then(result => {
      setWorkspaceRoot(result.root)
    })
  }, [])


  const knowledgeActions = React.useMemo(() => ({
    createNote: async (parentPath: string = 'knowledge') => {
      try {
        let index = 0
        let name = untitledBaseName
        let fullPath = `${parentPath}/${name}.md`
        while (index < 1000) {
          const exists = await window.ipc.invoke('workspace:exists', { path: fullPath })
          if (!exists.exists) break
          index += 1
          name = `${untitledBaseName}-${index}`
          fullPath = `${parentPath}/${name}.md`
        }
        await window.ipc.invoke('workspace:writeFile', {
          path: fullPath,
          data: `# ${name}\n\n`,
          opts: { encoding: 'utf8' }
        })
        navigateToFile(fullPath)
      } catch (err) {
        console.error('Failed to create note:', err)
        throw err
      }
    },
    createFolder: async (parentPath: string = 'knowledge') => {
      try {
        await window.ipc.invoke('workspace:mkdir', {
          path: `${parentPath}/new-folder-${Date.now()}`,
          recursive: true
        })
      } catch (err) {
        console.error('Failed to create folder:', err)
        throw err
      }
    },
    openGraph: () => {
      // From chat-only landing state, open graph directly in full knowledge view.
      if (!selectedPath && !isGraphOpen && !selectedBackgroundTask) {
        setIsChatSidebarOpen(false)
        setIsRightPaneMaximized(false)
      }
      void navigateToView({ type: 'graph' })
    },
    expandAll: () => setExpandedPaths(new Set(collectDirPaths(tree))),
    collapseAll: () => setExpandedPaths(new Set()),
    rename: async (oldPath: string, newName: string, isDir: boolean) => {
      try {
        const parts = oldPath.split('/')
        // For files, ensure .md extension
        const finalName = isDir ? newName : (newName.endsWith('.md') ? newName : `${newName}.md`)
        parts[parts.length - 1] = finalName
        const newPath = parts.join('/')
        await window.ipc.invoke('workspace:rename', { from: oldPath, to: newPath })
        const rewriteForRename = (content: string) =>
          isDir ? content : rewriteWikiLinksForRenamedFileInMarkdown(content, oldPath, newPath)
        setFileTabs(prev => prev.map(tab => (tab.path === oldPath ? { ...tab, path: newPath } : tab)))
        if (editorPathRef.current === oldPath) {
          editorPathRef.current = newPath
        }
        const baseline = initialContentByPathRef.current.get(oldPath)
        if (baseline !== undefined) {
          initialContentByPathRef.current.delete(oldPath)
          initialContentByPathRef.current.set(newPath, rewriteForRename(baseline))
        }
        const cachedContent = editorContentByPathRef.current.get(oldPath)
        if (cachedContent !== undefined) {
          const rewrittenCachedContent = rewriteForRename(cachedContent)
          editorContentByPathRef.current.delete(oldPath)
          editorContentByPathRef.current.set(newPath, rewrittenCachedContent)
          setEditorContentByPath(prev => {
            if (!(oldPath in prev)) return prev
            const next = { ...prev }
            delete next[oldPath]
            next[newPath] = rewriteForRename(cachedContent)
            return next
          })
        }
        if (selectedPath === oldPath) {
          const rewrittenEditorContent = rewriteForRename(editorContentRef.current)
          editorContentRef.current = rewrittenEditorContent
          setEditorContent(rewrittenEditorContent)
          initialContentRef.current = rewriteForRename(initialContentRef.current)
        }
        if (selectedPath === oldPath) setSelectedPath(newPath)
      } catch (err) {
        console.error('Failed to rename:', err)
        throw err
      }
    },
    remove: async (path: string) => {
      try {
        await window.ipc.invoke('workspace:remove', { path, opts: { trash: true } })
        if (path.endsWith('.md')) {
          removeEditorCacheForPath(path)
          initialContentByPathRef.current.delete(path)
        }
        // Close any file tab showing the deleted file
        const tabForFile = fileTabs.find(t => t.path === path)
        if (tabForFile) {
          closeFileTab(tabForFile.id)
        } else if (selectedPath === path) {
          setSelectedPath(null)
        }
      } catch (err) {
        console.error('Failed to remove:', err)
        throw err
      }
    },
    copyPath: (path: string) => {
      const fullPath = workspaceRoot ? `${workspaceRoot}/${path}` : path
      navigator.clipboard.writeText(fullPath)
    },
    onOpenInNewTab: (path: string) => {
      openFileInNewTab(path)
    },
  }), [tree, selectedPath, isGraphOpen, selectedBackgroundTask, workspaceRoot, navigateToFile, navigateToView, openFileInNewTab, fileTabs, closeFileTab, removeEditorCacheForPath])

  // Handler for when a voice note is created/updated
  const handleVoiceNoteCreated = useCallback(async (notePath: string) => {
    // Refresh the tree to show the new file/folder
    const newTree = await loadDirectory()
    setTree(newTree)

    // Expand parent directories to show the file
    const parts = notePath.split('/')
    const parentPaths: string[] = []
    for (let i = 1; i < parts.length; i++) {
      parentPaths.push(parts.slice(0, i).join('/'))
    }
    setExpandedPaths(prev => {
      const newSet = new Set(prev)
      parentPaths.forEach(p => newSet.add(p))
      return newSet
    })

    // Select the file to show it in the editor
    navigateToFile(notePath)
  }, [loadDirectory, navigateToFile])

  const ensureWikiFile = useCallback(async (wikiPath: string) => {
    const resolvedPath = toKnowledgePath(wikiPath)
    if (!resolvedPath) return null
    try {
      const exists = await window.ipc.invoke('workspace:exists', { path: resolvedPath })
      if (!exists.exists) {
        const title = wikiLabel(wikiPath) || 'New Note'
        await window.ipc.invoke('workspace:writeFile', {
          path: resolvedPath,
          data: `# ${title}\n\n`,
          opts: { encoding: 'utf8', mkdirp: true },
        })
      }
      return resolvedPath
    } catch (err) {
      console.error('Failed to ensure wiki link target:', err)
      return null
    }
  }, [])

  const openWikiLink = useCallback(async (wikiPath: string) => {
    const resolvedPath = await ensureWikiFile(wikiPath)
    if (resolvedPath) {
      navigateToFile(resolvedPath)
    }
  }, [ensureWikiFile, navigateToFile])

  const wikiLinkConfig = React.useMemo(() => ({
    files: knowledgeFiles,
    recent: recentWikiFiles,
    onOpen: (path: string) => {
      void openWikiLink(path)
    },
    onCreate: (path: string) => {
      void ensureWikiFile(path)
    },
  }), [knowledgeFiles, recentWikiFiles, openWikiLink, ensureWikiFile])

  useEffect(() => {
    if (!isGraphOpen) return
    let cancelled = false

    const buildGraph = async () => {
      setGraphStatus('loading')
      setGraphError(null)

      if (knowledgeFilePaths.length === 0) {
        setGraphData({ nodes: [], edges: [] })
        setGraphStatus('ready')
        return
      }

      const nodeSet = new Set(knowledgeFilePaths)
      const edges: GraphEdge[] = []
      const edgeKeys = new Set<string>()

      const contents = await Promise.all(
        knowledgeFilePaths.map(async (path) => {
          try {
            const result = await window.ipc.invoke('workspace:readFile', { path })
            return { path, data: result.data as string }
          } catch (err) {
            console.error('Failed to read file for graph:', path, err)
            return { path, data: '' }
          }
        })
      )

      for (const { path, data } of contents) {
        for (const match of data.matchAll(wikiLinkRegex)) {
          const rawTarget = match[1]?.trim() ?? ''
          const targetPath = toKnowledgePath(rawTarget)
          if (!targetPath || targetPath === path) continue
          if (!nodeSet.has(targetPath)) continue
          const edgeKey = path < targetPath ? `${path}|${targetPath}` : `${targetPath}|${path}`
          if (edgeKeys.has(edgeKey)) continue
          edgeKeys.add(edgeKey)
          edges.push({ source: path, target: targetPath })
        }
      }

      const degreeMap = new Map<string, number>()
      edges.forEach((edge) => {
        degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
        degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
      })

      const groupIndexMap = new Map<string, number>()
      const getGroupIndex = (group: string) => {
        const existing = groupIndexMap.get(group)
        if (existing !== undefined) return existing
        const nextIndex = groupIndexMap.size
        groupIndexMap.set(group, nextIndex)
        return nextIndex
      }
      const getNodeGroup = (path: string) => {
        const normalized = stripKnowledgePrefix(path)
        const parts = normalized.split('/').filter(Boolean)
        if (parts.length <= 1) {
          return { group: 'root', depth: 0 }
        }
        return {
          group: parts[0],
          depth: Math.max(0, parts.length - 2),
        }
      }
      const getNodeColors = (groupIndex: number, depth: number) => {
        const base = graphPalette[groupIndex % graphPalette.length]
        const light = clampNumber(base.light + depth * 6, 36, 72)
        const strokeLight = clampNumber(light - 12, 28, 60)
        return {
          fill: `hsl(${base.hue} ${base.sat}% ${light}%)`,
          stroke: `hsl(${base.hue} ${Math.min(80, base.sat + 8)}% ${strokeLight}%)`,
        }
      }

      const nodes = knowledgeFilePaths.map((path) => {
        const degree = degreeMap.get(path) ?? 0
        const radius = 6 + Math.min(18, degree * 2)
        const { group, depth } = getNodeGroup(path)
        const groupIndex = getGroupIndex(group)
        const colors = getNodeColors(groupIndex, depth)
        return {
          id: path,
          label: wikiLabel(path) || path,
          degree,
          radius,
          group,
          color: colors.fill,
          stroke: colors.stroke,
        }
      })

      if (!cancelled) {
        setGraphData({ nodes, edges })
        setGraphStatus('ready')
      }
    }

    buildGraph().catch((err) => {
      if (cancelled) return
      console.error('Failed to build graph:', err)
      setGraphStatus('error')
      setGraphError(err instanceof Error ? err.message : 'Failed to build graph')
    })

    return () => {
      cancelled = true
    }
  }, [isGraphOpen, knowledgeFilePaths])

  const renderConversationItem = (item: ConversationItem, tabId: string) => {
    if (isChatMessage(item)) {
      if (item.role === 'user') {
        if (item.attachments && item.attachments.length > 0) {
          return (
            <Message key={item.id} from={item.role}>
              <MessageContent className="group-[.is-user]:bg-transparent group-[.is-user]:px-0 group-[.is-user]:py-0 group-[.is-user]:rounded-none">
                <ChatMessageAttachments attachments={item.attachments} />
              </MessageContent>
              {item.content && (
                <MessageContent>{item.content}</MessageContent>
              )}
            </Message>
          )
        }
        const { message, files } = parseAttachedFiles(item.content)
        return (
          <Message key={item.id} from={item.role}>
            <MessageContent>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {files.map((filePath, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                    >
                      @{wikiLabel(filePath)}
                    </span>
                  ))}
                </div>
              )}
              {message}
            </MessageContent>
          </Message>
        )
      }
      return (
        <Message key={item.id} from={item.role}>
          <MessageContent>
            <MessageResponse components={streamdownComponents}>{item.content}</MessageResponse>
          </MessageContent>
        </Message>
      )
    }

    if (isToolCall(item)) {
      const webSearchData = getWebSearchCardData(item)
      if (webSearchData) {
        return (
          <WebSearchResult
            key={item.id}
            query={webSearchData.query}
            results={webSearchData.results}
            status={item.status}
            title={webSearchData.title}
          />
        )
      }
      const errorText = item.status === 'error' ? 'Tool error' : ''
      const output = normalizeToolOutput(item.result, item.status)
      const input = normalizeToolInput(item.input)
      return (
        <Tool
          key={item.id}
          open={isToolOpenForTab(tabId, item.id)}
          onOpenChange={(open) => setToolOpenForTab(tabId, item.id, open)}
        >
          <ToolHeader
            title={item.name}
            type={`tool-${item.name}`}
            state={toToolState(item.status)}
          />
          <ToolContent>
            <ToolInput input={input} />
            {output !== null ? (
              <ToolOutput output={output} errorText={errorText} />
            ) : null}
          </ToolContent>
        </Tool>
      )
    }

    if (isErrorMessage(item)) {
      return (
        <Message key={item.id} from="assistant">
          <MessageContent className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            <pre className="whitespace-pre-wrap font-mono text-xs">{item.message}</pre>
          </MessageContent>
        </Message>
      )
    }

    return null
  }

  const activeChatTabState = chatRuntimeSnapshot
  const emptyChatTabState = React.useMemo<ChatTabViewState>(() => createEmptyChatTabViewState(), [])
  const getChatTabStateForRender = useCallback((tabId: string): ChatTabViewState => {
    if (tabId === activeChatTabId) return activeChatTabState
    return chatViewStateByTab[tabId] ?? emptyChatTabState
  }, [activeChatTabId, activeChatTabState, chatViewStateByTab, emptyChatTabState])
  const hasConversation = activeChatTabState.conversation.length > 0 || activeChatTabState.currentAssistantMessage
  const selectedTask = selectedBackgroundTask
    ? backgroundTasks.find(t => t.name === selectedBackgroundTask)
    : null
  const isRightPaneContext = Boolean(selectedPath || isGraphOpen)
  const isRightPaneOnlyMode = isRightPaneContext && isChatSidebarOpen && isRightPaneMaximized
  const shouldCollapseLeftPane = isRightPaneOnlyMode
  const openMarkdownTabs = React.useMemo(() => {
    const markdownTabs = fileTabs.filter(tab => tab.path.endsWith('.md'))
    if (selectedPath?.endsWith('.md')) {
      const hasSelectedTab = markdownTabs.some(tab => tab.path === selectedPath)
      if (!hasSelectedTab) {
        return [...markdownTabs, { id: '__active-markdown-tab__', path: selectedPath }]
      }
    }
    return markdownTabs
  }, [fileTabs, selectedPath])

  return (
    <RendererAppShell
      isMac={isMac}
      supportsCustomTitlebar={supportsCustomTitlebar}
      logoSrc={titlebarLogoSrc}
      isWindowMaximized={windowState?.isMaximized ?? false}
      shouldCollapseLeftPane={shouldCollapseLeftPane}
      canNavigateBack={canNavigateBack}
      canNavigateForward={canNavigateForward}
      onNavigateBack={() => { void navigateBack() }}
      onNavigateForward={() => { void navigateForward() }}
      onWindowMinimize={handleWindowMinimize}
      onWindowToggleMaximize={handleWindowToggleMaximize}
      onWindowClose={handleWindowClose}
      onNewChat={handleNewChatTab}
      onOpenSearch={() => setIsSearchOpen(true)}
      onActivatePrimaryPane={() => setActiveShortcutPane('left')}
      leftSidebar={
        <SidebarContentPanel
              tree={tree}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelectFile={toggleExpand}
              knowledgeActions={knowledgeActions}
              onVoiceNoteCreated={handleVoiceNoteCreated}
              runs={runs}
              currentRunId={runId}
              processingRunIds={processingRunIds}
              tasksActions={{
                onNewChat: handleNewChatTab,
                onSelectRun: (runIdToLoad) => {
                  if (selectedPath || isGraphOpen) {
                    setIsChatSidebarOpen(true)
                  }

                  // If already open in a chat tab, switch to it
                  const existingTab = chatTabs.find(t => t.runId === runIdToLoad)
                  if (existingTab) {
                    switchChatTab(existingTab.id)
                    return
                  }
                  // In two-pane mode, keep current knowledge/graph context and just swap chat context.
                  if (selectedPath || isGraphOpen) {
                    setChatTabs(prev => prev.map(t => t.id === activeChatTabId ? { ...t, runId: runIdToLoad } : t))
                    loadRun(runIdToLoad)
                    return
                  }

                  // Outside two-pane mode, navigate to chat.
                  setChatTabs(prev => prev.map(t => t.id === activeChatTabId ? { ...t, runId: runIdToLoad } : t))
                  void navigateToView({ type: 'chat', runId: runIdToLoad })
                },
                onOpenInNewTab: (targetRunId) => {
                  openChatInNewTab(targetRunId)
                },
                onDeleteRun: async (runIdToDelete) => {
                  try {
                    await window.ipc.invoke('runs:delete', { runId: runIdToDelete })
                    // Close any chat tab showing the deleted run
                    const tabForRun = chatTabs.find(t => t.runId === runIdToDelete)
                    if (tabForRun) {
                      if (chatTabs.length > 1) {
                        closeChatTab(tabForRun.id)
                      } else {
                        // Only one tab, reset it to new chat
                        setChatTabs([{ id: tabForRun.id, runId: null }])
                        if (selectedPath || isGraphOpen) {
                          handleNewChat()
                        } else {
                          void navigateToView({ type: 'chat', runId: null })
                        }
                      }
                    } else if (runId === runIdToDelete) {
                      if (selectedPath || isGraphOpen) {
                        setChatTabs(prev => prev.map(t => t.id === activeChatTabId ? { ...t, runId: null } : t))
                        handleNewChat()
                      } else {
                        void navigateToView({ type: 'chat', runId: null })
                      }
                    }
                    await loadRuns()
                  } catch (err) {
                    console.error('Failed to delete run:', err)
                  }
                },
                onSelectBackgroundTask: (taskName) => {
                  void navigateToView({ type: 'task', name: taskName })
                },
              }}
              backgroundTasks={backgroundTasks}
              selectedBackgroundTask={selectedBackgroundTask}
            />
      }
      headerContent={
        <>
          {(selectedPath || isGraphOpen) && fileTabs.length >= 1 ? (
                  <TabBar
                    tabs={fileTabs}
                    activeTabId={activeFileTabId ?? ''}
                    getTabTitle={getFileTabTitle}
                    getTabId={(t) => t.id}
                    onSwitchTab={switchFileTab}
                    onCloseTab={closeFileTab}
                    allowSingleTabClose={fileTabs.length === 1 && isGraphOpen}
                  />
                ) : (
                  <TabBar
                    tabs={chatTabs}
                    activeTabId={activeChatTabId}
                    getTabTitle={getChatTabTitle}
                    getTabId={(t) => t.id}
                    isProcessing={isChatTabProcessing}
                    onSwitchTab={switchChatTab}
                    onCloseTab={closeChatTab}
                  />
                )}
                {selectedPath && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground self-center shrink-0 pl-2">
                    {isSaving ? (
                      <>
                        <LoaderIcon className="h-3 w-3 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : lastSaved ? (
                      <>
                        <CheckIcon className="h-3 w-3 text-green-500" />
                        <span>Saved</span>
                      </>
                    ) : null}
                  </div>
                )}
                {selectedPath && selectedPath.startsWith('knowledge/') && selectedPath.endsWith('.md') && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          if (versionHistoryPath) {
                            setVersionHistoryPath(null)
                            setViewingHistoricalVersion(null)
                          } else {
                            setVersionHistoryPath(selectedPath)
                          }
                        }}
                        className={cn(
                          "titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors self-center shrink-0",
                          versionHistoryPath && "bg-accent text-foreground"
                        )}
                        aria-label="Version history"
                      >
                        <HistoryIcon className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Version history</TooltipContent>
                  </Tooltip>
                )}
                {!selectedPath && !isGraphOpen && !selectedTask && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleNewChatTab}
                        className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors self-center shrink-0"
                        aria-label="New chat tab"
                      >
                        <SquarePen className="size-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">New chat tab</TooltipContent>
                  </Tooltip>
                )}
                {!selectedPath && !isGraphOpen && expandedFrom && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleCloseFullScreenChat}
                        className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors self-center shrink-0"
                        aria-label="Restore two-pane view"
                      >
                        <Minimize2 className="size-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Restore two-pane view</TooltipContent>
                  </Tooltip>
                )}
                {(selectedPath || isGraphOpen) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={toggleKnowledgePane}
                        className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors -mr-1 self-center shrink-0"
                        aria-label={isChatSidebarOpen ? "Maximize knowledge view" : "Restore two-pane view"}
                      >
                        {isChatSidebarOpen ? <Maximize2 className="size-5" /> : <Minimize2 className="size-5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {isChatSidebarOpen ? "Maximize knowledge view" : "Restore two-pane view"}
                    </TooltipContent>
                  </Tooltip>
                )}
        </>
      }
      mainContent={
        <>
          {isGraphOpen ? (
                <div className="flex-1 min-h-0">
                  <GraphView
                    nodes={graphData.nodes}
                    edges={graphData.edges}
                    isLoading={graphStatus === 'loading'}
                    error={graphStatus === 'error' ? (graphError ?? 'Failed to build graph') : null}
                    onSelectNode={(path) => {
                      navigateToFile(path)
                    }}
                  />
                </div>
              ) : selectedPath ? (
                selectedPath.endsWith('.md') ? (
                  <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                      {openMarkdownTabs.map((tab) => {
                        const isActive = activeFileTabId
                          ? tab.id === activeFileTabId || tab.path === selectedPath
                          : tab.path === selectedPath
                        const isViewingHistory = viewingHistoricalVersion && isActive && versionHistoryPath === tab.path
                        const tabContent = isViewingHistory
                          ? viewingHistoricalVersion.content
                          : editorContentByPath[tab.path]
                            ?? (isActive && editorPathRef.current === tab.path ? editorContent : '')
                        return (
                          <div
                            key={tab.id}
                            className={cn(
                              'min-h-0 flex-1 flex-col overflow-hidden',
                              isActive ? 'flex' : 'hidden'
                            )}
                            data-file-tab-panel={tab.id}
                            aria-hidden={!isActive}
                          >
                            <MarkdownEditor
                              content={tabContent}
                              onChange={(markdown) => { if (!isViewingHistory) handleEditorChange(tab.path, markdown) }}
                              placeholder="Start writing..."
                              wikiLinks={wikiLinkConfig}
                              onImageUpload={handleImageUpload}
                              editorSessionKey={editorSessionByTabId[tab.id] ?? 0}
                              onHistoryHandlersChange={(handlers) => {
                                if (handlers) {
                                  fileHistoryHandlersRef.current.set(tab.id, handlers)
                                } else {
                                  fileHistoryHandlersRef.current.delete(tab.id)
                                }
                              }}
                              editable={!isViewingHistory}
                            />
                          </div>
                        )
                      })}
                    </div>
                    {versionHistoryPath && (
                      <VersionHistoryPanel
                        path={versionHistoryPath}
                        onClose={() => {
                          setVersionHistoryPath(null)
                          setViewingHistoricalVersion(null)
                        }}
                        onSelectVersion={(oid, content) => {
                          if (oid === null) {
                            setViewingHistoricalVersion(null)
                          } else {
                            setViewingHistoricalVersion({ oid, content })
                          }
                        }}
                        onRestore={async (oid) => {
                          try {
                            await window.ipc.invoke('knowledge:restore', {
                              path: versionHistoryPath.startsWith('knowledge/')
                                ? versionHistoryPath.slice('knowledge/'.length)
                                : versionHistoryPath,
                              oid,
                            })
                            // Reload file content
                            const result = await window.ipc.invoke('workspace:readFile', { path: versionHistoryPath })
                            handleEditorChange(versionHistoryPath, result.data)
                            setViewingHistoricalVersion(null)
                            setVersionHistoryPath(null)
                          } catch (err) {
                            console.error('Failed to restore version:', err)
                          }
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto p-4">
                    <pre className="text-sm font-mono text-foreground whitespace-pre-wrap">
                      {fileContent || 'Loading...'}
                    </pre>
                  </div>
                )
              ) : selectedTask ? (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <BackgroundTaskDetail
                    name={selectedTask.name}
                    description={selectedTask.description}
                    schedule={selectedTask.schedule}
                    enabled={selectedTask.enabled}
                    status={selectedTask.status}
                    nextRunAt={selectedTask.nextRunAt}
                    lastRunAt={selectedTask.lastRunAt}
                    lastError={selectedTask.lastError}
                    runCount={selectedTask.runCount}
                    onToggleEnabled={(enabled) => handleToggleBackgroundTask(selectedTask.name, enabled)}
                  />
                </div>
              ) : (
              <FileCardProvider onOpenKnowledgeFile={(path) => { navigateToFile(path) }}>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-0 flex-1">
                  {chatTabs.map((tab) => {
                    const isActive = tab.id === activeChatTabId
                    const tabState = getChatTabStateForRender(tab.id)
                    const tabHasConversation = tabState.conversation.length > 0 || tabState.currentAssistantMessage
                    const tabConversationContentClassName = tabHasConversation
                      ? "mx-auto w-full max-w-4xl pb-28"
                      : "mx-auto w-full max-w-4xl min-h-full items-center justify-center pb-0"
                    return (
                      <div
                        key={tab.id}
                        className={cn(
                          'min-h-0 h-full flex-col',
                          isActive
                            ? 'flex'
                            : 'pointer-events-none invisible absolute inset-0 flex'
                        )}
                        data-chat-tab-panel={tab.id}
                        aria-hidden={!isActive}
                      >
                        <Conversation className="relative flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                          <ScrollPositionPreserver />
                          <ConversationContent className={tabConversationContentClassName}>
                            {!tabHasConversation ? (
                              <ConversationEmptyState className="h-auto">
                                <div className="text-2xl font-semibold tracking-tight text-foreground/80 sm:text-3xl md:text-4xl">
                                  What are we working on?
                                </div>
                              </ConversationEmptyState>
                            ) : (
                              <>
                                {tabState.conversation.map(item => {
                                  const rendered = renderConversationItem(item, tab.id)
                                  if (isToolCall(item)) {
                                    const permRequest = tabState.allPermissionRequests.get(item.id)
                                    if (permRequest) {
                                      const response = tabState.permissionResponses.get(item.id) || null
                                      return (
                                        <React.Fragment key={item.id}>
                                          {rendered}
                                          <PermissionRequest
                                            toolCall={permRequest.toolCall}
                                            onApprove={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'approve')}
                                            onApproveSession={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'approve', 'session')}
                                            onApproveAlways={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'approve', 'always')}
                                            onDeny={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'deny')}
                                            isProcessing={isActive && isProcessing}
                                            response={response}
                                          />
                                        </React.Fragment>
                                      )
                                    }
                                  }
                                  return rendered
                                })}

                                {Array.from(tabState.pendingAskHumanRequests.values()).map((request) => (
                                  <AskHumanRequest
                                    key={request.toolCallId}
                                    query={request.query}
                                    onResponse={(response) => handleAskHumanResponse(request.toolCallId, request.subflow, response)}
                                    isProcessing={isActive && isProcessing}
                                  />
                                ))}

                                {tabState.currentAssistantMessage && (
                                  <Message from="assistant">
                                    <MessageContent>
                                      <MessageResponse components={streamdownComponents}>{tabState.currentAssistantMessage}</MessageResponse>
                                    </MessageContent>
                                  </Message>
                                )}

                                {isActive && isProcessing && !tabState.currentAssistantMessage && (
                                  <Message from="assistant">
                                    <MessageContent>
                                      <Shimmer duration={1}>Thinking...</Shimmer>
                                    </MessageContent>
                                  </Message>
                                )}
                              </>
                            )}
                          </ConversationContent>
                        </Conversation>
                      </div>
                    )
                  })}
                </div>

                <div className="sticky bottom-0 z-10 bg-background pb-12 pt-0 shadow-lg">
                  <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-t from-background to-transparent" />
                  <div className="mx-auto w-full max-w-4xl px-4">
                    {!hasConversation && (
                      <Suggestions onSelect={setPresetMessage} className="mb-3 justify-center" />
                    )}
                    {chatTabs.map((tab) => {
                      const isActive = tab.id === activeChatTabId
                      const tabState = getChatTabStateForRender(tab.id)
                      return (
                        <div
                          key={tab.id}
                          className={isActive ? 'block' : 'hidden'}
                          data-chat-input-panel={tab.id}
                          aria-hidden={!isActive}
                        >
                          <ChatInputWithMentions
                            knowledgeFiles={knowledgeFiles}
                            recentFiles={recentWikiFiles}
                            visibleFiles={visibleKnowledgeFiles}
                            onSubmit={handlePromptSubmit}
                            onStop={handleStop}
                            isProcessing={isActive && isProcessing}
                            isStopping={isActive && isStopping}
                            isActive={isActive}
                            presetMessage={isActive ? presetMessage : undefined}
                            onPresetMessageConsumed={isActive ? () => setPresetMessage(undefined) : undefined}
                            runId={tabState.runId}
                            initialDraft={chatDraftsRef.current.get(tab.id)}
                            onDraftChange={(text) => setChatDraftForTab(tab.id, text)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              </FileCardProvider>
              )}
        </>
      }
      auxiliaryPane={isRightPaneContext ? (
        <ChatSidebar
          defaultWidth={460}
          isOpen={isChatSidebarOpen}
          isMaximized={isRightPaneMaximized}
          chatTabs={chatTabs}
          activeChatTabId={activeChatTabId}
          getChatTabTitle={getChatTabTitle}
          isChatTabProcessing={isChatTabProcessing}
          onSwitchChatTab={switchChatTab}
          onCloseChatTab={closeChatTab}
          onNewChatTab={handleNewChatTabInSidebar}
          onOpenFullScreen={toggleRightPaneMaximize}
          conversation={conversation}
          currentAssistantMessage={currentAssistantMessage}
          chatTabStates={chatViewStateByTab}
          isProcessing={isProcessing}
          isStopping={isStopping}
          onStop={handleStop}
          onSubmit={handlePromptSubmit}
          knowledgeFiles={knowledgeFiles}
          recentFiles={recentWikiFiles}
          visibleFiles={visibleKnowledgeFiles}
          runId={runId}
          presetMessage={presetMessage}
          onPresetMessageConsumed={() => setPresetMessage(undefined)}
          getInitialDraft={(tabId) => chatDraftsRef.current.get(tabId)}
          onDraftChangeForTab={setChatDraftForTab}
          pendingAskHumanRequests={pendingAskHumanRequests}
          allPermissionRequests={allPermissionRequests}
          permissionResponses={permissionResponses}
          onPermissionResponse={handlePermissionResponse}
          onAskHumanResponse={handleAskHumanResponse}
          isToolOpenForTab={isToolOpenForTab}
          onToolOpenChangeForTab={setToolOpenForTab}
          onOpenKnowledgeFile={(path) => { navigateToFile(path) }}
          onActivate={() => setActiveShortcutPane('right')}
        />
      ) : null}
      dialogs={
        <SearchDialog
          open={isSearchOpen}
          onOpenChange={setIsSearchOpen}
          onSelectFile={navigateToFile}
          onSelectRun={(id) => { void navigateToView({ type: 'chat', runId: id }) }}
        />
      }
    />
  )
}

export default App
