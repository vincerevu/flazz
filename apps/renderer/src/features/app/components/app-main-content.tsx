import type { ComponentProps, MutableRefObject } from 'react'
import { Maximize2 } from 'lucide-react'

import { GraphView } from '@/components/graph-view'
import { BackgroundTaskDetail } from '@/components/background-task-detail'
import { VersionHistoryPanel } from '@/components/version-history-panel'
import { MarkdownEditor } from '@/components/markdown-editor'
import { PanelErrorBoundary } from '@/components/panel-error-boundary'
import { Button } from '@/components/ui/button'
import { ChatMainPanel } from '@/features/chat/components/chat-main-panel'
import { MemoryCollectionView } from '@/features/memory/components/memory-collection-view'
import { splitFrontmatter } from '@/lib/frontmatter'
import { cn } from '@/lib/utils'

type MarkdownTab = {
  id: string
  path: string
}

type HistoricalVersion = {
  oid: string
  content: string
} | null

type HistoryHandlersRef = MutableRefObject<Map<string, { undo: () => boolean; redo: () => boolean }>>

type AppMainContentProps = {
  isGraphOpen: boolean
  graphViewProps: ComponentProps<typeof GraphView>
  onResetGraph?: () => void
  selectedPath: string | null
  isCollectionOpen: boolean
  memoryCollectionProps: ComponentProps<typeof MemoryCollectionView>
  onResetCollection?: () => void
  openMarkdownTabs: MarkdownTab[]
  activeFileTabId: string | null
  viewingHistoricalVersion: HistoricalVersion
  versionHistoryPath: string | null
  getMarkdownTabContent: (tab: MarkdownTab, isActive: boolean, isViewingHistory: boolean) => string
  onMarkdownBodyChange: (tab: MarkdownTab, isActive: boolean, isViewingHistory: boolean, markdown: string) => void
  onMarkdownFrontmatterChange: (tab: MarkdownTab, isActive: boolean, isViewingHistory: boolean, nextRaw: string | null) => void
  memoryFilePaths: string[]
  recentWikiFiles: string[]
  onOpenWikiLink: (path: string) => void | Promise<void>
  onImageUpload: (file: File) => Promise<string | null>
  editorSessionByTabId: Record<string, number>
  fileHistoryHandlersRef: HistoryHandlersRef
  reloadFileFromDisk: (path: string) => void | Promise<void>
  onVersionHistoryClose: () => void
  onVersionSelect: (oid: string | null, content: string) => void
  onVersionRestore: (oid: string) => void | Promise<void>
  selectedTaskProps?: ComponentProps<typeof BackgroundTaskDetail> | null
  chatMainPanelProps: ComponentProps<typeof ChatMainPanel>
  onResetChatPanel?: () => void
  onOpenExternalFile: (path: string) => void
}

export function AppMainContent({
  isGraphOpen,
  graphViewProps,
  onResetGraph,
  selectedPath,
  isCollectionOpen,
  memoryCollectionProps,
  onResetCollection,
  openMarkdownTabs,
  activeFileTabId,
  viewingHistoricalVersion,
  versionHistoryPath,
  getMarkdownTabContent,
  onMarkdownBodyChange,
  onMarkdownFrontmatterChange,
  memoryFilePaths,
  recentWikiFiles,
  onOpenWikiLink,
  onImageUpload,
  editorSessionByTabId,
  fileHistoryHandlersRef,
  reloadFileFromDisk,
  onVersionHistoryClose,
  onVersionSelect,
  onVersionRestore,
  selectedTaskProps,
  chatMainPanelProps,
  onResetChatPanel,
  onOpenExternalFile,
}: AppMainContentProps) {
  if (isGraphOpen) {
    return (
      <PanelErrorBoundary panelName="Knowledge graph" onReset={onResetGraph}>
        <div className="flex-1 min-h-0">
          <GraphView {...graphViewProps} />
        </div>
      </PanelErrorBoundary>
    )
  }

  if (selectedPath) {
    if (isCollectionOpen) {
      return (
        <PanelErrorBoundary panelName="Memory collection" onReset={onResetCollection}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <MemoryCollectionView {...memoryCollectionProps} />
          </div>
        </PanelErrorBoundary>
      )
    }

    if (selectedPath.endsWith('.md')) {
      return (
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {openMarkdownTabs.map((tab) => {
              const isActive = activeFileTabId
                ? tab.id === activeFileTabId || tab.path === selectedPath
                : tab.path === selectedPath
              const isViewingHistory = Boolean(viewingHistoricalVersion && isActive && versionHistoryPath === tab.path)
              const tabContent = getMarkdownTabContent(tab, isActive, isViewingHistory)
              const { raw: tabFrontmatter, body: tabBody } = splitFrontmatter(tabContent)

              return (
                <div
                  key={tab.id}
                  className={cn(
                    'min-h-0 flex-1 flex-col overflow-hidden',
                    isActive ? 'flex' : 'hidden',
                  )}
                  data-file-tab-panel={tab.id}
                  aria-hidden={!isActive}
                >
                  <PanelErrorBoundary
                    panelName="Markdown editor"
                    onReset={() => {
                      if (!isViewingHistory) {
                        void reloadFileFromDisk(tab.path)
                      }
                    }}
                  >
                    <MarkdownEditor
                      content={tabBody}
                      frontmatter={tabFrontmatter}
                      onChange={(markdown) => onMarkdownBodyChange(tab, isActive, isViewingHistory, markdown)}
                      onFrontmatterChange={(nextRaw) => onMarkdownFrontmatterChange(tab, isActive, isViewingHistory, nextRaw)}
                      placeholder="Start writing..."
                      wikiLinks={{
                        files: memoryFilePaths,
                        recent: recentWikiFiles,
                        onOpen: (path) => {
                          void onOpenWikiLink(path)
                        },
                        onCreate: (path) => onOpenWikiLink(path),
                      }}
                      onImageUpload={onImageUpload}
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
                  </PanelErrorBoundary>
                </div>
              )
            })}
          </div>
          {versionHistoryPath && (
            <VersionHistoryPanel
              path={versionHistoryPath}
              onClose={onVersionHistoryClose}
              onSelectVersion={onVersionSelect}
              onRestore={onVersionRestore}
            />
          )}
        </div>
      )
    }

    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="max-w-md space-y-2">
          <div className="text-sm font-medium">Preview in app is only available for Markdown files.</div>
          <div className="text-sm text-muted-foreground">
            This file will open with your system default app instead.
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => onOpenExternalFile(selectedPath)}
        >
          <Maximize2 className="size-4" />
          Open file externally
        </Button>
      </div>
    )
  }

  if (selectedTaskProps) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden">
        <BackgroundTaskDetail {...selectedTaskProps} />
      </div>
    )
  }

  return (
    <PanelErrorBoundary panelName="Chat panel" onReset={onResetChatPanel}>
      <ChatMainPanel {...chatMainPanelProps} />
    </PanelErrorBoundary>
  )
}
