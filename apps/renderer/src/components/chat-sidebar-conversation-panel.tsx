import React from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ScrollPositionPreserver,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
} from '@/components/ai-elements/message'
import { AskHumanRequest } from '@/components/ai-elements/ask-human-request'
import { PermissionRequest } from '@/components/ai-elements/permission-request'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { ChatTurnGroup } from '@/components/chat-turn-group'
import {
  groupConversationRenderBlocks,
  isToolCall,
  type ChatTabViewState,
  type ConversationItem,
  type PermissionResponse,
} from '@/lib/chat-conversation'

type RenderConversationItem = (item: ConversationItem, tabId: string) => React.ReactNode

type ChatSidebarConversationPanelProps = {
  tabId: string
  isActive: boolean
  tabState: ChatTabViewState
  isProcessing: boolean
  processingStatusText: string
  renderConversationItem: RenderConversationItem
  onPermissionResponse?: (
    toolCallId: string,
    subflow: string[],
    response: PermissionResponse,
    scope?: 'once' | 'session' | 'always',
  ) => void
  onAskHumanResponse?: (
    toolCallId: string,
    subflow: string[],
    response: string,
  ) => void
}

export function ChatSidebarConversationPanel({
  tabId,
  isActive,
  tabState,
  isProcessing,
  processingStatusText,
  renderConversationItem,
  onPermissionResponse,
  onAskHumanResponse,
}: ChatSidebarConversationPanelProps) {
  const tabHasConversation =
    tabState.conversation.length > 0 || Boolean(tabState.currentAssistantMessage)
  const renderBlocks = React.useMemo(
    () => groupConversationRenderBlocks(tabState.conversation),
    [tabState.conversation],
  )

  return (
    <div
      className={
        isActive
          ? 'flex h-full min-h-0 flex-col'
          : 'pointer-events-none invisible absolute inset-0 flex h-full min-h-0 flex-col'
      }
      data-chat-tab-panel={tabId}
      aria-hidden={!isActive}
    >
      <Conversation className="relative flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <ScrollPositionPreserver />
        <ConversationContent
          className={
            tabHasConversation
              ? 'mx-auto w-full max-w-4xl px-3 pb-28'
              : 'mx-auto min-h-full w-full max-w-4xl items-center justify-center px-3 pb-0'
          }
        >
          {!tabHasConversation ? (
            <ConversationEmptyState className="h-auto">
              <div className="text-sm text-muted-foreground">Ask anything...</div>
            </ConversationEmptyState>
          ) : (
            <>
              {renderBlocks.map((block) => {
                if (block.kind === 'item') {
                  const item = block.item
                  const rendered = renderConversationItem(item, tabId)
                  if (isToolCall(item) && onPermissionResponse) {
                    const permRequest = tabState.allPermissionRequests.get(item.id)
                    if (permRequest) {
                      const response = tabState.permissionResponses.get(item.id) || null
                      return (
                        <React.Fragment key={item.id}>
                          {rendered}
                          <PermissionRequest
                            toolCall={permRequest.toolCall}
                            onApprove={() =>
                              onPermissionResponse(
                                permRequest.toolCall.toolCallId,
                                permRequest.subflow,
                                'approve',
                              )
                            }
                            onApproveSession={() =>
                              onPermissionResponse(
                                permRequest.toolCall.toolCallId,
                                permRequest.subflow,
                                'approve',
                                'session',
                              )
                            }
                            onApproveAlways={() =>
                              onPermissionResponse(
                                permRequest.toolCall.toolCallId,
                                permRequest.subflow,
                                'approve',
                                'always',
                              )
                            }
                            onDeny={() =>
                              onPermissionResponse(
                                permRequest.toolCall.toolCallId,
                                permRequest.subflow,
                                'deny',
                              )
                            }
                            isProcessing={isActive && isProcessing}
                            response={response}
                          />
                        </React.Fragment>
                      )
                    }
                  }
                  return <React.Fragment key={block.key}>{rendered}</React.Fragment>
                }

                return (
                  <ChatTurnGroup
                    key={block.key}
                    summary={block.summary}
                    defaultOpen={block.defaultOpen}
                  >
                    {block.items.map((item) => {
                      const rendered = renderConversationItem(item, tabId)
                      if (isToolCall(item) && onPermissionResponse) {
                        const permRequest = tabState.allPermissionRequests.get(item.id)
                        if (permRequest) {
                          const response = tabState.permissionResponses.get(item.id) || null
                          return (
                            <React.Fragment key={item.id}>
                              {rendered}
                              <PermissionRequest
                                toolCall={permRequest.toolCall}
                                onApprove={() =>
                                  onPermissionResponse(
                                    permRequest.toolCall.toolCallId,
                                    permRequest.subflow,
                                    'approve',
                                  )
                                }
                                onApproveSession={() =>
                                  onPermissionResponse(
                                    permRequest.toolCall.toolCallId,
                                    permRequest.subflow,
                                    'approve',
                                    'session',
                                  )
                                }
                                onApproveAlways={() =>
                                  onPermissionResponse(
                                    permRequest.toolCall.toolCallId,
                                    permRequest.subflow,
                                    'approve',
                                    'always',
                                  )
                                }
                                onDeny={() =>
                                  onPermissionResponse(
                                    permRequest.toolCall.toolCallId,
                                    permRequest.subflow,
                                    'deny',
                                  )
                                }
                                isProcessing={isActive && isProcessing}
                                response={response}
                              />
                            </React.Fragment>
                          )
                        }
                      }
                      return <React.Fragment key={item.id}>{rendered}</React.Fragment>
                    })}
                  </ChatTurnGroup>
                )
              })}

              {onAskHumanResponse &&
                Array.from(tabState.pendingAskHumanRequests.values()).map((request) => (
                  <AskHumanRequest
                    key={request.toolCallId}
                    query={request.query}
                    onResponse={(response) =>
                      onAskHumanResponse(request.toolCallId, request.subflow, response)
                    }
                    isProcessing={isActive && isProcessing}
                  />
                ))}

              {isActive && isProcessing && (
                <Message from="assistant">
                  <MessageContent>
                    <Shimmer duration={1}>{processingStatusText}</Shimmer>
                  </MessageContent>
                </Message>
              )}
            </>
          )}
        </ConversationContent>
      </Conversation>
    </div>
  )
}
