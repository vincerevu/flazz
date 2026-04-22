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

  const activeTool = [...state.conversation].reverse().find(
    (item): item is ToolCall => isToolCall(item) && (item.status === 'pending' || item.status === 'running')
  )
  if (activeTool) {
    return activeTool.status === 'pending'
      ? `Preparing ${activeTool.name}...`
      : `Running ${activeTool.name}...`
  }

  if (state.currentAssistantMessage.trim()) return 'Receiving response...'

  if (state.runStatus?.message) return state.runStatus.message

  return 'Thinking...'
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
