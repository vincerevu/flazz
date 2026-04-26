import { Suggestions } from '@/components/ai-elements/suggestions'
import type { FileMention, PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { ChatInputWithMentions, type StagedAttachment } from '@/components/chat-input-with-mentions'
import type { ChatTabViewState } from '@/lib/chat-conversation'

type ChatSidebarInputPanelsProps = {
  chatTabs: Array<{ id: string }>
  activeChatTabId: string
  getTabState: (tabId: string) => ChatTabViewState
  hasConversation: boolean
  localPresetMessage?: string
  presetMessage?: string
  memoryFiles: string[]
  recentFiles: string[]
  visibleFiles: string[]
  isProcessing: boolean
  isStopping?: boolean
  onSubmit: (message: PromptInputMessage, mentions?: FileMention[], attachments?: StagedAttachment[]) => void
  onStop?: () => void
  getInitialDraft?: (tabId: string) => string | undefined
  onDraftChangeForTab?: (tabId: string, text: string) => void
  onPresetMessageSelected: (message: string) => void
  onPresetMessageConsumed?: () => void
}

export function ChatSidebarInputPanels({
  chatTabs,
  activeChatTabId,
  getTabState,
  hasConversation,
  localPresetMessage,
  presetMessage,
  memoryFiles,
  recentFiles,
  visibleFiles,
  isProcessing,
  isStopping,
  onSubmit,
  onStop,
  getInitialDraft,
  onDraftChangeForTab,
  onPresetMessageSelected,
  onPresetMessageConsumed,
}: ChatSidebarInputPanelsProps) {
  return (
    <div className="sticky bottom-0 z-10 bg-background pb-12 pt-0 shadow-lg">
      <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-t from-background to-transparent" />
      <div className="mx-auto w-full max-w-4xl px-3">
        {!hasConversation && (
          <Suggestions onSelect={onPresetMessageSelected} className="mb-3 justify-center" />
        )}
        {chatTabs.map((tab) => {
          const isActive = tab.id === activeChatTabId
          const tabState = getTabState(tab.id)
          return (
            <div
              key={tab.id}
              className={isActive ? 'block' : 'hidden'}
              data-chat-input-panel={tab.id}
              aria-hidden={!isActive}
            >
              <ChatInputWithMentions
                memoryFiles={memoryFiles}
                recentFiles={recentFiles}
                visibleFiles={visibleFiles}
                onSubmit={onSubmit}
                onStop={onStop}
                isProcessing={isActive && isProcessing}
                isStopping={isActive && isStopping}
                isActive={isActive}
                presetMessage={isActive ? (localPresetMessage ?? presetMessage) : undefined}
                onPresetMessageConsumed={
                  isActive
                    ? () => {
                        onPresetMessageConsumed?.()
                      }
                    : undefined
                }
                runId={tabState.runId}
                initialDraft={getInitialDraft?.(tab.id)}
                onDraftChange={
                  onDraftChangeForTab
                    ? (text) => onDraftChangeForTab(tab.id, text)
                    : undefined
                }
                conversation={tabState.conversation}
                modelUsage={tabState.modelUsage}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
