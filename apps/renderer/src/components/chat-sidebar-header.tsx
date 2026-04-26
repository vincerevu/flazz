import { Maximize2, Minimize2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TabBar, type ChatTab } from '@/components/tab-bar'

type ChatSidebarHeaderProps = {
  chatTabs: ChatTab[]
  activeChatTabId: string
  getChatTabTitle: (tab: ChatTab) => string
  isChatTabProcessing: (tab: ChatTab) => boolean
  isMaximized: boolean
  onSwitchChatTab: (tabId: string) => void
  onCloseChatTab: (tabId: string) => void
  onOpenFullScreen?: () => void
}

export function ChatSidebarHeader({
  chatTabs,
  activeChatTabId,
  getChatTabTitle,
  isChatTabProcessing,
  isMaximized,
  onSwitchChatTab,
  onCloseChatTab,
  onOpenFullScreen,
}: ChatSidebarHeaderProps) {
  return (
    <header className="titlebar-drag-region flex h-auto shrink-0 flex-col border-b border-border bg-sidebar">
      <div className="flex items-stretch gap-1 px-2 py-1">
        <TabBar
          tabs={chatTabs}
          activeTabId={activeChatTabId}
          getTabTitle={getChatTabTitle}
          getTabId={(tab) => tab.id}
          isProcessing={isChatTabProcessing}
          onSwitchTab={onSwitchChatTab}
          onCloseTab={onCloseChatTab}
          variant="pill"
        />
        {onOpenFullScreen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenFullScreen}
                className="titlebar-no-drag ml-auto h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={isMaximized ? 'Restore two-pane view' : 'Maximize chat view'}
              >
                {isMaximized ? (
                  <Minimize2 className="size-5" />
                ) : (
                  <Maximize2 className="size-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isMaximized ? 'Restore two-pane view' : 'Maximize chat view'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
