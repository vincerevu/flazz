import type { ReactNode } from 'react'
import {
  CheckIcon,
  HistoryIcon,
  LoaderIcon,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react'

import { TabBar, type ChatTab, type FileTab } from '@/components/tab-bar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type CollectionMeta = {
  label: string
  description?: string
} | null | undefined

type AppHeaderContentProps = {
  isCollectionOpen: boolean
  selectedCollection: CollectionMeta
  selectedPath: string | null
  isGraphOpen: boolean
  fileTabs: FileTab[]
  activeFileTabId: string | null
  chatTabs: ChatTab[]
  activeChatTabId: string
  getFileTabTitle: (tab: FileTab) => string
  getFileTabIcon: (tab: FileTab, active: boolean) => ReactNode
  switchFileTab: (tabId: string) => void
  closeFileTab: (tabId: string) => void
  getChatTabTitle: (tab: ChatTab) => string
  isChatTabProcessing: (tab: ChatTab) => boolean
  switchChatTab: (tabId: string) => void
  closeChatTab: (tabId: string) => void
  isSaving: boolean
  lastSaved: unknown
  versionHistoryPath: string | null
  expandedFrom: unknown
  isChatSidebarOpen: boolean
  onReloadFromDisk: () => void
  onToggleVersionHistory: () => void
  onCloseFullScreenChat: () => void
  onToggleMemoryPane: () => void
}

export function AppHeaderContent({
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
  onReloadFromDisk,
  onToggleVersionHistory,
  onCloseFullScreenChat,
  onToggleMemoryPane,
}: AppHeaderContentProps) {
  return (
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
          getTabId={(tab) => tab.id}
          getTabIcon={getFileTabIcon}
          onSwitchTab={switchFileTab}
          onCloseTab={closeFileTab}
          variant="pill"
          allowSingleTabClose={fileTabs.length === 1 && isGraphOpen}
        />
      ) : (
        <TabBar
          tabs={chatTabs}
          activeTabId={activeChatTabId}
          getTabTitle={getChatTabTitle}
          getTabId={(tab) => tab.id}
          isProcessing={isChatTabProcessing}
          onSwitchTab={switchChatTab}
          onCloseTab={closeChatTab}
          variant="pill"
        />
      )}
      {selectedPath && !isCollectionOpen && (
        <div className="flex items-center gap-1 self-center shrink-0 pl-2 text-xs text-muted-foreground">
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
              onClick={onReloadFromDisk}
              className="titlebar-no-drag flex h-8 w-8 items-center justify-center self-center shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              onClick={onToggleVersionHistory}
              className={cn(
                'titlebar-no-drag flex h-8 w-8 items-center justify-center self-center shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                versionHistoryPath && 'bg-accent text-foreground',
              )}
              aria-label="Version history"
            >
              <HistoryIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Version history</TooltipContent>
        </Tooltip>
      )}
      {!selectedPath && !isGraphOpen && expandedFrom && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCloseFullScreenChat}
              className="titlebar-no-drag flex h-8 w-8 items-center justify-center self-center shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              onClick={onToggleMemoryPane}
              className="titlebar-no-drag -mr-1 flex h-8 w-8 items-center justify-center self-center shrink-0 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={isChatSidebarOpen ? 'Maximize memory view' : 'Restore two-pane view'}
            >
              {isChatSidebarOpen ? <Maximize2 className="size-5" /> : <Minimize2 className="size-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isChatSidebarOpen ? 'Maximize memory view' : 'Restore two-pane view'}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  )
}
