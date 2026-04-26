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
  type ViewState,
} from './features/memory/types'
import { getBaseName } from './features/memory/utils/wiki-logic'

import { FileText, Network, Presentation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchDialog } from '@/components/search-dialog'
import { type FileTab } from '@/components/tab-bar'
import {
  type ChatTabViewState,
  createEmptyChatTabViewState,
} from '@/lib/chat-conversation'

import { useTheme } from '@/contexts/theme-context'
import { RendererAppShell } from '@/components/app-shell/renderer-app-shell'
import { useChatRuntime } from '@/features/chat/use-chat-runtime'
import { workspaceIpc } from '@/services/workspace-ipc'
import { useDesktopWindow } from '@/features/app/use-desktop-window'
import { useAppKeyboardShortcuts } from '@/features/app/use-app-keyboard-shortcuts'
import { useBackgroundTasks } from '@/features/background-tasks/use-background-tasks'
import { shellIpc } from '@/services/shell-ipc'
import { toast } from 'sonner'
import { AppChatSidebarPane } from '@/features/app/components/app-chat-sidebar-pane'
import { WorkspaceSidebarPane } from '@/features/app/components/workspace-sidebar-pane'
import { AppHeaderContent } from '@/features/app/components/app-header-content'
import { AppMainContent } from '@/features/app/components/app-main-content'
import { AppTitlebarLeadingContent } from '@/features/app/components/app-titlebar-leading-content'
import { useChatTabsOrchestrator } from '@/features/app/hooks/use-chat-tabs-orchestrator'
import { useChatNotificationOrchestrator } from '@/features/app/hooks/use-chat-notification-orchestrator'
import { useNavigationHistory } from '@/features/app/hooks/use-navigation-history'
import { useWorkspacePaneState } from '@/features/app/hooks/use-workspace-pane-state'
import { useAppMainContentProps } from '@/features/app/hooks/use-app-main-content-props'
import { useChatSidebarProps } from '@/features/app/hooks/use-chat-sidebar-props'
import { useWorkspaceSidebarProps } from '@/features/app/hooks/use-workspace-sidebar-props'
import { useAppHeaderProps } from '@/features/app/hooks/use-app-header-props'
import { uploadImageToWorkspace } from '@/features/memory/lib/workspace-image-upload'

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
  const {
    historyRef,
    currentViewRef,
    appendUnique,
    setViewHistoryFull,
    canNavigateBack,
    canNavigateForward,
    navigateToView,
    navigateToFile,
    navigateToFileRefThunk,
    navigateToViewRefThunk,
    setNavigator,
    navigateBack,
    navigateForward,
  } = useNavigationHistory()

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

  const {
    memoryActions,
    handleSelectMemoryItem,
    selectedCollection,
    isCollectionOpen,
    openMarkdownTabs,
  } = useWorkspacePaneState({
    tree,
    selectedPath,
    fileTabs,
    baseMemoryActions,
    refreshTree,
    expandPath,
    expandAll,
    collapseAll,
    ensureGraphFileTab,
    pendingFolderRenamePath,
    setPendingFolderRenamePath,
    navigateToFile,
  })

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
  const chatRuntimeSnapshotRef = useRef<ChatTabViewState>(createEmptyChatTabViewState())
  const activeTabRunIdChangeRef = useRef<(runId: string | null) => void>(() => {})
  const [agentId] = useState<string>('copilot')
  const [presetMessage, setPresetMessage] = useState<string | undefined>(undefined)

  const toggleMemoryPane = useCallback(() => {
    setIsChatSidebarOpen(!isChatSidebarOpen)
  }, [isChatSidebarOpen])

  const toggleRightPaneMaximize = useCallback(() => {
    setIsRightPaneMaximized(!isRightPaneMaximized)
  }, [isRightPaneMaximized])

  const handleImageUpload = useCallback(async (file: File) => {
    const workspaceRoot = windowState?.workspaceRoot
    if (!workspaceRoot) {
      toast.error('Workspace is not ready yet. Try again in a moment.')
      return null
    }

    try {
      return await uploadImageToWorkspace(file, workspaceRoot)
    } catch (error) {
      console.error('Failed to upload image into workspace', error)
      toast.error(`Failed to upload image: ${file.name}`)
      return null
    }
  }, [windowState?.workspaceRoot])

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
        const paths: string[] = Array.isArray(event.paths) ? event.paths : []
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
      activeTabRunIdChangeRef.current(nextRunId)
    },
  })

  useEffect(() => {
    chatRuntimeSnapshotRef.current = chatRuntimeSnapshot
  }, [chatRuntimeSnapshot])

  const {
    chatDraftsRef,
    activeChatTabId,
    chatTabs,
    chatViewStateByTab,
    activeChatTabState,
    hasConversation,
    isToolOpenForTab,
    setToolOpenForTab,
    clearToolOpenForTab,
    setChatDraftForTab,
    switchChatTab,
    closeChatTab,
    openNewChatTab,
    openChatInNewTab,
    replaceActiveTabRunId,
    replaceTabRunId,
    getChatTabTitle,
    getChatTabStateForRender,
    isChatTabProcessing,
    findTabByRunId,
  } = useChatTabsOrchestrator({
    runs,
    processingRunIds,
    chatRuntimeSnapshot,
    loadRun,
    restoreChatRuntime,
    resetChatRuntime,
  })

  useEffect(() => {
    activeTabRunIdChangeRef.current = replaceActiveTabRunId
  }, [replaceActiveTabRunId])

  const handleNewChat = useCallback(() => {
      if (activeFileTabId) {
        setIsChatSidebarOpen(true)
      }
      replaceTabRunId(activeChatTabId, null)
      clearToolOpenForTab(activeChatTabId)
      void navigateToView({ type: 'chat', runId: null })
    }, [activeChatTabId, activeFileTabId, clearToolOpenForTab, navigateToView, replaceTabRunId])

  const handleHeaderNewChat = useCallback(() => {
    openNewChatTab()
  }, [openNewChatTab])

  useChatNotificationOrchestrator({
    activeRunId: activeChatTabState.runId,
    onNotificationActivated: (targetRunId) => {
      void navigateToView({ type: 'chat', runId: targetRunId }, { newTab: true })
    },
  })

  const getFileTabTitle = useCallback((tab: FileTab) => {
    if (isGraphTabPath(tab.path)) return 'Graph'
    return getBaseName(tab.path)
  }, [])

  const getFileTabIcon = useCallback((tab: FileTab, active: boolean) => {
    if (isGraphTabPath(tab.path)) {
      return (
        <span className={cn(
          'inline-flex size-4 items-center justify-center rounded-md',
          active ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' : 'bg-sky-100/80 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
        )}>
          <Network className="size-3" />
        </span>
      )
    }

    const normalized = tab.path.toLowerCase()
    if (normalized.endsWith('.ppt') || normalized.endsWith('.pptx')) {
      return (
        <span className={cn(
          'inline-flex size-4 items-center justify-center rounded-md',
          active ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-rose-100/80 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
        )}>
          <Presentation className="size-3" />
        </span>
      )
    }

    return (
      <span className={cn(
        'inline-flex size-4 items-center justify-center rounded-md',
        active ? 'bg-slate-100 text-slate-700 dark:bg-zinc-700 dark:text-zinc-100' : 'bg-slate-100/80 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'
      )}>
        <FileText className="size-3" />
      </span>
    )
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
          const existingTab = findTabByRunId(view.runId)
        if (existingTab) {
          switchChatTab(existingTab.id)
          } else {
            replaceTabRunId(activeChatTabId, view.runId || null)
          }
          clearToolOpenForTab(activeChatTabId)
          loadRun(view.runId)
        } else {
          replaceTabRunId(activeChatTabId, null)
          clearToolOpenForTab(activeChatTabId)
          resetChatRuntime()
        }
      } else if (view.type === 'task') {
        setSelectedBackgroundTask(view.name)
      }
    }, [appendUnique, findTabByRunId, switchChatTab, replaceTabRunId, activeChatTabId, clearToolOpenForTab, setViewHistoryFull, ensureFileTabForPath, loadRun, resetChatRuntime])

  useEffect(() => {
    setNavigator(navigate)
  }, [navigate, setNavigator])


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
    ? (backgroundTasks.find((t) => t.name === selectedBackgroundTask) ?? null)
    : null
  const isRightPaneContext = Boolean(selectedPath || isGraphOpen)
  const isRightPaneOnlyMode = isRightPaneContext && isChatSidebarOpen && isRightPaneMaximized
  const shouldCollapseLeftPane = isRightPaneOnlyMode

  const { paneReset: chatPaneReset, chatSidebarProps } = useChatSidebarProps({
    runId,
    loadRun,
    resetChatRuntime,
    isChatSidebarOpen,
    isRightPaneMaximized,
    chatTabs,
    activeChatTabId,
    getChatTabTitle,
    isChatTabProcessing,
    switchChatTab,
    closeChatTab,
    openNewChatTab,
    toggleRightPaneMaximize,
    conversation,
    currentAssistantMessage,
    runStatus: activeChatTabState.runStatus,
    modelUsage,
    modelUsageUpdatedAt: activeChatTabState.modelUsageUpdatedAt,
    chatTabStates: chatViewStateByTab,
    isProcessing,
    isStopping,
    handleStop,
    handlePromptSubmit,
    memoryFiles,
    recentWikiFiles,
    visibleMemoryFiles,
    presetMessage,
    clearPresetMessage: () => setPresetMessage(undefined),
    getInitialDraft: (tabId) => chatDraftsRef.current.get(tabId),
    setChatDraftForTab,
    pendingAskHumanRequests,
    allPermissionRequests,
    permissionResponses,
    handlePermissionResponse,
    handleAskHumanResponse,
    isToolOpenForTab,
    setToolOpenForTab,
    navigateToFile,
    setActiveShortcutPane,
  })

  const { onReset: workspacePaneReset, sidebarProps } = useWorkspaceSidebarProps({
    tree,
    selectedPath,
    expandedPaths,
    handleSelectMemoryItem,
    memoryActions,
    pendingFolderRenamePath,
    setPendingFolderRenamePath,
    handleVoiceNoteCreated,
    runs,
    runId,
    processingRunIds,
    openNewChatTab,
    selectedPathOrGraphOpen: Boolean(selectedPath || isGraphOpen),
    setIsChatSidebarOpen,
    findTabByRunId,
    switchChatTab,
    replaceTabRunId,
    activeChatTabId,
    clearToolOpenForTab,
    loadRun,
    navigateToView,
    openChatInNewTab,
    chatTabs,
    closeChatTab,
    handleNewChat,
    loadRuns,
    backgroundTasks,
    selectedBackgroundTask,
    refreshTree,
  })

  const sideChatPane = (
    <AppChatSidebarPane
      onReset={chatPaneReset}
      chatSidebarProps={chatSidebarProps}
    />
  )

  const headerProps = useAppHeaderProps({
    isCollectionOpen,
    selectedCollection,
    selectedPath,
    isGraphOpen,
    fileTabs,
    activeFileTabId,
    chatTabs,
    activeChatTabId,
    getFileTabTitle,
    getFileTabIcon,
    switchFileTab,
    closeFileTab,
    getChatTabTitle,
    isChatTabProcessing,
    switchChatTab,
    closeChatTab,
    isSaving,
    lastSaved,
    versionHistoryPath,
    expandedFrom,
    isChatSidebarOpen,
    onReloadFromDisk: () => {
      if (selectedPath) {
        void reloadFileFromDisk(selectedPath)
      }
    },
    onToggleVersionHistory: () => {
      if (!selectedPath) return
      if (versionHistoryPath) {
        setVersionHistoryPath(null)
        setViewingHistoricalVersion(null)
      } else {
        setVersionHistoryPath(selectedPath)
      }
    },
    onCloseFullScreenChat: handleCloseFullScreenChat,
    onToggleMemoryPane: toggleMemoryPane,
  })

  const mainContentProps = useAppMainContentProps({
    isGraphOpen,
    graphData,
    graphStatus,
    graphError,
    refreshTree,
    navigateToFile,
    selectedPath,
    isCollectionOpen,
    tree,
    memoryActions,
    openMarkdownTabs,
    activeFileTabId,
    viewingHistoricalVersion,
    versionHistoryPath,
    setViewingHistoricalVersion,
    setVersionHistoryPath,
    editorContentByPath,
    editorContent,
    handleEditorChange,
    memoryFilePaths,
    recentWikiFiles,
    openWikiLink,
    handleImageUpload,
    editorSessionByTabId,
    fileHistoryHandlersRef,
    reloadFileFromDisk,
    selectedTask,
    handleToggleBackgroundTask,
    chatMainPanelProps: {
      chatTabs,
      activeChatTabId,
      getChatTabStateForRender,
      hasConversation,
      isProcessing,
      isStopping,
      handleStop,
      handlePromptSubmit,
      memoryFiles,
      recentWikiFiles,
      visibleMemoryFiles,
      presetMessage,
      onSelectSuggestion: setPresetMessage,
      onPresetMessageConsumed: () => setPresetMessage(undefined),
      setChatDraftForTab,
      isToolOpenForTab,
      setToolOpenForTab,
      handlePermissionResponse,
      handleAskHumanResponse,
      navigateToFile,
    },
    runId,
    loadRun,
    resetChatRuntime,
    shellOpenPath: async (path) => {
      await shellIpc.openPath(path)
    },
  })

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
      titlebarLeadingContent={
        <AppTitlebarLeadingContent
          onNewChat={handleHeaderNewChat}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      }
      onActivatePrimaryPane={() => setActiveShortcutPane('left')}
      leftSidebar={
        <WorkspaceSidebarPane
          onReset={workspacePaneReset}
          sidebarProps={sidebarProps}
        />
      }
      headerContent={
        <AppHeaderContent {...headerProps} />
      }
      mainContent={
        <AppMainContent {...mainContentProps} />
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
