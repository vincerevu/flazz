import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ScrollPositionPreserver,
} from '@/components/ai-elements/conversation'
import { AskHumanRequest } from '@/components/ai-elements/ask-human-request'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { PermissionRequest } from '@/components/ai-elements/permission-request'
import { Suggestions } from '@/components/ai-elements/suggestions'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { WebSearchResult } from '@/components/ai-elements/web-search-result'
import { ChatInputWithMentions, type StagedAttachment } from '@/components/chat-input-with-mentions'
import { ChatMessageAttachments } from '@/components/chat-message-attachments'
import { MarkdownPreOverride } from '@/components/ai-elements/markdown-code-override'
import { FileCardProvider } from '@/contexts/file-card-context'
import type { FileMention, PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { FileCard, WikiLink } from '@/features/knowledge/components/streamdown-components'
import {
  type ChatTabViewState,
  type ConversationItem,
  type PermissionResponse,
  getWebSearchCardData,
  isChatMessage,
  isErrorMessage,
  isToolCall,
  normalizeToolInput,
  normalizeToolOutput,
  parseAttachedFiles,
  toToolState,
} from '@/lib/chat-conversation'
import { wikiLabel } from '@/lib/wiki-links'
import { cn } from '@/lib/utils'
import type { ChatTab } from '@/components/tab-bar'
import { useDeferredValue } from 'react'

const streamdownComponents = {
  WikiLink,
  FileCard,
  pre: MarkdownPreOverride,
}

function StreamingAssistantResponse({
  content,
}: {
  content: string
}) {
  const deferredContent = useDeferredValue(content)
  const displayContent = deferredContent || content

  return (
    <Message from="assistant">
      <MessageContent>
        <MessageResponse components={streamdownComponents} streaming>{displayContent}</MessageResponse>
      </MessageContent>
    </Message>
  )
}

interface ChatMainPanelProps {
  chatTabs: ChatTab[]
  activeChatTabId: string
  getChatTabStateForRender: (tabId: string) => ChatTabViewState
  hasConversation: boolean
  isProcessing: boolean
  isStopping: boolean
  handleStop: () => void
  handlePromptSubmit: (message: PromptInputMessage, mentions?: FileMention[], attachments?: StagedAttachment[]) => void
  knowledgeFiles: string[]
  recentWikiFiles: string[]
  visibleKnowledgeFiles: string[]
  presetMessage?: string
  onSelectSuggestion: (value: string) => void
  onPresetMessageConsumed: () => void
  setChatDraftForTab: (tabId: string, text: string) => void
  isToolOpenForTab: (tabId: string, toolId: string) => boolean
  setToolOpenForTab: (tabId: string, toolId: string, open: boolean) => void
  handlePermissionResponse: (toolCallId: string, subflow: string[], response: PermissionResponse, scope?: 'once' | 'session' | 'always') => void
  handleAskHumanResponse: (toolCallId: string, subflow: string[], response: string) => void
  navigateToFile: (path: string) => void
}

function renderConversationItem(
  item: ConversationItem,
  tabId: string,
  handlers: Pick<ChatMainPanelProps, 'handlePermissionResponse' | 'handleAskHumanResponse' | 'isToolOpenForTab' | 'setToolOpenForTab'>,
) {
  if (isChatMessage(item)) {
    if (item.role === 'user') {
      if (item.attachments && item.attachments.length > 0) {
        return (
          <Message key={item.id} from={item.role}>
            <MessageContent className="group-[.is-user]:bg-transparent group-[.is-user]:px-0 group-[.is-user]:py-0 group-[.is-user]:rounded-none">
              <ChatMessageAttachments attachments={item.attachments} />
            </MessageContent>
            {item.content && (
              <MessageContent>{item.content}</MessageContent>
            )}
          </Message>
        )
      }

      const { message, files } = parseAttachedFiles(item.content)
      return (
        <Message key={item.id} from={item.role}>
          <MessageContent>
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((filePath, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                  >
                    @{wikiLabel(filePath)}
                  </span>
                ))}
              </div>
            )}
            {message}
          </MessageContent>
        </Message>
      )
    }

    return (
      <Message key={item.id} from={item.role}>
        <MessageContent>
          <MessageResponse components={streamdownComponents}>{item.content}</MessageResponse>
        </MessageContent>
      </Message>
    )
  }

  if (isToolCall(item)) {
    const webSearchData = getWebSearchCardData(item)
    if (webSearchData) {
      return (
        <WebSearchResult
          key={item.id}
          query={webSearchData.query}
          results={webSearchData.results}
          status={item.status}
          title={webSearchData.title}
        />
      )
    }

    const errorText = item.status === 'error' ? 'Tool error' : ''
    const output = normalizeToolOutput(item.result, item.status)
    const input = normalizeToolInput(item.input)

    return (
      <Tool
        key={item.id}
        open={handlers.isToolOpenForTab(tabId, item.id)}
        onOpenChange={(open) => handlers.setToolOpenForTab(tabId, item.id, open)}
      >
        <ToolHeader
          title={item.name}
          type={`tool-${item.name}`}
          state={toToolState(item.status)}
        />
        <ToolContent>
          <ToolInput input={input} />
          {output !== null ? (
            <ToolOutput output={output} errorText={errorText} />
          ) : null}
        </ToolContent>
      </Tool>
    )
  }

  if (isErrorMessage(item)) {
    return (
      <Message key={item.id} from="assistant">
        <MessageContent className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
          <pre className="whitespace-pre-wrap font-mono text-xs">{item.message}</pre>
        </MessageContent>
      </Message>
    )
  }

  return null
}

export function ChatMainPanel({
  chatTabs,
  activeChatTabId,
  getChatTabStateForRender,
  hasConversation,
  isProcessing,
  isStopping,
  handleStop,
  handlePromptSubmit,
  knowledgeFiles,
  recentWikiFiles,
  visibleKnowledgeFiles,
  presetMessage,
  onSelectSuggestion,
  onPresetMessageConsumed,
  setChatDraftForTab,
  isToolOpenForTab,
  setToolOpenForTab,
  handlePermissionResponse,
  handleAskHumanResponse,
  navigateToFile,
}: ChatMainPanelProps) {
  return (
    <FileCardProvider onOpenKnowledgeFile={(path) => { navigateToFile(path) }}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {chatTabs.map((tab) => {
            const isActive = tab.id === activeChatTabId
            const tabState = getChatTabStateForRender(tab.id)
            const tabHasConversation = tabState.conversation.length > 0 || tabState.currentAssistantMessage
            const tabConversationContentClassName = tabHasConversation
              ? 'mx-auto w-full max-w-4xl pb-28'
              : 'mx-auto w-full max-w-4xl min-h-full items-center justify-center pb-0'

            return (
              <div
                key={tab.id}
                className={cn(
                  'min-h-0 h-full flex-col',
                  isActive
                    ? 'flex'
                    : 'pointer-events-none invisible absolute inset-0 flex',
                )}
                data-chat-tab-panel={tab.id}
                aria-hidden={!isActive}
              >
                <Conversation className="relative flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                  <ScrollPositionPreserver />
                  <ConversationContent className={tabConversationContentClassName}>
                    {!tabHasConversation ? (
                      <ConversationEmptyState className="h-auto">
                        <div className="text-2xl font-semibold tracking-tight text-foreground/80 sm:text-3xl md:text-4xl">
                          What are we working on?
                        </div>
                      </ConversationEmptyState>
                    ) : (
                      <>
                        {tabState.conversation.map((item) => {
                          const rendered = renderConversationItem(item, tab.id, {
                            handlePermissionResponse,
                            handleAskHumanResponse,
                            isToolOpenForTab,
                            setToolOpenForTab,
                          })

                          if (isToolCall(item)) {
                            const permRequest = tabState.allPermissionRequests.get(item.id)
                            if (permRequest) {
                              const response = tabState.permissionResponses.get(item.id) || null
                              return (
                                <div key={item.id} className="contents">
                                  {rendered}
                                  <PermissionRequest
                                    toolCall={permRequest.toolCall}
                                    onApprove={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'approve')}
                                    onApproveSession={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'approve', 'session')}
                                    onApproveAlways={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'approve', 'always')}
                                    onDeny={() => handlePermissionResponse(permRequest.toolCall.toolCallId, permRequest.subflow, 'deny')}
                                    isProcessing={isActive && isProcessing}
                                    response={response}
                                  />
                                </div>
                              )
                            }
                          }

                          return rendered
                        })}

                        {Array.from(tabState.pendingAskHumanRequests.values()).map((request) => (
                          <AskHumanRequest
                            key={request.toolCallId}
                            query={request.query}
                            onResponse={(response) => handleAskHumanResponse(request.toolCallId, request.subflow, response)}
                            isProcessing={isActive && isProcessing}
                          />
                        ))}

                        {tabState.currentAssistantMessage && (
                          <StreamingAssistantResponse content={tabState.currentAssistantMessage} />
                        )}

                        {isActive && isProcessing && !tabState.currentAssistantMessage && (
                          <Message from="assistant">
                            <MessageContent>
                              <Shimmer duration={1}>Thinking...</Shimmer>
                            </MessageContent>
                          </Message>
                        )}
                      </>
                    )}
                  </ConversationContent>
                </Conversation>
              </div>
            )
          })}
        </div>

        <div className="sticky bottom-0 z-10 bg-background pb-12 pt-0 shadow-lg">
          <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-t from-background to-transparent" />
          <div className="mx-auto w-full max-w-4xl px-4">
            {!hasConversation && (
              <Suggestions onSelect={onSelectSuggestion} className="mb-3 justify-center" />
            )}
            {chatTabs.map((tab) => {
              const isActive = tab.id === activeChatTabId
              const tabState = getChatTabStateForRender(tab.id)

              return (
                <div
                  key={tab.id}
                  className={isActive ? 'block' : 'hidden'}
                  data-chat-input-panel={tab.id}
                  aria-hidden={!isActive}
                >
                  <ChatInputWithMentions
                    knowledgeFiles={knowledgeFiles}
                    recentFiles={recentWikiFiles}
                    visibleFiles={visibleKnowledgeFiles}
                    onSubmit={handlePromptSubmit}
                    onStop={handleStop}
                    isProcessing={isActive && isProcessing}
                    isStopping={isActive && isStopping}
                    isActive={isActive}
                    presetMessage={isActive ? presetMessage : undefined}
                    onPresetMessageConsumed={isActive ? onPresetMessageConsumed : undefined}
                    runId={tabState.runId}
                    initialDraft={undefined}
                    onDraftChange={(text) => setChatDraftForTab(tab.id, text)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </FileCardProvider>
  )
}
