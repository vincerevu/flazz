import { useMemo } from 'react'
import type { ComponentProps } from 'react'

import { ChatSidebar } from '@/components/chat-sidebar'

type ChatSidebarProps = ComponentProps<typeof ChatSidebar>

type UseChatSidebarPropsOptions = {
  runId: string | null
  loadRun: (runId: string) => void | Promise<void>
  resetChatRuntime: () => void
  isChatSidebarOpen: boolean
  isRightPaneMaximized: boolean
  chatTabs: ChatSidebarProps['chatTabs']
  activeChatTabId: string
  getChatTabTitle: ChatSidebarProps['getChatTabTitle']
  isChatTabProcessing: ChatSidebarProps['isChatTabProcessing']
  switchChatTab: ChatSidebarProps['onSwitchChatTab']
  closeChatTab: ChatSidebarProps['onCloseChatTab']
  openNewChatTab: ChatSidebarProps['onNewChatTab']
  toggleRightPaneMaximize: () => void
  conversation: ChatSidebarProps['conversation']
  currentAssistantMessage: string
  runStatus: ChatSidebarProps['runStatus']
  modelUsage: ChatSidebarProps['modelUsage']
  modelUsageUpdatedAt: ChatSidebarProps['modelUsageUpdatedAt']
  chatTabStates: NonNullable<ChatSidebarProps['chatTabStates']>
  isProcessing: boolean
  isStopping: boolean
  handleStop: NonNullable<ChatSidebarProps['onStop']>
  handlePromptSubmit: ChatSidebarProps['onSubmit']
  memoryFiles: string[]
  recentWikiFiles: string[]
  visibleMemoryFiles: string[]
  presetMessage?: string
  clearPresetMessage: () => void
  getInitialDraft: (tabId: string) => string | undefined
  setChatDraftForTab: NonNullable<ChatSidebarProps['onDraftChangeForTab']>
  pendingAskHumanRequests: ChatSidebarProps['pendingAskHumanRequests']
  allPermissionRequests: ChatSidebarProps['allPermissionRequests']
  permissionResponses: ChatSidebarProps['permissionResponses']
  handlePermissionResponse: ChatSidebarProps['onPermissionResponse']
  handleAskHumanResponse: ChatSidebarProps['onAskHumanResponse']
  isToolOpenForTab: NonNullable<ChatSidebarProps['isToolOpenForTab']>
  setToolOpenForTab: NonNullable<ChatSidebarProps['onToolOpenChangeForTab']>
  navigateToFile: (path: string, opts?: { newTab?: boolean }) => void
  setActiveShortcutPane: (pane: 'left' | 'right') => void
}

export function useChatSidebarProps({
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
  runStatus,
  modelUsage,
  modelUsageUpdatedAt,
  chatTabStates,
  isProcessing,
  isStopping,
  handleStop,
  handlePromptSubmit,
  memoryFiles,
  recentWikiFiles,
  visibleMemoryFiles,
  presetMessage,
  clearPresetMessage,
  getInitialDraft,
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
}: UseChatSidebarPropsOptions) {
  const paneReset = useMemo(() => (() => {
    if (runId) {
      void loadRun(runId)
      return
    }
    resetChatRuntime()
  }), [loadRun, resetChatRuntime, runId])

  const chatSidebarProps = useMemo<ChatSidebarProps>(() => ({
    defaultWidth: 460,
    isOpen: isChatSidebarOpen,
    isMaximized: isRightPaneMaximized,
    chatTabs,
    activeChatTabId,
    getChatTabTitle,
    isChatTabProcessing,
    onSwitchChatTab: switchChatTab,
    onCloseChatTab: closeChatTab,
    onNewChatTab: openNewChatTab,
    onOpenFullScreen: toggleRightPaneMaximize,
    conversation,
    currentAssistantMessage,
    runStatus,
    modelUsage,
    modelUsageUpdatedAt,
    chatTabStates,
    isProcessing,
    isStopping,
    onStop: handleStop,
    onSubmit: handlePromptSubmit,
    memoryFiles,
    recentFiles: recentWikiFiles,
    visibleFiles: visibleMemoryFiles,
    runId,
    presetMessage,
    onPresetMessageConsumed: clearPresetMessage,
    getInitialDraft,
    onDraftChangeForTab: setChatDraftForTab,
    pendingAskHumanRequests,
    allPermissionRequests,
    permissionResponses,
    onPermissionResponse: handlePermissionResponse,
    onAskHumanResponse: handleAskHumanResponse,
    isToolOpenForTab,
    onToolOpenChangeForTab: setToolOpenForTab,
    onOpenMemoryFile: (path) => { navigateToFile(path) },
    onActivate: () => setActiveShortcutPane('right'),
  }), [
    activeChatTabId,
    allPermissionRequests,
    chatTabStates,
    chatTabs,
    clearPresetMessage,
    closeChatTab,
    conversation,
    currentAssistantMessage,
    getChatTabTitle,
    getInitialDraft,
    handleAskHumanResponse,
    handlePermissionResponse,
    handlePromptSubmit,
    handleStop,
    isChatSidebarOpen,
    isChatTabProcessing,
    isProcessing,
    isRightPaneMaximized,
    isStopping,
    isToolOpenForTab,
    memoryFiles,
    modelUsage,
    modelUsageUpdatedAt,
    navigateToFile,
    openNewChatTab,
    pendingAskHumanRequests,
    permissionResponses,
    presetMessage,
    recentWikiFiles,
    runId,
    runStatus,
    setActiveShortcutPane,
    setChatDraftForTab,
    setToolOpenForTab,
    switchChatTab,
    toggleRightPaneMaximize,
    visibleMemoryFiles,
  ])

  return {
    paneReset,
    chatSidebarProps,
  }
}
