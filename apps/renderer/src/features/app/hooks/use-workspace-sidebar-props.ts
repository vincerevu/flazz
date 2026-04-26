import { useMemo } from 'react'
import type { ComponentProps } from 'react'

import { SidebarContentPanel } from '@/components/sidebar-content'
import { runsIpc } from '@/services/runs-ipc'

type SidebarProps = ComponentProps<typeof SidebarContentPanel>

type UseWorkspaceSidebarPropsOptions = {
  tree: SidebarProps['tree']
  selectedPath: SidebarProps['selectedPath']
  expandedPaths: SidebarProps['expandedPaths']
  handleSelectMemoryItem: SidebarProps['onSelectFile']
  memoryActions: SidebarProps['memoryActions']
  pendingFolderRenamePath: string | null
  setPendingFolderRenamePath: (path: string | null) => void
  handleVoiceNoteCreated: SidebarProps['onVoiceNoteCreated']
  runs: SidebarProps['runs']
  runId: string | null
  processingRunIds: SidebarProps['processingRunIds']
  openNewChatTab: () => void
  selectedPathOrGraphOpen: boolean
  setIsChatSidebarOpen: (open: boolean) => void
  findTabByRunId: (runId: string | null | undefined) => { id: string; runId: string | null } | undefined
  switchChatTab: (tabId: string) => void
  replaceTabRunId: (tabId: string, nextRunId: string | null) => void
  activeChatTabId: string
  clearToolOpenForTab: (tabId: string) => void
  loadRun: (runId: string) => void | Promise<void>
  navigateToView: (view: { type: 'chat'; runId: string | null } | { type: 'task'; name: string }, opts?: { pushHistory?: boolean; newTab?: boolean }) => void
  openChatInNewTab: (targetRunId?: string) => void
  chatTabs: Array<{ id: string; runId: string | null }>
  closeChatTab: (tabId: string) => void
  handleNewChat: () => void
  loadRuns: () => Promise<unknown> | void
  backgroundTasks: SidebarProps['backgroundTasks']
  selectedBackgroundTask: SidebarProps['selectedBackgroundTask']
  refreshTree: () => Promise<unknown> | void
}

export function useWorkspaceSidebarProps({
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
  selectedPathOrGraphOpen,
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
}: UseWorkspaceSidebarPropsOptions) {
  const onReset = useMemo(() => (() => { void refreshTree() }), [refreshTree])

  const sidebarProps = useMemo<SidebarProps>(() => ({
    tree,
    selectedPath,
    expandedPaths,
    onSelectFile: handleSelectMemoryItem,
    memoryActions,
    pendingFolderRenamePath,
    onPendingFolderRenameHandled: setPendingFolderRenamePath,
    onVoiceNoteCreated: handleVoiceNoteCreated,
    runs,
    currentRunId: runId,
    processingRunIds,
    tasksActions: {
      onNewChat: openNewChatTab,
      onSelectRun: (runIdToLoad) => {
        if (selectedPathOrGraphOpen) {
          setIsChatSidebarOpen(true)
        }

        const existingTab = findTabByRunId(runIdToLoad)
        if (existingTab) {
          switchChatTab(existingTab.id)
          return
        }

        if (selectedPathOrGraphOpen) {
          replaceTabRunId(activeChatTabId, runIdToLoad)
          clearToolOpenForTab(activeChatTabId)
          void loadRun(runIdToLoad)
          return
        }

        replaceTabRunId(activeChatTabId, runIdToLoad)
        void navigateToView({ type: 'chat', runId: runIdToLoad })
      },
      onOpenInNewTab: (targetRunId) => {
        openChatInNewTab(targetRunId)
      },
      onDeleteRun: async (runIdToDelete) => {
        try {
          await runsIpc.delete(runIdToDelete)
          const tabForRun = chatTabs.find((tab) => tab.runId === runIdToDelete)
          if (tabForRun) {
            if (chatTabs.length > 1) {
              closeChatTab(tabForRun.id)
            } else {
              replaceTabRunId(tabForRun.id, null)
              if (selectedPathOrGraphOpen) {
                handleNewChat()
              } else {
                void navigateToView({ type: 'chat', runId: null })
              }
            }
          } else if (runId === runIdToDelete) {
            if (selectedPathOrGraphOpen) {
              replaceTabRunId(activeChatTabId, null)
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
    },
    backgroundTasks,
    selectedBackgroundTask,
  }), [
    activeChatTabId,
    backgroundTasks,
    chatTabs,
    clearToolOpenForTab,
    closeChatTab,
    expandedPaths,
    findTabByRunId,
    handleNewChat,
    handleSelectMemoryItem,
    handleVoiceNoteCreated,
    loadRun,
    loadRuns,
    memoryActions,
    navigateToView,
    openChatInNewTab,
    openNewChatTab,
    pendingFolderRenamePath,
    processingRunIds,
    replaceTabRunId,
    runId,
    runs,
    selectedBackgroundTask,
    selectedPath,
    selectedPathOrGraphOpen,
    setIsChatSidebarOpen,
    setPendingFolderRenamePath,
    switchChatTab,
    tree,
  ])

  return {
    onReset,
    sidebarProps,
  }
}
