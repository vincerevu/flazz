import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LanguageModelUsage, ToolUIPart } from 'ai'
import z from 'zod'
import { AskHumanRequestEvent, ListRunsResponse, RunEvent, ToolPermissionRequestEvent } from '@flazz/shared/src/runs.js'
import type { PromptInputMessage, FileMention } from '@/components/ai-elements/prompt-input'
import type { StagedAttachment } from '@/components/chat-input-with-mentions'
import {
  type ChatMessage,
  type ChatTabViewState,
  type ConversationItem,
  type ToolCall,
  inferRunTitleFromMessage,
  isToolCall,
  normalizeToolInput,
} from '@/lib/chat-conversation'
import { toast } from 'sonner'

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
  pendingAskHumanRequests: Map<string, z.infer<typeof AskHumanRequestEvent>>
  allPermissionRequests: Map<string, z.infer<typeof ToolPermissionRequestEvent>>
  permissionResponses: Map<string, PermissionResponse>
}

type RunRecord = {
  log: RunEventType[]
}

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
      case 'llm-stream-event':
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
    allPermissionRequests,
    permissionResponses,
    pendingAskHumanRequests,
  }
}

export function useChatRuntime({
  agentId,
  onActiveTabRunIdChange,
}: UseChatRuntimeParams) {
  const [runs, setRuns] = useState<ChatRunListItem[]>([])
  const [conversation, setConversation] = useState<ConversationItem[]>([])
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('')
  const [, setModelUsage] = useState<LanguageModelUsage | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const runIdRef = useRef<string | null>(null)
  const loadRunRequestIdRef = useRef(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingRunIds, setProcessingRunIds] = useState<Set<string>>(new Set())
  const processingRunIdsRef = useRef<Set<string>>(new Set())
  const streamingBuffersRef = useRef<Map<string, { assistant: string }>>(new Map())
  const [isStopping, setIsStopping] = useState(false)
  const [stopClickedAt, setStopClickedAt] = useState<number | null>(null)
  const [, setMessage] = useState('')
  const [pendingPermissionRequests, setPendingPermissionRequests] = useState<Map<string, z.infer<typeof ToolPermissionRequestEvent>>>(new Map())
  const [pendingAskHumanRequests, setPendingAskHumanRequests] = useState<Map<string, z.infer<typeof AskHumanRequestEvent>>>(new Map())
  const [allPermissionRequests, setAllPermissionRequests] = useState<Map<string, z.infer<typeof ToolPermissionRequestEvent>>>(new Map())
  const [permissionResponses, setPermissionResponses] = useState<Map<string, PermissionResponse>>(new Map())

  useEffect(() => {
    runIdRef.current = runId
  }, [runId])

  useEffect(() => {
    processingRunIdsRef.current = processingRunIds
  }, [processingRunIds])

  const loadRuns = useCallback(async () => {
    try {
      const allRuns: ChatRunListItem[] = []
      let cursor: string | undefined = undefined
      do {
        const result: ListRunsResponseType = await window.ipc.invoke('runs:list', { cursor })
        allRuns.push(...result.runs)
        cursor = result.nextCursor
      } while (cursor)
      setRuns(allRuns.filter((run) => run.agentId === agentId))
    } catch (err) {
      console.error('Failed to load runs:', err)
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
      const run = await window.ipc.invoke('runs:fetch', { runId: id }) as RunRecord
      if (loadRunRequestIdRef.current !== requestId) return

      const parsed = hydrateRunConversation(run)
      if (loadRunRequestIdRef.current !== requestId) return

      setConversation(parsed.conversation)
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
        setModelUsage(null)
        break

      case 'run-processing-end':
        setProcessingRunIds((prev) => {
          const next = new Set(prev)
          next.delete(event.runId)
          return next
        })
        void loadRuns()
        clearStreamingBuffer(event.runId)
        if (!isActiveRun) return
        setIsProcessing(false)
        setIsStopping(false)
        setStopClickedAt(null)
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
          appendStreamingBuffer(event.runId, llmEvent.delta)
          setCurrentAssistantMessage((prev) => prev + llmEvent.delta)
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
          }
        }
        break
      }

      case 'message': {
        const msg = event.message
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
          setCurrentAssistantMessage((currentMsg) => {
            if (currentMsg) {
              setConversation((prev) => {
                const exists = prev.some((item) =>
                  item.id === event.messageId && 'role' in item && item.role === 'assistant'
                )
                if (exists) return prev
                return [...prev, {
                  id: event.messageId,
                  role: 'assistant',
                  content: currentMsg,
                  timestamp: Date.now(),
                }]
              })
            }
            return ''
          })
          clearStreamingBuffer(event.runId)
        }
        break
      }

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
        setPendingAskHumanRequests((prev) => {
          const next = new Map(prev)
          next.set(event.toolCallId, event)
          return next
        })
        break

      case 'ask-human-response':
        if (!isActiveRun) return
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
        setIsProcessing(false)
        setIsStopping(false)
        setStopClickedAt(null)
        setPendingPermissionRequests(new Map())
        setPendingAskHumanRequests(new Map())
        setCurrentAssistantMessage((currentMsg) => {
          if (currentMsg) {
            setConversation((prev) => [...prev, {
              id: `assistant-stopped-${Date.now()}`,
              role: 'assistant',
              content: currentMsg,
              timestamp: Date.now(),
            }])
          }
          return ''
        })
        break

      case 'error':
        setProcessingRunIds((prev) => {
          const next = new Set(prev)
          next.delete(event.runId)
          return next
        })
        clearStreamingBuffer(event.runId)
        if (!isActiveRun) return
        setIsProcessing(false)
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
  }, [appendStreamingBuffer, clearStreamingBuffer, loadRuns])

  useEffect(() => {
    const cleanup = window.ipc.on('runs:events', ((event: unknown) => {
      handleRunEvent(event as RunEventType)
    }) as (event: null) => void)
    return cleanup
  }, [handleRunEvent])

  useEffect(() => {
    if (!runId) {
      setIsProcessing(false)
      setIsStopping(false)
      setStopClickedAt(null)
      setCurrentAssistantMessage('')
      return
    }
    const isRunProcessing = processingRunIds.has(runId)
    setIsProcessing(isRunProcessing)
    if (isRunProcessing) {
      const buffer = streamingBuffersRef.current.get(runId)
      setCurrentAssistantMessage(buffer?.assistant ?? '')
    } else {
      setIsStopping(false)
      setStopClickedAt(null)
      setCurrentAssistantMessage('')
      streamingBuffersRef.current.delete(runId)
    }
  }, [runId, processingRunIds])

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
        const run = await window.ipc.invoke('runs:create', { agentId }) as { id: string; createdAt: string }
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
        await window.ipc.invoke('runs:createMessage', {
          runId: currentRunId,
          message: attachmentPayload,
        })
      } else {
        let formattedMessage = userMessage
        if (mentions && mentions.length > 0) {
          const attachedFiles = await Promise.all(
            mentions.map(async (mention) => {
              try {
                const result = await window.ipc.invoke('workspace:readFile', { path: mention.path })
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

        await window.ipc.invoke('runs:createMessage', {
          runId: currentRunId,
          message: formattedMessage,
        })

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
      await window.ipc.invoke('runs:stop', { runId, force: isForce })
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
      await window.ipc.invoke('runs:authorizePermission', {
        runId,
        authorization: { subflow, toolCallId, response, scope }
      })
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
      await window.ipc.invoke('runs:provideHumanInput', {
        runId,
        reply: { subflow, toolCallId, response }
      })
    } catch (error) {
      console.error('Failed to provide human input:', error)
    }
  }, [runId])

  const restoreChatRuntime = useCallback((snapshot: ChatTabViewState, fallbackRunId: string | null): boolean => {
    if (snapshot.runId !== fallbackRunId) return false

    setRunId(fallbackRunId)
    setConversation(snapshot.conversation)
    setCurrentAssistantMessage(snapshot.currentAssistantMessage)

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
    pendingAskHumanRequests: new Map(pendingAskHumanRequests),
    allPermissionRequests: new Map(allPermissionRequests),
    permissionResponses: new Map(permissionResponses),
  }), [
    runId,
    conversation,
    currentAssistantMessage,
    pendingAskHumanRequests,
    allPermissionRequests,
    permissionResponses,
  ])

  return {
    runs,
    loadRuns,
    runId,
    conversation,
    currentAssistantMessage,
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
