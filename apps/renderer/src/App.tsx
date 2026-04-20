import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import './App.css'
import { useWorkspaceTree } from './features/memory/hooks/use-workspace-tree'
import { useFileEditor } from './features/memory/hooks/use-file-editor'
import { useGraphView } from './features/memory/hooks/use-graph-view'
import { useVersionHistory } from './features/memory/hooks/use-version-history'
import {
  GRAPH_TAB_PATH,
  isGraphTabPath,
  viewStatesEqual,
  type TreeNode,
  type ViewState,
} from './features/memory/types'
import { getBaseName } from './features/memory/utils/wiki-logic'

import { CheckIcon, HistoryIcon, LoaderIcon, Maximize2, Minimize2, RotateCcw, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownEditor } from './components/markdown-editor';
import { ChatSidebar } from './components/chat-sidebar';
import { GraphView } from '@/components/graph-view';
import { SidebarContentPanel } from '@/components/sidebar-content';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SearchDialog } from '@/components/search-dialog'
import { BackgroundTaskDetail } from '@/components/background-task-detail'
import { VersionHistoryPanel } from '@/components/version-history-panel'
import { TabBar, type ChatTab, type FileTab } from '@/components/tab-bar'
import {
  type ChatTabViewState,
  createEmptyChatTabViewState,
} from '@/lib/chat-conversation'

import { useTheme } from '@/contexts/theme-context'
import { RendererAppShell } from '@/components/app-shell/renderer-app-shell'
import { useChatRuntime } from '@/features/chat/use-chat-runtime'
import { runsIpc } from '@/services/runs-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'
import { memoryIpc } from '@/services/memory-ipc'
import { appIpc } from '@/services/app-ipc'
import { useDesktopWindow } from '@/features/app/use-desktop-window'
import { useAppKeyboardShortcuts } from '@/features/app/use-app-keyboard-shortcuts'
import { useBackgroundTasks } from '@/features/background-tasks/use-background-tasks'
import { ChatMainPanel } from '@/features/chat/components/chat-main-panel'
import { splitFrontmatter, joinFrontmatter } from '@/lib/frontmatter'
import { getMemoryCollectionMeta, isMemoryCollectionPath } from '@/features/memory/utils/collections'
import { MemoryCollectionView } from '@/features/memory/components/memory-collection-view'

const CHAT_NOTIFICATIONS_STORAGE_KEY = 'flazz:chat-notifications-enabled'

function findTreeNode(nodes: TreeNode[], targetPath: string | null): TreeNode | null {
  if (!targetPath) return null
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children?.length) {
      const match = findTreeNode(node.children, targetPath)
      if (match) return match
    }
  }
  return null
}

function App() {
  type ShortcutPane = 'left' | 'right'
  const { resolvedTheme } = useTheme()

  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightPaneMaximized, setIsRightPaneMaximized] = useState(false)
  const [activeShortcutPane, setActiveShortcutPane] = useState<ShortcutPane>('left')
  const {
    windowState,
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
  } = useDesktopWindow()
  const isMac = windowState?.platform === 'darwin' || (typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'))
  const supportsCustomTitlebar = windowState?.supportsCustomTitlebar ?? !isMac
  const titlebarLogoSrc = resolvedTheme === 'dark' ? '/logo-white.png' : '/logo-black.png'

  // --- Search Dialog ---
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const {
    backgroundTasks,
    selectedBackgroundTask,
    setSelectedBackgroundTask,
    handleToggleBackgroundTask,
  } = useBackgroundTasks()
  const [pendingFolderRenamePath, setPendingFolderRenamePath] = useState<string | null>(null)

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
  const navigateRef = useRef<(view: ViewState, opts?: { pushHistory?: boolean; newTab?: boolean }) => void>(() => {})

  const navigateToView = useCallback((view: ViewState, opts?: { pushHistory?: boolean; newTab?: boolean }) => {
    navigateRef.current(view, opts)
  }, [])

  const navigateToFile = useCallback((path: string, opts?: { newTab?: boolean }) => {
    navigateToView({ type: 'file', path }, opts)
  }, [navigateToView])

  const navigateToFileRefThunk = useCallback((path: string, opts?: { newTab?: boolean }) => navigateRef.current({ type: 'file', path }, opts), [])
  const navigateToViewRefThunk = useCallback((view: ViewState, opts?: { newTab?: boolean }) => navigateRef.current(view, opts), [])

  // --- Memory Domain Hooks ---
  const {
    tree,
    expandedPaths,
    refreshTree,
    expandPath,
    expandAncestors,
    expandAll,
    collapseAll,
    memoryFiles,
    memoryFilePaths,
    visibleMemoryFiles,
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
    memoryActions: baseMemoryActions,
    ensureFileTabForPath,
    ensureGraphFileTab,
    switchFileTab,
    closeFileTab,
    openWikiLink,
    reloadFileFromDisk,
  } = useFileEditor({
    workspaceRoot: windowState?.workspaceRoot || '',
    navigateToFile: navigateToFileRefThunk,
    navigateToView: navigateToViewRefThunk,
    setHistory: setViewHistoryFull,
    historyRef,
    appendUnique,
  })

  const memoryActions = useMemo(() => ({
    ...baseMemoryActions,
    createNote: async (parentPath?: string) => {
      const result = await baseMemoryActions.createNote(parentPath)
      await refreshTree()
      return result
    },
    createFolder: async (parentPath?: string) => {
      const createdPath = await baseMemoryActions.createFolder(parentPath)
      if (!createdPath) return createdPath
      const parentDir = createdPath.split('/').slice(0, -1).join('/')
      if (parentDir) expandPath(parentDir)
      await refreshTree()
      setPendingFolderRenamePath(createdPath)
      return createdPath
    },
    rename: async (path: string, newName: string, isDir: boolean) => {
      const result = await baseMemoryActions.rename(path, newName, isDir)
      await refreshTree()
      return result
    },
    remove: async (path: string) => {
      const result = await baseMemoryActions.remove(path)
      await refreshTree()
      if (pendingFolderRenamePath === path) {
        setPendingFolderRenamePath(null)
      }
      return result
    },
    openGraph: ensureGraphFileTab,
    expandAll,
    collapseAll,
  }), [baseMemoryActions, collapseAll, ensureGraphFileTab, expandAll, expandPath, pendingFolderRenamePath, refreshTree])

  const handleSelectMemoryItem = useCallback((path: string, kind: "file" | "dir") => {
    if (kind === 'dir') {
      navigateToFile(path)
      return
    }
    navigateToFile(path)
  }, [navigateToFile])

  const isGraphOpen = useMemo(() => {
    const activeTab = fileTabs.find(t => t.id === activeFileTabId)
    return activeTab?.path === GRAPH_TAB_PATH
  }, [fileTabs, activeFileTabId])

  const {
    graphData,
    graphStatus,
    graphError,
  } = useGraphView(isGraphOpen, memoryFilePaths)

  const {
    versionHistoryPath,
    setVersionHistoryPath,
    viewingHistoricalVersion,
    setViewingHistoricalVersion,
  } = useVersionHistory()


  // --- Chat State ---
  const chatDraftsRef = useRef<Map<string, string>>(new Map())
  const [activeChatTabId, setActiveChatTabId] = useState<string>('default-chat')
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([{ id: 'default-chat', runId: null }])
  const [chatViewStateByTab, setChatViewStateByTab] = useState<Record<string, ChatTabViewState>>({})
  const [toolOpenByTab, setToolOpenByTab] = useState<Record<string, Record<string, boolean>>>({})
  const activeChatTabIdRef = useRef('default-chat')
  const chatRuntimeSnapshotRef = useRef<ChatTabViewState>(createEmptyChatTabViewState())
  const [agentId] = useState<string>('copilot')
  const [presetMessage, setPresetMessage] = useState<string | undefined>(undefined)
  const [isWindowFocusedForNotifications, setIsWindowFocusedForNotifications] = useState<boolean>(() => (
    typeof document !== 'undefined' ? document.hasFocus() : true
  ))
  const [isDocumentVisibleForNotifications, setIsDocumentVisibleForNotifications] = useState<boolean>(() => (
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  ))
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const raw = window.localStorage.getItem(CHAT_NOTIFICATIONS_STORAGE_KEY)
    return raw == null ? true : raw === 'true'
  })

  const isToolOpenForTab = useCallback((tabId: string, toolId: string): boolean => {
    return toolOpenByTab[tabId]?.[toolId] ?? false
  }, [toolOpenByTab])

  const clearToolOpenForTab = useCallback((tabId: string) => {
    setToolOpenByTab((prev) => {
      if (!prev[tabId]) return prev
      const next = { ...prev }
      delete next[tabId]
      return next
    })
  }, [])

  const setChatDraftForTab = useCallback((tabId: string, text: string) => {
    chatDraftsRef.current.set(tabId, text)
  }, [])

  const handleNewChat = useCallback(() => {
      if (activeFileTabId) {
        setIsChatSidebarOpen(true)
      }
      setChatTabs(prev => prev.map(t => t.id === activeChatTabId ? { ...t, runId: null } : t))
      clearToolOpenForTab(activeChatTabId)
      void navigateToView({ type: 'chat', runId: null })
    }, [activeChatTabId, activeFileTabId, clearToolOpenForTab, navigateToView])

  const toggleMemoryPane = useCallback(() => {
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

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        void refreshTree()
        refreshTimer = null
      }, 120)
    }

    const cleanup = workspaceIpc.onDidChange((event) => {
      if (event.type === 'bulkChanged') {
        const paths = event.paths ?? []
        if (paths.some((path) => path === 'memory' || path.startsWith('memory/'))) {
          for (const path of paths) {
            if (path.startsWith('memory/Knowledge/')) {
              expandAncestors(path)
            }
          }
          scheduleRefresh()
        }
        return
      }
      const changedPath = 'path' in event ? event.path : undefined
      if (changedPath && (changedPath === 'memory' || changedPath.startsWith('memory/'))) {
        if (changedPath.startsWith('memory/Knowledge/')) {
          expandAncestors(changedPath)
        }
        scheduleRefresh()
      }
    })

    return () => {
      cleanup()
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [expandAncestors, refreshTree])

  const {
    runs,
    loadRuns,
    runId,
    conversation,
    currentAssistantMessage,
    modelUsage,
    isProcessing,
    isStopping,
    processingRunIds,
    pendingAskHumanRequests,
    allPermissionRequests,
    permissionResponses,
    chatRuntimeSnapshot,
    loadRun,
    restoreChatRuntime,
    resetChatRuntime,
    handlePromptSubmit,
    handleStop,
    handlePermissionResponse,
    handleAskHumanResponse,
  } = useChatRuntime({
    agentId,
    onActiveTabRunIdChange: (nextRunId) => {
      setChatTabs((prev) => prev.map((tab) => (
        tab.id === activeChatTabIdRef.current
          ? { ...tab, runId: nextRunId }
          : tab
      )))
    },
  })

  useEffect(() => {
    activeChatTabIdRef.current = activeChatTabId
  }, [activeChatTabId])

  useEffect(() => {
    chatRuntimeSnapshotRef.current = chatRuntimeSnapshot
  }, [chatRuntimeSnapshot])

  const persistChatTabState = useCallback((tabId: string, snapshot: ChatTabViewState) => {
    setChatViewStateByTab((prev) => ({
      ...prev,
      [tabId]: snapshot,
    }))
  }, [])

  const activateChatTab = useCallback((tabId: string, fallbackRunId: string | null) => {
    const currentTabId = activeChatTabIdRef.current
    if (currentTabId !== tabId) {
      persistChatTabState(currentTabId, chatRuntimeSnapshot)
    }

    clearToolOpenForTab(tabId)
    setActiveChatTabId(tabId)

    const savedState = chatViewStateByTab[tabId]
    if (savedState && restoreChatRuntime(savedState, fallbackRunId)) {
      return
    }

    if (fallbackRunId) {
      void loadRun(fallbackRunId)
      return
    }

    resetChatRuntime()
  }, [chatRuntimeSnapshot, chatViewStateByTab, clearToolOpenForTab, loadRun, persistChatTabState, resetChatRuntime, restoreChatRuntime])

  const switchChatTab = useCallback((tabId: string) => {
    if (tabId === activeChatTabIdRef.current) return
    const nextTab = chatTabs.find((tab) => tab.id === tabId)
    if (!nextTab) return
    activateChatTab(tabId, nextTab.runId)
  }, [activateChatTab, chatTabs])

  const closeChatTab = useCallback((tabId: string) => {
    if (chatTabs.length <= 1) return

    const nextTabs = chatTabs.filter((tab) => tab.id !== tabId)
    setChatTabs(nextTabs)

    if (activeChatTabIdRef.current !== tabId) {
      return
    }

    const replacementTab = nextTabs[nextTabs.length - 1]
    if (!replacementTab) return
    activateChatTab(replacementTab.id, replacementTab.runId)
  }, [activateChatTab, chatTabs])

  const handleNewChatTab = useCallback(() => {
    const id = `chat-${Date.now()}`
    setChatTabs((prev) => [...prev, { id, runId: null }])
    activateChatTab(id, null)
  }, [activateChatTab])

  const handleNewChatTabInSidebar = useCallback(() => {
    const id = `chat-${Date.now()}`
    setChatTabs((prev) => [...prev, { id, runId: null }])
    activateChatTab(id, null)
  }, [activateChatTab])

  const openChatInNewTab = useCallback((targetRunId?: string) => {
    const id = `chat-${Date.now()}`
    setChatTabs((prev) => [...prev, { id, runId: targetRunId || null }])
    activateChatTab(id, targetRunId || null)
  }, [activateChatTab])

  const getChatTabTitle = useCallback((tab: ChatTab) => {
    if (!tab.runId) return 'New chat'
    return runs.find((run) => run.id === tab.runId)?.title || '(Untitled chat)'
  }, [runs])

  const getChatTabStateForRender = useCallback((tabId: string): ChatTabViewState => {
    if (tabId === activeChatTabId) return chatRuntimeSnapshot
    return chatViewStateByTab[tabId] || createEmptyChatTabViewState()
  }, [activeChatTabId, chatRuntimeSnapshot, chatViewStateByTab])

  const activeChatTabState = useMemo(() => (
    getChatTabStateForRender(activeChatTabId)
  ), [activeChatTabId, getChatTabStateForRender])

  const hasConversation = useMemo(() => {
    return activeChatTabState.conversation.length > 0 || !!activeChatTabState.currentAssistantMessage
  }, [activeChatTabState])

  useEffect(() => {
    const handleFocus = () => setIsWindowFocusedForNotifications(true)
    const handleBlur = () => setIsWindowFocusedForNotifications(false)
    const handleVisibility = () => setIsDocumentVisibleForNotifications(document.visibilityState === 'visible')
    const handleNotificationPreferenceChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail
      if (typeof detail?.enabled === 'boolean') {
        setChatNotificationsEnabled(detail.enabled)
        return
      }
      const raw = window.localStorage.getItem(CHAT_NOTIFICATIONS_STORAGE_KEY)
      setChatNotificationsEnabled(raw == null ? true : raw === 'true')
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('flazz:chat-notifications-changed', handleNotificationPreferenceChanged as EventListener)

    handleFocus()
    handleVisibility()
    handleNotificationPreferenceChanged(new CustomEvent('flazz:chat-notifications-changed'))

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('flazz:chat-notifications-changed', handleNotificationPreferenceChanged as EventListener)
    }
  }, [])

  useEffect(() => {
    void appIpc.updateAttentionState({
      activeRunId: activeChatTabState.runId,
      isWindowFocused: isWindowFocusedForNotifications,
      isDocumentVisible: isDocumentVisibleForNotifications,
      notificationsEnabled: chatNotificationsEnabled,
    })
  }, [
    activeChatTabState.runId,
    chatNotificationsEnabled,
    isDocumentVisibleForNotifications,
    isWindowFocusedForNotifications,
  ])

  useEffect(() => {
    const cleanup = appIpc.onNotificationActivated(({ runId: targetRunId }) => {
      if (!targetRunId) return
      void navigateToView({ type: 'chat', runId: targetRunId }, { newTab: true })
    })
    return cleanup
  }, [navigateToView])

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

  const [expandedFrom, setExpandedFrom] = useState<ViewState | null>(null)

  // --- Navigation Implementation ---
  const navigate = useCallback((view: ViewState, { pushHistory = true, newTab = false } = {}) => {
    const from = currentViewRef.current
    if (viewStatesEqual(from, view) && !newTab) return

    if (pushHistory) {
      setViewHistoryFull({
        back: appendUnique(historyRef.current.back, from),
        forward: [],
      })
    }

    currentViewRef.current = view

    // Sidebar interaction logic
      if (view.type === 'file' || view.type === 'graph') {
        ensureFileTabForPath(view.type === 'graph' ? GRAPH_TAB_PATH : view.path, { newTab })
      } else if (view.type === 'chat') {
        if (view.runId) {
          const existingTab = chatTabs.find((t) => t.runId === view.runId)
        if (existingTab) {
          setActiveChatTabId(existingTab.id)
          } else {
            setChatTabs((prev) => prev.map((t) => (t.id === activeChatTabId ? { ...t, runId: view.runId || null } : t)))
          }
          clearToolOpenForTab(activeChatTabId)
          loadRun(view.runId)
        } else {
          setChatTabs((prev) => prev.map((t) => (t.id === activeChatTabId ? { ...t, runId: null } : t)))
          clearToolOpenForTab(activeChatTabId)
          resetChatRuntime()
        }
      } else if (view.type === 'task') {
        setSelectedBackgroundTask(view.name)
      }
    }, [appendUnique, chatTabs, activeChatTabId, clearToolOpenForTab, setViewHistoryFull, ensureFileTabForPath, loadRun, resetChatRuntime])

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

  useAppKeyboardShortcuts({
    isMac,
    setIsSearchOpen,
    selectedPath,
    isGraphOpen,
    activeFileTabId,
    fileHistoryHandlersRef,
    isChatSidebarOpen,
    isRightPaneMaximized,
    activeShortcutPane,
    fileTabs,
    chatTabs,
    activeChatTabId,
    closeFileTab,
    closeChatTab,
    switchFileTab,
    switchChatTab,
  })



  const selectedTask = selectedBackgroundTask
    ? backgroundTasks.find(t => t.name === selectedBackgroundTask)
    : null
  const selectedTreeNode = useMemo(() => findTreeNode(tree, selectedPath), [tree, selectedPath])
  const selectedCollection = getMemoryCollectionMeta(selectedPath)
  const isCollectionOpen = Boolean(selectedTreeNode?.kind === 'dir' && isMemoryCollectionPath(selectedPath))
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

  const sideChatPane = (
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
      modelUsage={modelUsage}
      modelUsageUpdatedAt={activeChatTabState.modelUsageUpdatedAt}
      chatTabStates={chatViewStateByTab}
      isProcessing={isProcessing}
      isStopping={isStopping}
      onStop={handleStop}
      onSubmit={handlePromptSubmit}
      memoryFiles={memoryFiles}
      recentFiles={recentWikiFiles}
      visibleFiles={visibleMemoryFiles}
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
      onOpenMemoryFile={(path) => { navigateToFile(path) }}
      onActivate={() => setActiveShortcutPane('right')}
    />
  )

  return (
    <RendererAppShell
      supportsCustomTitlebar={supportsCustomTitlebar}
      isSidebarVisible={isLeftSidebarOpen}
      onSidebarVisibilityChange={setIsLeftSidebarOpen}
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
      onActivatePrimaryPane={() => setActiveShortcutPane('left')}
      leftSidebar={
        <SidebarContentPanel
          tree={tree}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelectFile={handleSelectMemoryItem}
          memoryActions={memoryActions}
          pendingFolderRenamePath={pendingFolderRenamePath}
          onPendingFolderRenameHandled={setPendingFolderRenamePath}
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

              const existingTab = chatTabs.find(t => t.runId === runIdToLoad)
              if (existingTab) {
                switchChatTab(existingTab.id)
                return
              }

                if (selectedPath || isGraphOpen) {
                  setChatTabs(prev => prev.map(t => t.id === activeChatTabId ? { ...t, runId: runIdToLoad } : t))
                  clearToolOpenForTab(activeChatTabId)
                  loadRun(runIdToLoad)
                  return
                }

              setChatTabs(prev => prev.map(t => t.id === activeChatTabId ? { ...t, runId: runIdToLoad } : t))
              void navigateToView({ type: 'chat', runId: runIdToLoad })
            },
            onOpenInNewTab: (targetRunId) => {
              openChatInNewTab(targetRunId)
            },
            onDeleteRun: async (runIdToDelete) => {
              try {
                await runsIpc.delete(runIdToDelete)
                const tabForRun = chatTabs.find(t => t.runId === runIdToDelete)
                if (tabForRun) {
                  if (chatTabs.length > 1) {
                    closeChatTab(tabForRun.id)
                  } else {
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
          {isCollectionOpen ? (
                  <div className="flex min-w-0 items-center gap-3 px-1">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{selectedCollection?.label}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {selectedCollection?.description}
                      </div>
                    </div>
                  </div>
                ) : (selectedPath || isGraphOpen) && fileTabs.length >= 1 ? (
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
                {selectedPath && !isCollectionOpen && (
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
                {selectedPath && !isCollectionOpen && selectedPath.startsWith('memory/') && selectedPath.endsWith('.md') && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          void reloadFileFromDisk(selectedPath)
                        }}
                        className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors self-center shrink-0"
                        aria-label="Reload from disk"
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Reload from disk</TooltipContent>
                  </Tooltip>
                )}
                {selectedPath && !isCollectionOpen && selectedPath.startsWith('memory/') && selectedPath.endsWith('.md') && (
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
                        onClick={toggleMemoryPane}
                        className="titlebar-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors -mr-1 self-center shrink-0"
                        aria-label={isChatSidebarOpen ? "Maximize memory view" : "Restore two-pane view"}
                      >
                        {isChatSidebarOpen ? <Maximize2 className="size-5" /> : <Minimize2 className="size-5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {isChatSidebarOpen ? "Maximize memory view" : "Restore two-pane view"}
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
                isCollectionOpen ? (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <MemoryCollectionView
                      collectionPath={selectedPath}
                      tree={tree}
                      onSelectNote={navigateToFile}
                      onCreateNote={(parentPath) => {
                        void memoryActions.createNote(parentPath)
                      }}
                    />
                  </div>
                ) : selectedPath.endsWith('.md') ? (
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
                        const { raw: tabFrontmatter, body: tabBody } = splitFrontmatter(tabContent)
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
                              content={tabBody}
                              frontmatter={tabFrontmatter}
                              onChange={(markdown) => {
                                if (!isViewingHistory) {
                                  const currentContent = editorContentByPath[tab.path]
                                    ?? (isActive && selectedPath === tab.path ? editorContent : '')
                                  const { raw: currentFrontmatter } = splitFrontmatter(currentContent)
                                  handleEditorChange(tab.path, joinFrontmatter(currentFrontmatter, markdown))
                                }
                              }}
                              onFrontmatterChange={(nextRaw) => {
                                if (!isViewingHistory) {
                                  const currentContent = editorContentByPath[tab.path]
                                    ?? (isActive && selectedPath === tab.path ? editorContent : '')
                                  const { body: currentBody } = splitFrontmatter(currentContent)
                                  handleEditorChange(tab.path, joinFrontmatter(nextRaw, currentBody))
                                }
                              }}
                              placeholder="Start writing..."
                              wikiLinks={{
                                files: memoryFilePaths,
                                recent: recentWikiFiles,
                                onOpen: (path) => {
                                  void openWikiLink(path)
                                },
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
                            const restorePath = versionHistoryPath.startsWith('memory/')
                              ? versionHistoryPath.slice('memory/'.length)
                              : versionHistoryPath
                            await memoryIpc.restore(restorePath, oid)
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
              <ChatMainPanel
                chatTabs={chatTabs}
                activeChatTabId={activeChatTabId}
                getChatTabStateForRender={getChatTabStateForRender}
                hasConversation={hasConversation}
                isProcessing={isProcessing}
                isStopping={isStopping}
                handleStop={handleStop}
                handlePromptSubmit={handlePromptSubmit}
                memoryFiles={memoryFiles}
                recentWikiFiles={recentWikiFiles}
                visibleMemoryFiles={visibleMemoryFiles}
                presetMessage={presetMessage}
                onSelectSuggestion={setPresetMessage}
                onPresetMessageConsumed={() => setPresetMessage(undefined)}
                setChatDraftForTab={setChatDraftForTab}
                isToolOpenForTab={isToolOpenForTab}
                setToolOpenForTab={setToolOpenForTab}
                handlePermissionResponse={handlePermissionResponse}
                handleAskHumanResponse={handleAskHumanResponse}
                navigateToFile={navigateToFile}
              />
              )}
        </>
      }
      auxiliaryPane={isRightPaneContext ? sideChatPane : null}
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
