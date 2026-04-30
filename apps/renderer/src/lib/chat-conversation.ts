import type { LanguageModelUsage, ToolUIPart } from 'ai'
import z from 'zod'
import { AskHumanRequestEvent, RunStatusEvent, ToolPermissionRequestEvent } from '@flazz/shared/src/runs.js'

export interface MessageAttachment {
  path: string
  filename: string
  mimeType: string
  size?: number
  thumbnailUrl?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageAttachment[]
  timestamp: number
  streaming?: boolean
}

export interface ToolCall {
  id: string
  name: string
  input: ToolUIPart['input']
  result?: ToolUIPart['output']
  status: 'pending' | 'running' | 'completed' | 'error'
  timestamp: number
}

export interface ErrorMessage {
  id: string
  kind: 'error'
  message: string
  timestamp: number
}

export interface ContextCompactionItem {
  id: string
  kind: 'context-compaction'
  status: 'running' | 'completed' | 'failed'
  strategy: 'summary-window'
  escalated?: boolean
  provenanceRefs?: string[]
  omittedMessages?: number
  recentMessages?: number
  messageCountBefore: number
  messageCountAfter?: number
  estimatedTokensBefore: number
  estimatedTokensAfter?: number
  tokensSaved?: number
  reductionPercent?: number
  contextLimit: number
  usableInputBudget: number
  compactionThreshold: number
  targetThreshold?: number
  summary?: string
  error?: string
  reused?: boolean
  timestamp: number
}

export type ConversationItem = ChatMessage | ToolCall | ErrorMessage | ContextCompactionItem
export type PermissionResponse = 'approve' | 'deny'

export type ConversationRenderBlock =
  | { kind: 'item'; key: string; item: ConversationItem }
  | {
      kind: 'turn'
      key: string
      items: ConversationItem[]
      summary: string
      defaultOpen: boolean
    }

export type ChatTabViewState = {
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

export const createEmptyChatTabViewState = (): ChatTabViewState => ({
  runId: null,
  conversation: [],
  currentAssistantMessage: '',
  runStatus: null,
  modelUsage: null,
  modelUsageUpdatedAt: null,
  pendingAskHumanRequests: new Map(),
  allPermissionRequests: new Map(),
  permissionResponses: new Map(),
})

export type ToolState = 'input-streaming' | 'input-available' | 'output-available' | 'output-error'

export const isChatMessage = (item: ConversationItem): item is ChatMessage => 'role' in item
export const isToolCall = (item: ConversationItem): item is ToolCall => 'name' in item
export const isErrorMessage = (item: ConversationItem): item is ErrorMessage =>
  'kind' in item && item.kind === 'error'
export const isContextCompactionItem = (item: ConversationItem): item is ContextCompactionItem =>
  'kind' in item && item.kind === 'context-compaction'

export const isAuxiliaryConversationItem = (item: ConversationItem): boolean =>
  isToolCall(item) || isErrorMessage(item) || isContextCompactionItem(item)

const isMeaningfulChatMessage = (item: ChatMessage): boolean => {
  if (item.role === 'user') return true
  if (item.attachments && item.attachments.length > 0) return true
  return item.content.trim().length > 0
}

const isVisibleAssistantMessage = (item: ConversationItem): item is ChatMessage =>
  isChatMessage(item) && item.role === 'assistant' && isMeaningfulChatMessage(item)

export const toToolState = (status: ToolCall['status']): ToolState => {
  switch (status) {
    case 'pending':
      return 'input-streaming'
    case 'running':
      return 'input-available'
    case 'completed':
      return 'output-available'
    case 'error':
      return 'output-error'
    default:
      return 'input-available'
  }
}

export const getProcessingStatusText = (state: ChatTabViewState): string => {
  const hasPendingPermission = Array.from(state.allPermissionRequests.keys()).some(
    (toolCallId) => !state.permissionResponses.has(toolCallId)
  )
  if (hasPendingPermission) return 'Waiting for permission...'

  if (state.pendingAskHumanRequests.size > 0) return 'Waiting for your input...'

  const runningCompaction = [...state.conversation].reverse().find(
    (item) => isContextCompactionItem(item) && item.status === 'running'
  )
  if (runningCompaction) return 'Compacting context...'

  if (state.currentAssistantMessage.trim()) return 'Receiving response...'

  if (state.runStatus?.phase === 'checking-context') return 'Thinking...'

  if (state.runStatus?.message) return state.runStatus.message

  const activeTool = [...state.conversation].reverse().find(
    (item): item is ToolCall => isToolCall(item) && (item.status === 'pending' || item.status === 'running')
  )
  if (activeTool) {
    return activeTool.status === 'pending'
      ? `Preparing ${activeTool.name}...`
      : `Running ${activeTool.name}...`
  }

  return 'Thinking...'
}

const formatElapsedDuration = (startMs: number, endMs: number): string | null => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  const totalSeconds = Math.max(1, Math.round((endMs - startMs) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

const isActiveAuxiliaryItem = (item: ConversationItem): boolean => {
  if (isToolCall(item)) return item.status === 'pending' || item.status === 'running'
  if (isContextCompactionItem(item)) return item.status === 'running'
  return false
}

const hasTurnError = (items: ConversationItem[]): boolean =>
  items.some((item) => {
    if (isErrorMessage(item)) return true
    if (isToolCall(item)) return item.status === 'error'
    if (isContextCompactionItem(item)) return item.status === 'failed'
    return false
  })

export const summarizeConversationTurn = (
  items: ConversationItem[],
  nextItem?: ConversationItem,
): string => {
  const firstTimestamp = items[0]?.timestamp ?? 0
  const lastTimestamp = nextItem?.timestamp ?? items[items.length - 1]?.timestamp ?? firstTimestamp
  const duration = formatElapsedDuration(firstTimestamp, lastTimestamp)
  const failed = hasTurnError(items)
  if (failed) return duration ? `Failed after ${duration}` : 'Failed'
  return duration ? `Worked for ${duration}` : 'Worked'
}

export const groupConversationRenderBlocks = (
  items: ConversationItem[],
  options: { keepActiveTurnUngrouped?: boolean } = {},
): ConversationRenderBlock[] => {
  const blocks: ConversationRenderBlock[] = []
  let currentTurn: ConversationItem[] = []

  const flushTurn = () => {
    if (currentTurn.length === 0) return

    if (options.keepActiveTurnUngrouped || currentTurn.some((item) => isActiveAuxiliaryItem(item))) {
      for (const item of currentTurn) {
        blocks.push({ kind: 'item', key: item.id, item })
      }
      currentTurn = []
      return
    }

    const lastVisibleAssistantIndex = (() => {
      for (let index = currentTurn.length - 1; index >= 0; index -= 1) {
        if (isVisibleAssistantMessage(currentTurn[index])) return index
      }
      return -1
    })()

    if (lastVisibleAssistantIndex === -1) {
      const first = currentTurn[0]
      const last = currentTurn[currentTurn.length - 1]
      blocks.push({
        kind: 'turn',
        key: `turn-${first.id}-${last.id}`,
        items: currentTurn,
        summary: summarizeConversationTurn(currentTurn),
        defaultOpen: true,
      })
      currentTurn = []
      return
    }

    const trailingItems = currentTurn.slice(lastVisibleAssistantIndex + 1)
    if (trailingItems.length > 0) {
      const first = currentTurn[0]
      const last = currentTurn[currentTurn.length - 1]
      blocks.push({
        kind: 'turn',
        key: `turn-${first.id}-${last.id}`,
        items: currentTurn,
        summary: summarizeConversationTurn(currentTurn),
        defaultOpen: currentTurn.some((item) => isActiveAuxiliaryItem(item)),
      })
      currentTurn = []
      return
    }

    const prelude = currentTurn.slice(0, lastVisibleAssistantIndex)
    const finalAssistant = currentTurn[lastVisibleAssistantIndex]

    if (prelude.length > 0) {
      const first = prelude[0]
      const last = prelude[prelude.length - 1]
      blocks.push({
        kind: 'turn',
        key: `turn-${first.id}-${last.id}`,
        items: prelude,
        summary: summarizeConversationTurn(prelude, finalAssistant),
        defaultOpen: prelude.some((item) => isActiveAuxiliaryItem(item)),
      })
    }

    if (isChatMessage(finalAssistant)) {
      blocks.push({ kind: 'item', key: finalAssistant.id, item: finalAssistant })
    }

    currentTurn = []
  }

  for (const item of items) {
    if (isChatMessage(item) && item.role === 'user') {
      flushTurn()
      blocks.push({ kind: 'item', key: item.id, item })
      continue
    }

    if (isChatMessage(item) && !isMeaningfulChatMessage(item)) {
      if (currentTurn.length > 0) currentTurn.push(item)
      continue
    }

    currentTurn.push(item)
  }

  flushTurn()
  return blocks
}

export const normalizeToolInput = (
  input: ToolCall['input'] | string | undefined
): ToolCall['input'] => {
  if (input === undefined || input === null) return {}
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return {}
    try {
      return JSON.parse(trimmed)
    } catch {
      return input
    }
  }
  return input
}

export const normalizeToolOutput = (
  output: ToolCall['result'] | undefined,
  status: ToolCall['status']
) => {
  if (output === undefined || output === null) {
    return status === 'completed' ? 'No output returned.' : null
  }
  if (output === '') return '(empty output)'
  if (typeof output === 'boolean' || typeof output === 'number') return String(output)
  return output
}

export type WebSearchCardResult = { title: string; url: string; description: string }

export type WebSearchCardData = {
  query: string
  results: WebSearchCardResult[]
  title?: string
}

export type ImageSearchCardResult = {
  title: string
  imageUrl: string
  thumbnailUrl: string
  sourceUrl: string
  width?: number
  height?: number
  source?: string
  sourceDomain?: string
}

export type ImageSearchCardData = {
  query: string
  results: ImageSearchCardResult[]
  error?: string
  filteredOut?: number
}

export const getWebSearchCardData = (tool: ToolCall): WebSearchCardData | null => {
  if (tool.name === 'web-search') {
    const input = normalizeToolInput(tool.input) as Record<string, unknown> | undefined
    const result = tool.result as Record<string, unknown> | undefined
    return {
      query: (input?.query as string) || '',
      results: (result?.results as WebSearchCardResult[]) || [],
    }
  }

  if (tool.name === 'research-search') {
    const input = normalizeToolInput(tool.input) as Record<string, unknown> | undefined
    const result = tool.result as Record<string, unknown> | undefined
    const rawResults = (result?.results as Array<{
      title: string
      url: string
      highlights?: string[]
      text?: string
    }>) || []
    const mapped = rawResults.map((entry) => ({
      title: entry.title,
      url: entry.url,
      description: entry.highlights?.[0] || (entry.text ? entry.text.slice(0, 200) : ''),
    }))
    const category = input?.category as string | undefined
    return {
      query: (input?.query as string) || '',
      results: mapped,
      title: category
        ? `${category.charAt(0).toUpperCase() + category.slice(1)} search`
        : 'Researched the web',
    }
  }

  return null
}

const isImageSearchCardResult = (value: unknown): value is ImageSearchCardResult => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.title === 'string' &&
    typeof record.imageUrl === 'string' &&
    typeof record.thumbnailUrl === 'string' &&
    typeof record.sourceUrl === 'string'
  )
}

export const getImageSearchCardData = (tool: ToolCall): ImageSearchCardData | null => {
  if (tool.name !== 'image-search') return null

  const input = normalizeToolInput(tool.input) as Record<string, unknown> | undefined
  const result = tool.result as Record<string, unknown> | undefined
  const rawResults = Array.isArray(result?.results) ? result.results : []
  const filteredOut: number | undefined = result?.filteredOut && typeof result.filteredOut === 'object'
    ? Object.values(result.filteredOut as Record<string, unknown>).reduce<number>((total, value) => (
      typeof value === 'number' ? total + value : total
    ), 0)
    : undefined

  return {
    query: (input?.query as string) || '',
    results: rawResults.filter(isImageSearchCardResult),
    error: typeof result?.error === 'string' ? result.error : undefined,
    filteredOut,
  }
}

// Parse attached files from message content and return clean message + file paths.
export const parseAttachedFiles = (content: string): { message: string; files: string[] } => {
  const attachedFilesRegex = /<attached-files>\s*([\s\S]*?)\s*<\/attached-files>/
  const match = content.match(attachedFilesRegex)

  if (!match) {
    return { message: content, files: [] }
  }

  const filesXml = match[1]
  const filePathRegex = /<file path="([^"]+)">/g
  const files: string[] = []
  let fileMatch
  while ((fileMatch = filePathRegex.exec(filesXml)) !== null) {
    files.push(fileMatch[1])
  }

  let cleanMessage = content.replace(attachedFilesRegex, '').trim()
  for (const filePath of files) {
    const fileName = filePath.split('/').pop()?.replace(/\.md$/i, '') || ''
    if (!fileName) continue
    const mentionRegex = new RegExp(`@${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'gi')
    cleanMessage = cleanMessage.replace(mentionRegex, '')
  }

  return { message: cleanMessage.trim(), files }
}

export const inferRunTitleFromMessage = (content: string): string | undefined => {
  const { message } = parseAttachedFiles(content)
  const normalized = message.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > 100 ? normalized.substring(0, 100) : normalized
}
