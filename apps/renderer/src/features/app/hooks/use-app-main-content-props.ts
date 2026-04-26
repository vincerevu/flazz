import { useMemo } from 'react'
import type { ComponentProps } from 'react'

import { AppMainContent } from '@/features/app/components/app-main-content'
import type { AgentSchedule } from '@/features/background-tasks/use-background-tasks'
import { joinFrontmatter, splitFrontmatter } from '@/lib/frontmatter'
import { memoryIpc } from '@/services/memory-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'

type AppMainContentProps = ComponentProps<typeof AppMainContent>

type UseAppMainContentPropsOptions = {
  isGraphOpen: boolean
  graphData: { nodes: AppMainContentProps['graphViewProps']['nodes']; edges: AppMainContentProps['graphViewProps']['edges'] }
  graphStatus: 'idle' | 'loading' | 'ready' | 'error'
  graphError: string | null
  refreshTree: () => Promise<unknown> | void
  navigateToFile: (path: string, opts?: { newTab?: boolean }) => void
  selectedPath: string | null
  isCollectionOpen: boolean
  tree: AppMainContentProps['memoryCollectionProps']['tree']
  memoryActions: { createNote: (parentPath?: string) => Promise<unknown> }
  openMarkdownTabs: AppMainContentProps['openMarkdownTabs']
  activeFileTabId: string | null
  viewingHistoricalVersion: AppMainContentProps['viewingHistoricalVersion']
  versionHistoryPath: string | null
  setViewingHistoricalVersion: (value: AppMainContentProps['viewingHistoricalVersion']) => void
  setVersionHistoryPath: (path: string | null) => void
  editorContentByPath: Record<string, string>
  editorContent: string
  handleEditorChange: (path: string, content: string) => void
  memoryFilePaths: string[]
  recentWikiFiles: string[]
  openWikiLink: (path: string) => void | Promise<void>
  handleImageUpload: (file: File) => Promise<string | null>
  editorSessionByTabId: Record<string, number>
  fileHistoryHandlersRef: AppMainContentProps['fileHistoryHandlersRef']
  reloadFileFromDisk: (path: string) => void | Promise<void>
  selectedTask: AgentSchedule | null
  handleToggleBackgroundTask: (name: string, enabled: boolean) => void
  chatMainPanelProps: AppMainContentProps['chatMainPanelProps']
  runId: string | null
  loadRun: (runId: string) => void | Promise<void>
  resetChatRuntime: () => void
  shellOpenPath: (path: string) => void | Promise<void>
}

export function useAppMainContentProps({
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
  chatMainPanelProps,
  runId,
  loadRun,
  resetChatRuntime,
  shellOpenPath,
}: UseAppMainContentPropsOptions): AppMainContentProps {
  return useMemo(() => ({
    isGraphOpen,
    graphViewProps: {
      nodes: graphData.nodes,
      edges: graphData.edges,
      isLoading: graphStatus === 'loading',
      error: graphStatus === 'error' ? (graphError ?? 'Failed to build graph') : null,
      onSelectNode: (path) => {
        navigateToFile(path)
      },
    },
    onResetGraph: () => { void refreshTree() },
    selectedPath,
    isCollectionOpen,
    memoryCollectionProps: {
      collectionPath: selectedPath ?? '',
      tree,
      onSelectNote: navigateToFile,
      onCreateNote: (parentPath) => {
        void memoryActions.createNote(parentPath)
      },
    },
    onResetCollection: () => { void refreshTree() },
    openMarkdownTabs,
    activeFileTabId,
    viewingHistoricalVersion,
    versionHistoryPath,
    getMarkdownTabContent: (tab, isActive, isViewingHistory) => (
      isViewingHistory
        ? viewingHistoricalVersion?.content ?? ''
        : editorContentByPath[tab.path]
          ?? (isActive && selectedPath === tab.path ? editorContent : '')
    ),
    onMarkdownBodyChange: (tab, isActive, isViewingHistory, markdown) => {
      if (!isViewingHistory) {
        const currentContent = editorContentByPath[tab.path]
          ?? (isActive && selectedPath === tab.path ? editorContent : '')
        const { raw: currentFrontmatter } = splitFrontmatter(currentContent)
        handleEditorChange(tab.path, joinFrontmatter(currentFrontmatter, markdown))
      }
    },
    onMarkdownFrontmatterChange: (tab, isActive, isViewingHistory, nextRaw) => {
      if (!isViewingHistory) {
        const currentContent = editorContentByPath[tab.path]
          ?? (isActive && selectedPath === tab.path ? editorContent : '')
        const { body: currentBody } = splitFrontmatter(currentContent)
        handleEditorChange(tab.path, joinFrontmatter(nextRaw, currentBody))
      }
    },
    memoryFilePaths,
    recentWikiFiles,
    onOpenWikiLink: (path) => openWikiLink(path),
    onImageUpload: handleImageUpload,
    editorSessionByTabId,
    fileHistoryHandlersRef,
    reloadFileFromDisk,
    onVersionHistoryClose: () => {
      setVersionHistoryPath(null)
      setViewingHistoricalVersion(null)
    },
    onVersionSelect: (oid, content) => {
      if (oid === null) {
        setViewingHistoricalVersion(null)
      } else {
        setViewingHistoricalVersion({ oid, content })
      }
    },
    onVersionRestore: async (oid) => {
      if (!versionHistoryPath) return
      try {
        const restorePath = versionHistoryPath.startsWith('memory/')
          ? versionHistoryPath.slice('memory/'.length)
          : versionHistoryPath
        await memoryIpc.restore(restorePath, oid)
        const result = await workspaceIpc.readFile(versionHistoryPath)
        handleEditorChange(versionHistoryPath, result.data)
        setViewingHistoricalVersion(null)
        setVersionHistoryPath(null)
      } catch (err) {
        console.error('Failed to restore version:', err)
      }
    },
    selectedTaskProps: selectedTask ? {
      name: selectedTask.name,
      description: selectedTask.description,
      schedule: selectedTask.schedule,
      enabled: selectedTask.enabled,
      status: selectedTask.status,
      nextRunAt: selectedTask.nextRunAt,
      lastRunAt: selectedTask.lastRunAt,
      lastError: selectedTask.lastError,
      runCount: selectedTask.runCount,
      onToggleEnabled: (enabled) => handleToggleBackgroundTask(selectedTask.name, enabled),
    } : null,
    chatMainPanelProps,
    onResetChatPanel: () => {
      if (runId) {
        void loadRun(runId)
        return
      }
      resetChatRuntime()
    },
    onOpenExternalFile: (path) => {
      void shellOpenPath(path)
    },
  }), [
    activeFileTabId,
    chatMainPanelProps,
    editorContent,
    editorContentByPath,
    editorSessionByTabId,
    fileHistoryHandlersRef,
    graphData.edges,
    graphData.nodes,
    graphError,
    graphStatus,
    handleEditorChange,
    handleImageUpload,
    handleToggleBackgroundTask,
    isCollectionOpen,
    isGraphOpen,
    loadRun,
    memoryActions,
    memoryFilePaths,
    navigateToFile,
    openMarkdownTabs,
    openWikiLink,
    recentWikiFiles,
    refreshTree,
    reloadFileFromDisk,
    resetChatRuntime,
    runId,
    selectedPath,
    selectedTask,
    setVersionHistoryPath,
    setViewingHistoricalVersion,
    shellOpenPath,
    tree,
    versionHistoryPath,
    viewingHistoricalVersion,
  ])
}
