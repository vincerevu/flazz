import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LanguageModelUsage, ToolUIPart } from 'ai'
import z from 'zod'
import { AskHumanRequestEvent, ListRunsResponse, RunEvent, RunStatusEvent, ToolPermissionRequestEvent } from '@flazz/shared/src/runs.js'
import type { PromptInputMessage, FileMention } from '@/components/ai-elements/prompt-input'
import type { StagedAttachment } from '@/components/chat-input-with-mentions'
import {
  type ChatMessage,
  type ChatTabViewState,
  type ConversationItem,
  type ContextCompactionItem,
  type ToolCall,
  inferRunTitleFromMessage,
  isContextCompactionItem,
  isToolCall,
  normalizeToolInput,
} from '@/lib/chat-conversation'
import { toast } from 'sonner'
import { runsIpc } from '@/services/runs-ipc'
import { workspaceIpc } from '@/services/workspace-ipc'

type RunEventType = z.infer<typeof RunEvent>
type ListRunsResponseType = z.infer<typeof ListRunsResponse>

export type ChatRunListItem = {
  id: string
  title?: string
  createdAt: string
  agentId: string
}

type UseChatRuntimeParams = {
  agentId: string
  onActiveTabRunIdChange: (runId: string | null) => void
}

type PermissionResponse = 'approve' | 'deny'

type ChatRuntimeSnapshot = {
  runId: string | null
  conversation: ConversationItem[]
  currentAssistantMessage: string
  runStatus: z.infer<typeof RunStatusEvent> | null
  modelUsage: LanguageModelUsage | null
  modelUsageUpdatedAt: number | null
  pendingAskHumanRequests: Map<string, z.infer<typeof AskHumanRequestEvent>>
  allPermissionRequests: Map<string, z.infer<typeof ToolPermissionRequestEvent>>
  permissionResponses: Map<string, PermissionResponse>
}

type RunRecord = {
  log: RunEventType[]
}

const STREAM_FLUSH_MS = 32
const getStreamingAssistantId = (runId: string) => `assistant-stream-${runId}`
const getCompactionItemId = (compactionId: string) => `context-compaction-${compactionId}`
const getAskHumanRequestMessageId = (toolCallId: string) => `ask-human-request-${toolCallId}`
const getAskHumanResponseMessageId = (toolCallId: string) => `ask-human-response-${toolCallId}`

const replaceCompactionItems = (
  items: ConversationItem[],
  nextItem: ContextCompactionItem
): ConversationItem[] => {
  const withoutCompaction = items.filter((item) => !isContextCompactionItem(item))
  return [...withoutCompaction, nextItem]
}

const buildAskHumanRequestMessage = (
  request: z.infer<typeof AskHumanRequestEvent>
): ChatMessage => ({
  id: getAskHumanRequestMessageId(request.toolCallId),
  role: 'assistant',
  content: request.query,
  timestamp: request.ts ? new Date(request.ts).getTime() : Date.now(),
})

const buildAskHumanResponseMessage = (
  event: { toolCallId: string; response: string; ts?: string }
): ChatMessage => ({
  id: getAskHumanResponseMessageId(event.toolCallId),
  role: 'user',
  content: event.response,
  timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
})

const normalizeUsage = (usage?: Partial<LanguageModelUsage> | null): LanguageModelUsage | null => {
  if (!usage) return null
  const hasNumbers = Object.values(usage).some((value) => typeof value === 'number')
  if (!hasNumbers) return null
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  const reasoningTokens = usage.reasoningTokens ?? 0
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens + reasoningTokens
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    reasoningTokens,
  }
}

const hydrateRunConversation = (run: RunRecord) => {
  const items: ConversationItem[] = []
  const toolCallMap = new Map<string, ToolCall>()
  const compactionMap = new Map<string, ContextCompactionItem>()
  let modelUsage: LanguageModelUsage | null = null
  let modelUsageUpdatedAt: number | null = null

  for (const event of run.log) {
    switch (event.type) {
      case 'message': {
        const msg = event.message
        if (msg.role === 'user' || msg.role === 'assistant') {
          let textContent = ''
          let msgAttachments: ChatMessage['attachments'] = undefined
          if (typeof msg.content === 'string') {
            textContent = msg.content
          } else if (Array.isArray(msg.content)) {
            const contentParts = msg.content as Array<{
              type: string
              text?: string
              path?: string
              filename?: string
              mimeType?: string
              size?: number
              toolCallId?: string
              toolName?: string
              arguments?: ToolUIPart['input']
            }>

            textContent = contentParts
              .filter((part) => part.type === 'text')
              .map((part) => part.text || '')
              .join('')

            const attachmentParts = contentParts.filter((part) => part.type === 'attachment' && part.path)
            if (attachmentParts.length > 0) {
              msgAttachments = attachmentParts.map((part) => ({
                path: part.path!,
                filename: part.filename || part.path!.split('/').pop() || part.path!,
                mimeType: part.mimeType || 'application/octet-stream',
                size: part.size,
              }))
            }

            if (msg.role === 'assistant') {
              for (const part of contentParts) {
                if (part.type === 'tool-call' && part.toolCallId && part.toolName) {
                  const toolCall: ToolCall = {
                    id: part.toolCallId,
                    name: part.toolName,
                    input: normalizeToolInput(part.arguments),
                    status: 'pending',
                    timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
                  }
                  toolCallMap.set(toolCall.id, toolCall)
                  items.push(toolCall)
                }
              }
            }
          }
          if (textContent || msgAttachments) {
            // Skip synthetic messages injected by the runtime (e.g. auto-continue after compaction)
            if (msg.role === 'user' && isSyntheticMessage(msg)) break
            items.push({
              id: event.messageId,
              role: msg.role,
              content: textContent,
              attachments: msgAttachments,
              timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
            })
          }
        }
        break
      }
      case 'tool-invocation': {
        const existingTool = event.toolCallId ? toolCallMap.get(event.toolCallId) : null
        if (existingTool) {
          existingTool.input = normalizeToolInput(event.input)
          existingTool.status = 'running'
        } else {
          const toolCall: ToolCall = {
            id: event.toolCallId || `tool-${Date.now()}-${Math.random()}`,
            name: event.toolName,
            input: normalizeToolInput(event.input),
            status: 'running',
            timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
          }
          toolCallMap.set(toolCall.id, toolCall)
          items.push(toolCall)
        }
        break
      }
      case 'tool-result': {
        const existingTool = event.toolCallId ? toolCallMap.get(event.toolCallId) : null
        if (existingTool) {
          existingTool.result = event.result
          existingTool.status = 'completed'
        }
        break
      }
      case 'error': {
        items.push({
          id: `error-${Date.now()}-${Math.random()}`,
          kind: 'error',
          message: event.error,
          timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
        })
        break
      }
      case 'context-compaction-start': {
        const item: ContextCompactionItem = {
          id: getCompactionItemId(event.compactionId),
          kind: 'context-compaction',
          status: 'running',
          strategy: event.strategy,
          escalated: event.escalated,
          messageCountBefore: event.messageCountBefore,
          estimatedTokensBefore: event.estimatedTokensBefore,
          contextLimit: event.contextLimit,
          usableInputBudget: event.usableInputBudget,
          compactionThreshold: event.compactionThreshold,
          targetThreshold: event.targetThreshold,
          timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
        }
        compactionMap.set(event.compactionId, item)
        items.splice(0, items.length, ...replaceCompactionItems(items, item))
        break
      }
      case 'context-compaction-complete': {
        const next: ContextCompactionItem = {
          id: getCompactionItemId(event.compactionId),
          kind: 'context-compaction',
          status: 'completed',
          strategy: event.strategy,
          escalated: event.escalated,
          provenanceRefs: event.provenanceRefs,
          omittedMessages: event.omittedMessages,
          recentMessages: event.recentMessages,
          messageCountBefore: event.messageCountBefore,
          messageCountAfter: event.messageCountAfter,
          estimatedTokensBefore: event.estimatedTokensBefore,
          estimatedTokensAfter: event.estimatedTokensAfter,
          tokensSaved: event.tokensSaved,
          reductionPercent: event.reductionPercent,
          contextLimit: event.contextLimit,
          usableInputBudget: event.usableInputBudget,
          compactionThreshold: event.compactionThreshold,
          targetThreshold: event.targetThreshold,
          summary: event.summary,
          reused: event.reused,
          timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
        }
        compactionMap.set(event.compactionId, next)
        items.splice(0, items.length, ...replaceCompactionItems(items, next))
        break
      }
      case 'context-compaction-failed': {
        const next: ContextCompactionItem = {
          id: getCompactionItemId(event.compactionId),
          kind: 'context-compaction',
          status: 'failed',
          strategy: event.strategy,
          escalated: event.escalated,
          messageCountBefore: event.messageCountBefore,
          estimatedTokensBefore: event.estimatedTokensBefore,
          contextLimit: event.contextLimit,
          usableInputBudget: event.usableInputBudget,
          compactionThreshold: event.compactionThreshold,
          targetThreshold: event.targetThreshold,
          error: event.error,
          timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
        }
        compactionMap.set(event.compactionId, next)
        items.splice(0, items.length, ...replaceCompactionItems(items, next))
        break
      }
      case 'llm-stream-event':
        if (event.event.type === 'finish-step') {
          modelUsage = normalizeUsage(event.event.usage)
          modelUsageUpdatedAt = event.ts ? new Date(event.ts).getTime() : Date.now()
        }
        break
      case 'usage-update':
        modelUsage = normalizeUsage(event.usage)
        modelUsageUpdatedAt = event.ts ? new Date(event.ts).getTime() : Date.now()
        break
      case 'ask-human-request':
        items.push(buildAskHumanRequestMessage(event))
        break
      case 'ask-human-response':
        items.push(buildAskHumanResponseMessage(event))
        break
    }
  }

  const allPermissionRequests = new Map<string, z.infer<typeof ToolPermissionRequestEvent>>()
  const permissionResponses = new Map<string, PermissionResponse>()
  const askHumanRequests = new Map<string, z.infer<typeof AskHumanRequestEvent>>()
  const respondedAskHumanIds = new Set<string>()

  for (const event of run.log) {
    if (event.type === 'tool-permission-request') {
      allPermissionRequests.set(event.toolCall.toolCallId, event)
    } else if (event.type === 'tool-permission-response') {
      permissionResponses.set(event.toolCallId, event.response)
    } else if (event.type === 'ask-human-request') {
      askHumanRequests.set(event.toolCallId, event)
    } else if (event.type === 'ask-human-response') {
      respondedAskHumanIds.add(event.toolCallId)
    }
  }

  const pendingAskHumanRequests = new Map<string, z.infer<typeof AskHumanRequestEvent>>()
  for (const [id, request] of askHumanRequests.entries()) {
    if (!respondedAskHumanIds.has(id)) {
      pendingAskHumanRequests.set(id, request)
    }
  }

  return {
    conversation: items,
    modelUsage,
    modelUsageUpdatedAt,
    allPermissionRequests,
    permissionResponses,
    pendingAskHumanRequests,
  }
}

const extractMessageText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is { type: string; text?: string } => !!part && typeof part === 'object' && 'type' in part)
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('')
}

/**
 * Returns true if a message was injected synthetically by the runtime
 * (e.g. auto-continue after context compaction). These should not be
 * shown in the conversation UI.
 */
const isSyntheticMessage = (msg: { role: string; providerOptions?: unknown }): boolean => {
  if (msg.role !== 'user') return false
  const opts = msg.providerOptions as Record<string, unknown> | undefined
  const flazz = opts?.['flazz'] as Record<string, unknown> | undefined
  return flazz?.['autoContinue'] === true || flazz?.['synthetic'] === true
}

export function useChatRuntime({
  agentId,
  onActiveTabRunIdChange,
}: UseChatRuntimeParams) {
  const [runs, setRuns] = useState<ChatRunListItem[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [conversation, setConversation] = useState<ConversationItem[]>([])
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('')
  const currentAssistantMessageRef = useRef('')
  const loadRunsRequestIdRef = useRef(0)
  const runsRef = useRef<ChatRunListItem[]>([])
  const [modelUsage, setModelUsage] = useState<LanguageModelUsage | null>(null)
  const [modelUsageUpdatedAt, setModelUsageUpdatedAt] = useState<number | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const runIdRef = useRef<string | null>(null)
  const loadRunRequestIdRef = useRef(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [runStatus, setRunStatus] = useState<z.infer<typeof RunStatusEvent> | null>(null)
  const [processingRunIds, setProcessingRunIds] = useState<Set<string>>(new Set())
  const processingRunIdsRef = useRef<Set<string>>(new Set())
  const streamingBuffersRef = useRef<Map<string, { assistant: string }>>(new Map())
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamFlushFrameRef = useRef<number | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const [stopClickedAt, setStopClickedAt] = useState<number | null>(null)
  const [, setMessage] = useState('')
  const [pendingPermissionRequests, setPendingPermissionRequests] = useState<Map<string, z.infer<typeof ToolPermissionRequestEvent>>>(new Map())
  const [pendingAskHumanRequests, setPendingAskHumanRequests] = useState<Map<string, z.infer<typeof AskHumanRequestEvent>>>(new Map())
  const [allPermissionRequests, setAllPermissionRequests] = useState<Map<string, z.infer<typeof ToolPermissionRequestEvent>>>(new Map())
  const [permissionResponses, setPermissionResponses] = useState<Map<string, PermissionResponse>>(new Map())

  const removeStreamingAssistant = useCallback((targetRunId: string) => {
    if (targetRunId !== runIdRef.current) return
    setCurrentAssistantMessage('')
  }, [])

  const syncStreamingAssistant = useCallback((targetRunId: string, content: string) => {
    if (targetRunId !== runIdRef.current) return
    const nextContent = content.trim() ? content : ''
    startTransition(() => {
      setCurrentAssistantMessage((prev) => (prev === nextContent ? prev : nextContent))
    })
  }, [])

  const commitAssistantDraft = useCallback((
    draftMessageId?: string,
    targetRunId?: string | null,
    finalContent?: string,
  ) => {
    const resolvedRunId = targetRunId ?? runIdRef.current
    if (!resolvedRunId) {
      setCurrentAssistantMessage('')
      return
    }

    const streamingId = getStreamingAssistantId(resolvedRunId)
    setConversation((prev) => {
      const existingDraftIndex = prev.findIndex((item) => item.id === streamingId && 'role' in item && item.role === 'assistant')
      const existingDraft = existingDraftIndex >= 0 ? prev[existingDraftIndex] : null
      const bufferedContent = streamingBuffersRef.current.get(resolvedRunId)?.assistant ?? ''
      const content = finalContent
        ?? bufferedContent
        ?? currentAssistantMessageRef.current
        ?? (existingDraft && 'role' in existingDraft && existingDraft.role === 'assistant' ? existingDraft.content : '')
      const nextId = draftMessageId ?? `assistant-${Date.now()}`
      const base = existingDraftIndex >= 0
        ? [...prev.slice(0, existingDraftIndex), ...prev.slice(existingDraftIndex + 1)]
        : prev
      const normalizedContent = content.trim()

      if (!normalizedContent) return base

      const existingCommittedIndex = base.findIndex((item) => item.id === nextId && 'role' in item && item.role === 'assistant')
      const committedMessage: ChatMessage = {
        id: nextId,
        role: 'assistant',
        content,
        timestamp: existingDraft && 'timestamp' in existingDraft ? existingDraft.timestamp : Date.now(),
      }

      if (existingCommittedIndex !== -1) {
        const next = [...base]
        next[existingCommittedIndex] = committedMessage
        return next
      }

      return [...base, committedMessage]
    })
    setCurrentAssistantMessage('')
  }, [])

  useEffect(() => {
    runIdRef.current = runId
  }, [runId])

  useEffect(() => {
    currentAssistantMessageRef.current = currentAssistantMessage
  }, [currentAssistantMessage])

  useEffect(() => {
    runsRef.current = runs
  }, [runs])

  useEffect(() => {
    processingRunIdsRef.current = processingRunIds
  }, [processingRunIds])

  const loadRuns = useCallback(async () => {
    const requestId = ++loadRunsRequestIdRef.current
    const shouldShowLoadingState = runsRef.current.length === 0
    if (shouldShowLoadingState) {
      setRunsLoading(true)
    }
    try {
      const firstPage: ListRunsResponseType = await runsIpc.list({ runType: 'chat' })
      if (loadRunsRequestIdRef.current !== requestId) return

      const allRuns: ChatRunListItem[] = [...firstPage.runs]
      let filteredRuns = allRuns.filter((run) => run.agentId === agentId)
      let cursor = firstPage.nextCursor

      while (cursor && filteredRuns.length === 0) {
        const result: ListRunsResponseType = await runsIpc.list({ cursor, runType: 'chat' })
        if (loadRunsRequestIdRef.current !== requestId) return
        allRuns.push(...result.runs)
        filteredRuns = allRuns.filter((run) => run.agentId === agentId)
        cursor = result.nextCursor
      }

      setRuns(filteredRuns)
      if (shouldShowLoadingState) {
        setRunsLoading(false)
      }

      if (!cursor) {
        return
      }

      filteredRuns = allRuns.filter((run) => run.agentId === agentId)
      setRuns(filteredRuns)

      while (cursor) {
        const result: ListRunsResponseType = await runsIpc.list({ cursor, runType: 'chat' })
        if (loadRunsRequestIdRef.current !== requestId) return
        allRuns.push(...result.runs)
        filteredRuns = allRuns.filter((run) => run.agentId === agentId)
        setRuns(filteredRuns)
        cursor = result.nextCursor
      }
    } catch (err) {
      console.error('Failed to load runs:', err)
    } finally {
      if (shouldShowLoadingState && loadRunsRequestIdRef.current === requestId) {
        setRunsLoading(false)
      }
    }
  }, [agentId])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  const resetChatRuntime = useCallback(() => {
    loadRunRequestIdRef.current += 1
    setConversation([])
    setCurrentAssistantMessage('')
    setRunId(null)
    setMessage('')
    setModelUsage(null)
    setModelUsageUpdatedAt(null)
    setRunStatus(null)
    setIsProcessing(false)
    setPendingPermissionRequests(new Map())
    setPendingAskHumanRequests(new Map())
    setAllPermissionRequests(new Map())
    setPermissionResponses(new Map())
    setIsStopping(false)
    setStopClickedAt(null)
  }, [])

  const cancelPendingRunLoads = useCallback(() => {
    loadRunRequestIdRef.current += 1
  }, [])

  const loadRun = useCallback(async (id: string) => {
    const requestId = (loadRunRequestIdRef.current += 1)
    try {
      const run = await runsIpc.fetch(id) as RunRecord
      if (loadRunRequestIdRef.current !== requestId) return

      const parsed = hydrateRunConversation(run)
      if (loadRunRequestIdRef.current !== requestId) return

      setConversation(parsed.conversation)
      setModelUsage(parsed.modelUsage)
      setModelUsageUpdatedAt(parsed.modelUsageUpdatedAt)
      setRunId(id)
      setMessage('')
      setPendingPermissionRequests(
        new Map(
          Array.from(parsed.allPermissionRequests.entries()).filter(([toolCallId]) => !parsed.permissionResponses.has(toolCallId))
        )
      )
      setPendingAskHumanRequests(parsed.pendingAskHumanRequests)
      setAllPermissionRequests(parsed.allPermissionRequests)
      setPermissionResponses(parsed.permissionResponses)
    } catch (err) {
      console.error('Failed to load run:', err)
      if (loadRunRequestIdRef.current !== requestId) return
      setRunId(id)
      setConversation([{
        id: `error-load-${Date.now()}`,
        kind: 'error',
        message: 'Failed to open this chat history. Flazz skipped corrupted legacy events where possible, but this run still could not be loaded.',
        timestamp: Date.now(),
      }])
      setModelUsage(null)
      setModelUsageUpdatedAt(null)
      setMessage('')
      setPendingPermissionRequests(new Map())
      setPendingAskHumanRequests(new Map())
      setAllPermissionRequests(new Map())
      setPermissionResponses(new Map())
      toast.error('Failed to open this chat history')
    }
  }, [])

  const getStreamingBuffer = useCallback((id: string) => {
    const existing = streamingBuffersRef.current.get(id)
    if (existing) return existing
    const next = { assistant: '' }
    streamingBuffersRef.current.set(id, next)
    return next
  }, [])

  const appendStreamingBuffer = useCallback((id: string, delta: string) => {
    if (!delta) return
    const buffer = getStreamingBuffer(id)
    buffer.assistant += delta
  }, [getStreamingBuffer])

  const clearStreamingBuffer = useCallback((id: string) => {
    streamingBuffersRef.current.delete(id)
  }, [])

  const flushStreamingAssistant = useCallback((targetRunId?: string | null) => {
    const nextRunId = targetRunId ?? runIdRef.current
    if (!nextRunId || nextRunId !== runIdRef.current) return
    const nextText = streamingBuffersRef.current.get(nextRunId)?.assistant ?? ''
    syncStreamingAssistant(nextRunId, nextText)
  }, [syncStreamingAssistant])

  const scheduleStreamingAssistantFlush = useCallback((targetRunId?: string | null) => {
    if (streamFlushTimerRef.current || streamFlushFrameRef.current !== null) return
    streamFlushTimerRef.current = setTimeout(() => {
      streamFlushTimerRef.current = null
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        streamFlushFrameRef.current = window.requestAnimationFrame(() => {
          streamFlushFrameRef.current = null
          flushStreamingAssistant(targetRunId)
        })
        return
      }
      flushStreamingAssistant(targetRunId)
    }, STREAM_FLUSH_MS)
  }, [flushStreamingAssistant])

  const cancelStreamingAssistantFlush = useCallback(() => {
    if (streamFlushFrameRef.current !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(streamFlushFrameRef.current)
      streamFlushFrameRef.current = null
    }
    if (!streamFlushTimerRef.current) return
    clearTimeout(streamFlushTimerRef.current)
    streamFlushTimerRef.current = null
  }, [])

  const handleRunEvent = useCallback((event: RunEventType) => {
    const activeRunId = runIdRef.current
    const isActiveRun = event.runId === activeRunId

    switch (event.type) {
      case 'run-processing-start':
        setProcessingRunIds((prev) => {
          const next = new Set(prev)
          next.add(event.runId)
          return next
        })
        if (!isActiveRun) return
        setIsProcessing(true)
        setRunStatus(null)
        setModelUsage(null)
        break

      case 'run-processing-end':
        setProcessingRunIds((prev) => {
          const next = new Set(prev)
          next.delete(event.runId)
          return next
        })
        if (event.runId === runIdRef.current || runsRef.current.some((run) => run.id === event.runId)) {
          void loadRuns()
        }
        if (isActiveRun) {
          cancelStreamingAssistantFlush()
          flushStreamingAssistant(event.runId)
          commitAssistantDraft(undefined, event.runId)
        }
        clearStreamingBuffer(event.runId)
        if (!isActiveRun) return
        setIsProcessing(false)
        setRunStatus(null)
        setIsStopping(false)
        setStopClickedAt(null)
        setCurrentAssistantMessage('')
        break

      case 'start':
        setProcessingRunIds((prev) => {
          if (prev.has(event.runId)) return prev
          const next = new Set(prev)
          next.add(event.runId)
          return next
        })
        if (!isActiveRun) return
        setIsProcessing(true)
        setRunStatus(null)
        removeStreamingAssistant(event.runId)
        setCurrentAssistantMessage('')
        setModelUsage(null)
        break

      case 'llm-stream-event': {
        const llmEvent = event.event
        setProcessingRunIds((prev) => {
          if (prev.has(event.runId)) return prev
          const next = new Set(prev)
          next.add(event.runId)
          return next
        })
        if (!isActiveRun) {
          if (llmEvent.type === 'text-delta' && llmEvent.delta) {
            appendStreamingBuffer(event.runId, llmEvent.delta)
          }
          return
        }
        setIsProcessing(true)
        if (llmEvent.type === 'text-delta' && llmEvent.delta) {
          setRunStatus(null)
        }
        if (llmEvent.type === 'text-delta' && llmEvent.delta) {
          appendStreamingBuffer(event.runId, llmEvent.delta)
          scheduleStreamingAssistantFlush(event.runId)
        } else if (llmEvent.type === 'start-step') {
          // Multi-step capable providers may emit explicit step boundaries before text begins.
          // Keep the run marked as processing, but no UI mutation is needed yet.
        } else if (llmEvent.type === 'tool-call') {
          setConversation((prev) => [...prev, {
            id: llmEvent.toolCallId || `tool-${Date.now()}`,
            name: llmEvent.toolName || 'tool',
            input: normalizeToolInput(llmEvent.input as ToolUIPart['input']),
            status: 'running',
            timestamp: Date.now(),
          }])
        } else if (llmEvent.type === 'finish-step') {
          const nextUsage = normalizeUsage(llmEvent.usage)
          if (nextUsage) {
            setModelUsage(nextUsage)
            setModelUsageUpdatedAt(event.ts ? new Date(event.ts).getTime() : Date.now())
          }
        }
        break
      }

      case 'run-status':
        if (!isActiveRun) return
        setIsProcessing(true)
        setRunStatus(event)
        break

      case 'context-compaction-start':
        if (!isActiveRun) return
        setRunStatus(null)
        setConversation((prev) => replaceCompactionItems(prev, {
          id: getCompactionItemId(event.compactionId),
          kind: 'context-compaction',
          status: 'running',
          strategy: event.strategy,
          escalated: event.escalated,
          messageCountBefore: event.messageCountBefore,
          estimatedTokensBefore: event.estimatedTokensBefore,
          contextLimit: event.contextLimit,
          usableInputBudget: event.usableInputBudget,
          compactionThreshold: event.compactionThreshold,
          targetThreshold: event.targetThreshold,
          timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
        }))
        break

      case 'context-compaction-complete':
        if (!isActiveRun) return
        setConversation((prev) => replaceCompactionItems(prev, {
          id: getCompactionItemId(event.compactionId),
          kind: 'context-compaction',
          status: 'completed',
          strategy: event.strategy,
          escalated: event.escalated,
          provenanceRefs: event.provenanceRefs,
          omittedMessages: event.omittedMessages,
          recentMessages: event.recentMessages,
          messageCountBefore: event.messageCountBefore,
          messageCountAfter: event.messageCountAfter,
          estimatedTokensBefore: event.estimatedTokensBefore,
          estimatedTokensAfter: event.estimatedTokensAfter,
          tokensSaved: event.tokensSaved,
          reductionPercent: event.reductionPercent,
          contextLimit: event.contextLimit,
          usableInputBudget: event.usableInputBudget,
          compactionThreshold: event.compactionThreshold,
          targetThreshold: event.targetThreshold,
          summary: event.summary,
          reused: event.reused,
          timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
        }))
        break

      case 'context-compaction-failed':
        if (!isActiveRun) return
        setConversation((prev) => replaceCompactionItems(prev, {
          id: getCompactionItemId(event.compactionId),
          kind: 'context-compaction',
          status: 'failed',
          strategy: event.strategy,
          escalated: event.escalated,
          messageCountBefore: event.messageCountBefore,
          estimatedTokensBefore: event.estimatedTokensBefore,
          contextLimit: event.contextLimit,
          usableInputBudget: event.usableInputBudget,
          compactionThreshold: event.compactionThreshold,
          targetThreshold: event.targetThreshold,
          error: event.error,
          timestamp: event.ts ? new Date(event.ts).getTime() : Date.now(),
        }))
        break

      case 'usage-update':
        if (!isActiveRun) return
        setModelUsage(normalizeUsage(event.usage))
        setModelUsageUpdatedAt(event.ts ? new Date(event.ts).getTime() : Date.now())
        break

      case 'message': {
        const msg = event.message
        // Skip synthetic auto-continue messages — they are only for the LLM context.
        if (isSyntheticMessage(msg)) break
        if (msg.role === 'user' && typeof msg.content === 'string') {
          const inferredTitle = inferRunTitleFromMessage(msg.content)
          if (inferredTitle) {
            setRuns((prev) => prev.map((run) => (
              run.id === event.runId && run.title !== inferredTitle
                ? { ...run, title: inferredTitle }
                : run
            )))
          }
        }
        if (!isActiveRun) {
          if (msg.role === 'assistant') {
            clearStreamingBuffer(event.runId)
          }
          return
        }
        if (msg.role === 'assistant') {
          commitAssistantDraft(event.messageId, event.runId, extractMessageText(msg.content))
          clearStreamingBuffer(event.runId)
        }
        break
      }

      // context-pruned: tool output pruning happened; no UI change needed
      // (the compaction event already provides the context window metrics).
      case 'context-pruned':
        break

      case 'tool-invocation':
        if (!isActiveRun) return
        setConversation((prev) => {
          let matched = false
          const parsedInput = normalizeToolInput(event.input)
          const next = prev.map((item) => {
            if (
              isToolCall(item)
              && (event.toolCallId ? item.id === event.toolCallId : item.name === event.toolName)
            ) {
              matched = true
              return { ...item, input: parsedInput, status: 'running' as const }
            }
            return item
          })
          if (!matched) {
            next.push({
              id: event.toolCallId ?? `tool-${Date.now()}`,
              name: event.toolName,
              input: parsedInput,
              status: 'running',
              timestamp: Date.now(),
            })
          }
          return next
        })
        break

      case 'tool-result':
        if (!isActiveRun) return
        setConversation((prev) => {
          let matched = false
          const next = prev.map((item) => {
            if (
              isToolCall(item)
              && (event.toolCallId ? item.id === event.toolCallId : item.name === event.toolName)
            ) {
              matched = true
              return {
                ...item,
                result: event.result as ToolUIPart['output'],
                status: 'completed' as const,
              }
            }
            return item
          })
          if (!matched) {
            next.push({
              id: event.toolCallId ?? `tool-${Date.now()}`,
              name: event.toolName,
              input: {},
              result: event.result as ToolUIPart['output'],
              status: 'completed',
              timestamp: Date.now(),
            })
          }
          return next
        })
        break

      case 'tool-permission-request':
        if (!isActiveRun) return
        setPendingPermissionRequests((prev) => {
          const next = new Map(prev)
          next.set(event.toolCall.toolCallId, event)
          return next
        })
        setAllPermissionRequests((prev) => {
          const next = new Map(prev)
          next.set(event.toolCall.toolCallId, event)
          return next
        })
        break

      case 'tool-permission-response':
        if (!isActiveRun) return
        setPendingPermissionRequests((prev) => {
          const next = new Map(prev)
          next.delete(event.toolCallId)
          return next
        })
        setPermissionResponses((prev) => {
          const next = new Map(prev)
          next.set(event.toolCallId, event.response)
          return next
        })
        break

      case 'ask-human-request':
        if (!isActiveRun) return
        setConversation((prev) => {
          const nextItem = buildAskHumanRequestMessage(event)
          return prev.some((item) => item.id === nextItem.id) ? prev : [...prev, nextItem]
        })
        setPendingAskHumanRequests((prev) => {
          const next = new Map(prev)
          next.set(event.toolCallId, event)
          return next
        })
        break

      case 'ask-human-response':
        if (!isActiveRun) return
        setConversation((prev) => {
          const nextItem = buildAskHumanResponseMessage(event)
          return prev.some((item) => item.id === nextItem.id) ? prev : [...prev, nextItem]
        })
        setPendingAskHumanRequests((prev) => {
          const next = new Map(prev)
          next.delete(event.toolCallId)
          return next
        })
        break

      case 'run-stopped':
        setProcessingRunIds((prev) => {
          const next = new Set(prev)
          next.delete(event.runId)
          return next
        })
        clearStreamingBuffer(event.runId)
        if (!isActiveRun) return
        cancelStreamingAssistantFlush()
        setIsProcessing(false)
        setRunStatus(null)
        setIsStopping(false)
        setStopClickedAt(null)
        setPendingPermissionRequests(new Map())
        setPendingAskHumanRequests(new Map())
        commitAssistantDraft(`assistant-stopped-${Date.now()}`, event.runId)
        break

      case 'error':
        setProcessingRunIds((prev) => {
          const next = new Set(prev)
          next.delete(event.runId)
          return next
        })
        clearStreamingBuffer(event.runId)
        if (!isActiveRun) return
        cancelStreamingAssistantFlush()
        commitAssistantDraft(undefined, event.runId)
        setIsProcessing(false)
        setRunStatus(null)
        setIsStopping(false)
        setStopClickedAt(null)
        setConversation((prev) => [...prev, {
          id: `error-${Date.now()}`,
          kind: 'error',
          message: event.error,
          timestamp: Date.now(),
        }])
        toast.error(event.error.split('\n')[0] || 'Model error')
        console.error('Run error:', event.error)
        break
    }
  }, [
    appendStreamingBuffer,
    cancelStreamingAssistantFlush,
    clearStreamingBuffer,
    commitAssistantDraft,
    flushStreamingAssistant,
    loadRuns,
    scheduleStreamingAssistantFlush,
  ])

  useEffect(() => {
    const cleanup = runsIpc.onEvents(((event: unknown) => {
      handleRunEvent(event as RunEventType)
    }) as (event: null) => void)
    return () => {
      cancelStreamingAssistantFlush()
      cleanup()
    }
  }, [cancelStreamingAssistantFlush, handleRunEvent])

  useEffect(() => {
    if (!runId) {
      setIsProcessing(false)
      setRunStatus(null)
      setIsStopping(false)
      setStopClickedAt(null)
      cancelStreamingAssistantFlush()
      setCurrentAssistantMessage('')
      return
    }
    const isRunProcessing = processingRunIds.has(runId)
    setIsProcessing(isRunProcessing)
    if (isRunProcessing) {
      const buffer = streamingBuffersRef.current.get(runId)
      syncStreamingAssistant(runId, buffer?.assistant ?? '')
    } else {
      setIsStopping(false)
      setRunStatus(null)
      setStopClickedAt(null)
      cancelStreamingAssistantFlush()
      setCurrentAssistantMessage('')
      streamingBuffersRef.current.delete(runId)
      removeStreamingAssistant(runId)
    }
  }, [cancelStreamingAssistantFlush, removeStreamingAssistant, runId, processingRunIds, syncStreamingAssistant])

  const handlePromptSubmit = useCallback(async (
    message: PromptInputMessage,
    mentions?: FileMention[],
    stagedAttachments: StagedAttachment[] = []
  ) => {
    if (isProcessing) return

    const { text } = message
    const userMessage = text.trim()
    const hasAttachments = stagedAttachments.length > 0
    if (!userMessage && !hasAttachments) return

    setMessage('')

    const userMessageId = `user-${Date.now()}`
    const displayAttachments: ChatMessage['attachments'] = hasAttachments
      ? stagedAttachments.map((attachment) => ({
          path: attachment.path,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          thumbnailUrl: attachment.thumbnailUrl,
        }))
      : undefined
    setConversation((prev) => [...prev, {
      id: userMessageId,
      role: 'user',
      content: userMessage,
      attachments: displayAttachments,
      timestamp: Date.now(),
    }])

    try {
      let currentRunId = runId
      let isNewRun = false
      let newRunCreatedAt: string | null = null
      if (!currentRunId) {
        const run = await runsIpc.create(agentId) as { id: string; createdAt: string }
        currentRunId = run.id
        newRunCreatedAt = run.createdAt
        setRunId(currentRunId)
        onActiveTabRunIdChange(currentRunId)
        isNewRun = true
      }

      let titleSource = userMessage

      if (hasAttachments) {
        type ContentPart =
          | { type: 'text'; text: string }
          | { type: 'attachment'; path: string; filename: string; mimeType: string; size?: number }

        const contentParts: ContentPart[] = []

        if (mentions && mentions.length > 0) {
          for (const mention of mentions) {
            contentParts.push({
              type: 'attachment',
              path: mention.path,
              filename: mention.displayName || mention.path.split('/').pop() || mention.path,
              mimeType: 'text/markdown',
            })
          }
        }

        for (const attachment of stagedAttachments) {
          contentParts.push({
            type: 'attachment',
            path: attachment.path,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
          })
        }

        if (userMessage) {
          contentParts.push({ type: 'text', text: userMessage })
        } else {
          titleSource = stagedAttachments[0]?.filename ?? ''
        }

        const attachmentPayload = contentParts as unknown as string
        await runsIpc.createMessage(currentRunId, attachmentPayload)
      } else {
        let formattedMessage = userMessage
        if (mentions && mentions.length > 0) {
          const attachedFiles = await Promise.all(
            mentions.map(async (mention) => {
              try {
              const result = await workspaceIpc.readFile(mention.path)
                return { path: mention.path, content: result.data as string }
              } catch (err) {
                console.error('Failed to read mentioned file:', mention.path, err)
                return { path: mention.path, content: `[Error reading file: ${mention.path}]` }
              }
            })
          )

          if (attachedFiles.length > 0) {
            const filesXml = attachedFiles
              .map((file) => `<file path="${file.path}">\n${file.content}\n</file>`)
              .join('\n')
            formattedMessage = `<attached-files>\n${filesXml}\n</attached-files>\n\n${userMessage}`
          }
        }

        await runsIpc.createMessage(currentRunId, formattedMessage)

        titleSource = formattedMessage
      }

      if (isNewRun) {
        const inferredTitle = inferRunTitleFromMessage(titleSource)
        setRuns((prev) => {
          const withoutCurrent = prev.filter((item) => item.id !== currentRunId)
          return [{
            id: currentRunId!,
            title: inferredTitle,
            createdAt: newRunCreatedAt ?? new Date().toISOString(),
            agentId,
          }, ...withoutCurrent]
        })
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }, [agentId, isProcessing, onActiveTabRunIdChange, runId])

  const handleStop = useCallback(async () => {
    if (!runId) return
    const now = Date.now()
    const isForce = isStopping && stopClickedAt !== null && (now - stopClickedAt) < 2000

    setStopClickedAt(now)
    setIsStopping(true)

    try {
      await runsIpc.stop(runId, isForce)
    } catch (error) {
      console.error('Failed to stop run:', error)
    }
  }, [runId, isStopping, stopClickedAt])

  const handlePermissionResponse = useCallback(async (
    toolCallId: string,
    subflow: string[],
    response: PermissionResponse,
    scope?: 'once' | 'session' | 'always',
  ) => {
    if (!runId) return

    setPermissionResponses((prev) => {
      const next = new Map(prev)
      next.set(toolCallId, response)
      return next
    })
    setPendingPermissionRequests((prev) => {
      const next = new Map(prev)
      next.delete(toolCallId)
      return next
    })

    try {
      await runsIpc.authorizePermission(runId, { subflow, toolCallId, response, scope })
    } catch (error) {
      console.error('Failed to authorize permission:', error)
      setPermissionResponses((prev) => {
        const next = new Map(prev)
        next.delete(toolCallId)
        return next
      })
    }
  }, [runId])

  const handleAskHumanResponse = useCallback(async (toolCallId: string, subflow: string[], response: string) => {
    if (!runId) return
    try {
      await runsIpc.provideHumanInput(runId, { subflow, toolCallId, response })
    } catch (error) {
      console.error('Failed to provide human input:', error)
    }
  }, [runId])

  const restoreChatRuntime = useCallback((snapshot: ChatTabViewState, fallbackRunId: string | null): boolean => {
    if (snapshot.runId !== fallbackRunId) return false

    setRunId(fallbackRunId)
    setConversation(snapshot.conversation)
    setCurrentAssistantMessage(snapshot.currentAssistantMessage)
    setRunStatus(snapshot.runStatus)
    setModelUsage(snapshot.modelUsage)
    setModelUsageUpdatedAt(snapshot.modelUsageUpdatedAt)

    const nextPendingPermissions = new Map<string, z.infer<typeof ToolPermissionRequestEvent>>()
    for (const [toolCallId, request] of snapshot.allPermissionRequests.entries()) {
      if (!snapshot.permissionResponses.has(toolCallId)) {
        nextPendingPermissions.set(toolCallId, request)
      }
    }

    setPendingPermissionRequests(nextPendingPermissions)
    setPendingAskHumanRequests(new Map(snapshot.pendingAskHumanRequests))
    setAllPermissionRequests(new Map(snapshot.allPermissionRequests))
    setPermissionResponses(new Map(snapshot.permissionResponses))
    setIsProcessing(Boolean(fallbackRunId && processingRunIdsRef.current.has(fallbackRunId)))
    return true
  }, [])

  const chatRuntimeSnapshot = useMemo<ChatRuntimeSnapshot>(() => ({
    runId,
    conversation,
    currentAssistantMessage,
    runStatus,
    modelUsage,
    modelUsageUpdatedAt,
    pendingAskHumanRequests: new Map(pendingAskHumanRequests),
    allPermissionRequests: new Map(allPermissionRequests),
    permissionResponses: new Map(permissionResponses),
  }), [
    runId,
    conversation,
    currentAssistantMessage,
    runStatus,
    modelUsage,
    modelUsageUpdatedAt,
    pendingAskHumanRequests,
    allPermissionRequests,
    permissionResponses,
  ])

  return {
    runs,
    runsLoading,
    loadRuns,
    runId,
    conversation,
    currentAssistantMessage,
    modelUsage,
    modelUsageUpdatedAt,
    isProcessing,
    isStopping,
    processingRunIds,
    pendingPermissionRequests,
    pendingAskHumanRequests,
    allPermissionRequests,
    permissionResponses,
    chatRuntimeSnapshot,
    loadRun,
    cancelPendingRunLoads,
    resetChatRuntime,
    restoreChatRuntime,
    handlePromptSubmit,
    handleStop,
    handlePermissionResponse,
    handleAskHumanResponse,
  }
}
