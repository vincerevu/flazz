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
import { getBaseName } from './features/knowledge/utils/wiki-logic'

import { CheckIcon, HistoryIcon, LoaderIcon, Maximize2, Minimize2, SquarePen } from 'lucide-react';
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
  isToolCall,
} from '@/lib/chat-conversation'

import { useTheme } from '@/contexts/theme-context'
import { RendererAppShell } from '@/components/app-shell/renderer-app-shell'
import { MainSidebarMenu, type MainView } from '@/components/main-sidebar-menu'
import { useChatRuntime } from '@/features/chat/use-chat-runtime'
import { runsIpc } from '@/services/runs-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'
import { knowledgeIpc } from '@/services/knowledge-ipc'
import { useDesktopWindow } from '@/features/app/use-desktop-window'
import { useAppKeyboardShortcuts } from '@/features/app/use-app-keyboard-shortcuts'
import { useBackgroundTasks } from '@/features/background-tasks/use-background-tasks'
import { ChatMainPanel } from '@/features/chat/components/chat-main-panel'
import { mockSkills } from '@/features/skills/mock-skills'
import { SkillsMainPanel } from '@/features/skills/components/skills-main-panel'
import { mockWorkflows } from '@/features/workflow/mock-workflows'
import { WorkflowMainPanel } from '@/features/workflow/components/workflow-main-panel'

function App() {
  type ShortcutPane = 'left' | 'right'
  const { resolvedTheme } = useTheme()

  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true)
  const [isRightPaneMaximized, setIsRightPaneMaximized] = useState(false)
  const [activeShortcutPane, setActiveShortcutPane] = useState<ShortcutPane>('left')
  const [activeMainView, setActiveMainView] = useState<MainView>('knowledge')
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
  const [selectedSkillId, setSelectedSkillId] = useState<string>(mockSkills[0]?.id ?? '')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(mockWorkflows[0]?.id ?? '')

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

  const handleSelectKnowledgeItem = useCallback((path: string, kind: "file" | "dir") => {
    if (kind === 'dir') {
      toggleExpand(path)
      return
    }
    navigateToFile(path)
  }, [navigateToFile, toggleExpand])

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


  // --- Chat State ---
  const chatDraftsRef = useRef<Map<string, string>>(new Map())
  const [activeChatTabId, setActiveChatTabId] = useState<string>('default-chat')
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([{ id: 'default-chat', runId: null }])
  const [chatViewStateByTab, setChatViewStateByTab] = useState<Record<string, ChatTabViewState>>({})
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
  )

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
      onActivatePrimaryPane={() => setActiveShortcutPane('left')}
      leftSidebar={
        <div className="flex h-full flex-col overflow-hidden">
          <MainSidebarMenu
            activeView={activeMainView}
            onViewChange={setActiveMainView}
          />
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeMainView === 'knowledge' && (
              <SidebarContentPanel
                tree={tree}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelectFile={handleSelectKnowledgeItem}
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
              skills={mockSkills}
              selectedSkillId={selectedSkillId}
              onSelectSkill={setSelectedSkillId}
              workflows={mockWorkflows}
              selectedWorkflowId={selectedWorkflowId}
              onSelectWorkflow={setSelectedWorkflowId}
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
              <ChatMainPanel
                chatTabs={chatTabs}
                activeChatTabId={activeChatTabId}
                getChatTabStateForRender={getChatTabStateForRender}
                hasConversation={hasConversation}
                isProcessing={isProcessing}
                isStopping={isStopping}
                handleStop={handleStop}
                handlePromptSubmit={handlePromptSubmit}
                knowledgeFiles={knowledgeFiles}
                recentWikiFiles={recentWikiFiles}
                visibleKnowledgeFiles={visibleKnowledgeFiles}
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
      sectionHeaderContent={{
        skills: (
          <div className="flex min-w-0 items-center gap-3 px-1">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Skills</div>
              <div className="truncate text-xs text-muted-foreground">
                Reusable presets and operating playbooks
              </div>
            </div>
          </div>
        ),
        workflow: (
          <div className="flex min-w-0 items-center gap-3 px-1">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Workflow</div>
              <div className="truncate text-xs text-muted-foreground">
                Visual automation blueprints with room for chat on the right
              </div>
            </div>
          </div>
        ),
      }}
      sectionMainContent={{
        skills: (
          <SkillsMainPanel
            skills={mockSkills}
            selectedSkillId={selectedSkillId}
          />
        ),
        workflow: (
          <WorkflowMainPanel
            workflows={mockWorkflows}
            selectedWorkflowId={selectedWorkflowId}
          />
        ),
      }}
      sectionAuxiliaryPane={{
        skills: sideChatPane,
        workflow: sideChatPane,
      }}
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
