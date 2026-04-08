import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import './App.css'
import { useWorkspaceTree } from './features/knowledge/hooks/use-workspace-tree'
import { useFileEditor } from './features/knowledge/hooks/use-file-editor'
import { useGraphView } from './features/knowledge/hooks/use-graph-view'
import { useVersionHistory } from './features/knowledge/hooks/use-version-history'
import {
  GRAPH_TAB_PATH,
  isGraphTabPath,
  viewStatesEqual,
  type ViewState,
} from './features/knowledge/types'
import { wikiLabel } from '@/lib/wiki-links'
import { getBaseName } from './features/knowledge/utils/wiki-logic'
import { WikiLink, FileCard } from './features/knowledge/components/streamdown-components'

import { CheckIcon, HistoryIcon, LoaderIcon, Maximize2, Minimize2, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownEditor } from './components/markdown-editor';
import { ChatSidebar } from './components/chat-sidebar';
import { ChatInputWithMentions } from './components/chat-input-with-mentions';
import { ChatMessageAttachments } from '@/components/chat-message-attachments'
import { GraphView } from '@/components/graph-view';
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

import { useTheme } from '@/contexts/theme-context'
import { RendererAppShell } from '@/components/app-shell/renderer-app-shell'
import { useChatRuntime } from '@/features/chat/use-chat-runtime'
import { appIpc } from '@/services/app-ipc'
import { runsIpc } from '@/services/runs-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'
import { knowledgeIpc } from '@/services/knowledge-ipc'

interface BackgroundTaskSchedule {
  type: 'cron' | 'window' | 'once'
  expression?: string
  cron?: string
  startTime?: string
  endTime?: string
  runAt?: string
}

interface DesktopWindowState {
  isMaximized: boolean
  isFullscreen: boolean
  platform: string
  supportsCustomTitlebar: boolean
  workspaceRoot?: string
}

interface AgentSchedule {
  name: string
  description?: string
  schedule: BackgroundTaskSchedule
  enabled: boolean
  status?: 'running' | 'scheduled' | 'finished' | 'failed' | 'triggered'
  nextRunAt?: string | null
  lastRunAt?: string | null
  lastError?: string | null
  runCount?: number
}

function App() {
  type ShortcutPane = 'left' | 'right'
  const { resolvedTheme } = useTheme()

  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true)
  const [isRightPaneMaximized, setIsRightPaneMaximized] = useState(false)
  const [activeShortcutPane, setActiveShortcutPane] = useState<ShortcutPane>('left')
  const [windowState, setWindowState] = useState<DesktopWindowState | null>(null)
  const isMac = windowState?.platform === 'darwin' || (typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'))
  const supportsCustomTitlebar = windowState?.supportsCustomTitlebar ?? !isMac
  const titlebarLogoSrc = resolvedTheme === 'dark' ? '/logo-white.png' : '/logo-black.png'

  // --- Search Dialog ---
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  
  const [backgroundTasks] = useState<AgentSchedule[]>([])
  const [selectedBackgroundTask, setSelectedBackgroundTask] = useState<string | null>(null)

  // --- Navigation & History ---
  const historyRef = useRef<{ back: ViewState[]; forward: ViewState[] }>({ back: [], forward: [] })
  const [viewHistory, setViewHistory] = useState<{ back: ViewState[]; forward: ViewState[] }>({ back: [], forward: [] })
  const currentViewRef = useRef<ViewState>({ type: 'chat', runId: null })

  const appendUnique = useCallback((stack: ViewState[], entry: ViewState) => {
    const last = stack[stack.length - 1]
    if (last && viewStatesEqual(last, entry)) return stack
    return [...stack, entry]
  }, [])

  const setViewHistoryFull = useCallback((next: { back: ViewState[]; forward: ViewState[] }) => {
    historyRef.current = next
    setViewHistory(next)
  }, [])

  const canNavigateBack = viewHistory.back.length > 0
  const canNavigateForward = viewHistory.forward.length > 0

  // Navigation Orchestration (Ref-based to avoid circular dependencies with hooks)
  const navigateRef = useRef<(view: ViewState, opts?: { pushHistory?: boolean }) => void>(() => {})

  const navigateToView = useCallback((view: ViewState, opts?: { pushHistory?: boolean }) => {
    navigateRef.current(view, opts)
  }, [])

  const navigateToFile = useCallback((path: string) => {
    navigateToView({ type: 'file', path })
  }, [navigateToView])

  const navigateToFileRefThunk = useCallback((path: string) => navigateRef.current({ type: 'file', path }), [])
  const navigateToViewRefThunk = useCallback((view: ViewState) => navigateRef.current(view), [])

  // --- Knowledge Domain Hooks ---
  const {
    tree,
    expandedPaths,
    refreshTree,
    toggleExpand,
    expandAll,
    collapseAll,
    knowledgeFiles,
    knowledgeFilePaths,
    visibleKnowledgeFiles,
  } = useWorkspaceTree()

  const {
    selectedPath,
    fileContent,
    editorContent,
    editorContentByPath,
    isSaving,
    lastSaved,
    handleEditorChange,
    fileTabs,
    activeFileTabId,
    editorSessionByTabId,
    fileHistoryHandlersRef,
    recentWikiFiles,
    knowledgeActions: baseKnowledgeActions,
    ensureFileTabForPath,
    ensureGraphFileTab,
    switchFileTab,
    closeFileTab,
    openWikiLink,
  } = useFileEditor({
    workspaceRoot: windowState?.workspaceRoot || '',
    navigateToFile: navigateToFileRefThunk,
    navigateToView: navigateToViewRefThunk,
    setHistory: setViewHistoryFull,
    historyRef,
    appendUnique,
  })

  const knowledgeActions = useMemo(() => ({
    ...baseKnowledgeActions,
    openGraph: ensureGraphFileTab,
    expandAll,
    collapseAll,
  }), [baseKnowledgeActions, ensureGraphFileTab, expandAll, collapseAll])

  const isGraphOpen = useMemo(() => {
    const activeTab = fileTabs.find(t => t.id === activeFileTabId)
    return activeTab?.path === GRAPH_TAB_PATH
  }, [fileTabs, activeFileTabId])

  const {
    graphData,
    graphStatus,
    graphError,
  } = useGraphView(isGraphOpen, knowledgeFilePaths)

  const {
    versionHistoryPath,
    setVersionHistoryPath,
    viewingHistoricalVersion,
    setViewingHistoricalVersion,
  } = useVersionHistory()


const handleWindowMinimize = useCallback(() => {
    void appIpc.minimizeWindow()
  }, [])

  const handleWindowToggleMaximize = useCallback(() => {
    void appIpc.toggleMaximizeWindow().then((nextState) => {
      setWindowState(nextState)
    })
  }, [])

  const handleWindowClose = useCallback(() => {
    void appIpc.closeWindow()
  }, [])

  useEffect(() => {
    let isMounted = true

    void appIpc.getWindowState().then((nextState) => {
      if (isMounted) {
        setWindowState(nextState)
      }
    }).catch((error) => {
      console.error('Failed to load window state', error)
    })

    const cleanup = appIpc.onWindowStateChanged((nextState) => {
      setWindowState(nextState)
    })

    return () => {
      isMounted = false
      cleanup()
    }
  }, [])

  // --- Chat State ---
  const chatDraftsRef = useRef<Map<string, string>>(new Map())
  const [activeChatTabId, setActiveChatTabId] = useState<string>('default-chat')
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([{ id: 'default-chat', runId: null }])
  const [chatViewStateByTab, setChatViewStateByTab] = useState<Record<string, ChatTabViewState>>({})
  const chatViewStateByTabRef = useRef<Record<string, ChatTabViewState>>({})
  const [toolOpenByTab, setToolOpenByTab] = useState<Record<string, Record<string, boolean>>>({})
  const [agentId] = useState<string>('copilot')
  const [presetMessage, setPresetMessage] = useState<string | undefined>(undefined)

  const isToolOpenForTab = useCallback((tabId: string, toolId: string): boolean => {
    const tabState = chatViewStateByTab[tabId]
    if (!tabState) return false
    const call = tabState.conversation.find(m => isToolCall(m) && m.id === toolId)
    if (!call || !isToolCall(call)) return false

    if (call.result) return false
    if (tabState.permissionResponses.has(toolId)) return false
    return toolOpenByTab[tabId]?.[toolId] ?? true
  }, [chatViewStateByTab, toolOpenByTab])

  const switchChatTab = useCallback((tabId: string) => {
    setActiveChatTabId(tabId)
  }, [])

  const closeChatTab = useCallback((tabId: string) => {
    setChatTabs((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((t) => t.id !== tabId)
      if (activeChatTabId === tabId) {
        setActiveChatTabId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeChatTabId])

  const handleNewChatTab = useCallback(() => {
    const id = `chat-${Date.now()}`
    setChatTabs((prev) => [...prev, { id, runId: null }])
    setActiveChatTabId(id)
  }, [])

  const setChatDraftForTab = useCallback((tabId: string, text: string) => {
    chatDraftsRef.current.set(tabId, text)
  }, [])

  const handleNewChat = useCallback(() => {
    if (activeFileTabId) {
      setIsChatSidebarOpen(true)
    }
    setChatTabs(prev => prev.map(t => t.id === activeChatTabId ? { ...t, runId: null } : t))
    void navigateToView({ type: 'chat', runId: null })
  }, [activeChatTabId, activeFileTabId, navigateToView])

  const handleNewChatTabInSidebar = useCallback(() => {
    const id = `chat-${Date.now()}`
    setChatTabs(prev => [...prev, { id, runId: null }])
    setActiveChatTabId(id)
  }, [])

  const toggleKnowledgePane = useCallback(() => {
    setIsChatSidebarOpen(!isChatSidebarOpen)
  }, [isChatSidebarOpen])

  const toggleRightPaneMaximize = useCallback(() => {
    setIsRightPaneMaximized(!isRightPaneMaximized)
  }, [isRightPaneMaximized])

  const handleImageUpload = useCallback(async (file: File) => {
    // TODO: implement image upload
    return `![${file.name}](pending-upload)`
  }, [])

  const handleVoiceNoteCreated = useCallback((path: string) => {
    refreshTree()
    navigateToView({ type: 'file', path })
  }, [refreshTree, navigateToView])

  const streamdownComponents = useMemo(() => ({
    WikiLink,
    FileCard,
    pre: MarkdownPreOverride,
  }), [])


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
    resetChatRuntime,
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

  const openChatInNewTab = useCallback((targetRunId?: string) => {
    const id = `chat-${Date.now()}`
    setChatTabs(prev => [...prev, { id, runId: targetRunId || null }])
    setActiveChatTabId(id)
    if (targetRunId) loadRun(targetRunId)
  }, [loadRun])

  const getChatTabTitle = useCallback((tab: ChatTab) => {
    if (!tab.runId) return 'New chat'
    return runs.find((run) => run.id === tab.runId)?.title || '(Untitled chat)'
  }, [runs])

  const getChatTabStateForRender = useCallback((tabId: string): ChatTabViewState => {
    if (tabId === activeChatTabId) return chatRuntimeSnapshot
    return chatViewStateByTab[tabId] || createEmptyChatTabViewState()
  }, [activeChatTabId, chatRuntimeSnapshot, chatViewStateByTab])

  const hasConversation = useMemo(() => {
    const state = getChatTabStateForRender(activeChatTabId)
    return state.conversation.length > 0 || !!state.currentAssistantMessage
  }, [activeChatTabId, getChatTabStateForRender])

  const isChatTabProcessing = useCallback((tab: ChatTab) => {
    return processingRunIds.has(tab.runId || '')
  }, [processingRunIds])

  const setToolOpenForTab = useCallback((tabId: string, toolId: string, open: boolean) => {
    setToolOpenByTab(prev => ({
      ...prev,
      [tabId]: { ...prev[tabId], [toolId]: open }
    }))
  }, [])

  const getFileTabTitle = useCallback((tab: FileTab) => {
    if (isGraphTabPath(tab.path)) return 'Graph'
    return getBaseName(tab.path)
  }, [])

  useEffect(() => {
    chatViewStateByTabRef.current = chatViewStateByTab
  }, [chatViewStateByTab])

  useEffect(() => {
    const timer = setTimeout(() => {
      setChatViewStateByTab((prev) => ({ ...prev, [activeChatTabId]: chatRuntimeSnapshot }))
    }, 0)
    return () => clearTimeout(timer)
  }, [
    activeChatTabId,
    chatRuntimeSnapshot,
  ])

  const [expandedFrom, setExpandedFrom] = useState<ViewState | null>(null)

  // --- Navigation Implementation ---
  const navigate = useCallback((view: ViewState, { pushHistory = true } = {}) => {
    const from = currentViewRef.current
    if (viewStatesEqual(from, view)) return

    if (pushHistory) {
      setViewHistoryFull({
        back: appendUnique(historyRef.current.back, from),
        forward: [],
      })
    }

    currentViewRef.current = view

    // Sidebar interaction logic
    if (view.type === 'file' || view.type === 'graph') {
      ensureFileTabForPath(view.type === 'graph' ? GRAPH_TAB_PATH : view.path)
    } else if (view.type === 'chat') {
      if (view.runId) {
        const existingTab = chatTabs.find((t) => t.runId === view.runId)
        if (existingTab) {
          setActiveChatTabId(existingTab.id)
        } else {
          setChatTabs((prev) => prev.map((t) => (t.id === activeChatTabId ? { ...t, runId: view.runId || null } : t)))
        }
        loadRun(view.runId)
      } else {
        setChatTabs((prev) => prev.map((t) => (t.id === activeChatTabId ? { ...t, runId: null } : t)))
        resetChatRuntime()
      }
    } else if (view.type === 'task') {
      setSelectedBackgroundTask(view.name)
    }
  }, [appendUnique, chatTabs, activeChatTabId, setViewHistoryFull, ensureFileTabForPath, loadRun, resetChatRuntime])

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  const navigateBack = useCallback(() => {
    const backStack = [...historyRef.current.back]
    const next = backStack.pop()
    if (!next) return

    const from = currentViewRef.current
    setViewHistoryFull({
      back: backStack,
      forward: [from, ...historyRef.current.forward],
    })
    navigate(next, { pushHistory: false })
  }, [navigate, setViewHistoryFull])

  const navigateForward = useCallback(() => {
    const forwardStack = [...historyRef.current.forward]
    const next = forwardStack.shift()
    if (!next) return

    const from = currentViewRef.current
    setViewHistoryFull({
      back: appendUnique(historyRef.current.back, from),
      forward: forwardStack,
    })
    navigate(next, { pushHistory: false })
  }, [navigate, setViewHistoryFull, appendUnique])


  const handleCloseFullScreenChat = useCallback(() => {
    if (expandedFrom) {
      navigate(expandedFrom)
    }
    setExpandedFrom(null)
  }, [expandedFrom, navigate])

  const handleToggleBackgroundTask = useCallback(async (name: string, enabled: boolean) => {
    console.log('Toggle task:', name, enabled)
    // TODO: implement agent schedule update via 'agent-schedule:updateAgent'
  }, [])


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
  }, [activeFileTabId, isMac, selectedPath, fileHistoryHandlersRef])

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

  const selectedTask = selectedBackgroundTask
    ? backgroundTasks.find(t => t.name === selectedBackgroundTask)
    : null
  const isRightPaneContext = Boolean(selectedPath || isGraphOpen)
  const isRightPaneOnlyMode = isRightPaneContext && isChatSidebarOpen && isRightPaneMaximized
  const shouldCollapseLeftPane = isRightPaneOnlyMode
  const openMarkdownTabs = useMemo(() => {
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
                    await runsIpc.delete(runIdToDelete)
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
                            ?? (isActive && selectedPath === tab.path ? editorContent : '')
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
                              wikiLinks={{
                                files: knowledgeFilePaths,
                                recent: recentWikiFiles,
                                onOpen: (path) => navigateToView({ type: 'file', path }),
                                onCreate: (path) => openWikiLink(path),
                              }}
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
                            const restorePath = versionHistoryPath.startsWith('knowledge/')
                              ? versionHistoryPath.slice('knowledge/'.length)
                              : versionHistoryPath
                            await knowledgeIpc.restore(restorePath, oid)
                            // Reload file content
                            const result = await workspaceIpc.readFile(versionHistoryPath)
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
                                        <div key={item.id} className="contents">
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
                                        </div>
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
                            initialDraft={undefined} // Handled by persistence now
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
