import { BackgroundService } from '@flazz/core/dist/services/background_service.js'
import { bus } from '@flazz/core/dist/runs/bus.js'
import { BrowserWindow, Notification } from 'electron'
import { RunEvent } from '@flazz/shared'
import z from 'zod'
import { shouldNotifyForRun } from './attention-state.js'
import { emitNotificationActivated } from './ipc.js'

type RunEventType = z.infer<typeof RunEvent>

type NotificationRunState = {
  agentName?: string
  hadAssistantOutput: boolean
  lastAssistantPreview?: string
  notifiedAskHumanIds: Set<string>
  pendingAskHumanIds: Set<string>
}

const INTERNAL_AGENT_NAMES = new Set([
  'note_creation',
  'labeling_agent',
  'email-draft',
  'meeting-prep',
])

const runStates = new Map<string, NotificationRunState>()
let unsubscribe: (() => void) | null = null

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function sanitizeNotificationText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s*)/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function getRunState(runId: string): NotificationRunState {
  const existing = runStates.get(runId)
  if (existing) return existing
  const created: NotificationRunState = {
    hadAssistantOutput: false,
    notifiedAskHumanIds: new Set(),
    pendingAskHumanIds: new Set(),
  }
  runStates.set(runId, created)
  return created
}

function extractVisibleText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is { type?: string; text?: string } => !!part && typeof part === 'object')
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function focusMainWindow(runId?: string) {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (runId) {
    emitNotificationActivated({ runId })
  }
}

function showNotification(title: string, body: string, runId: string) {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title,
    body: sanitizeNotificationText(body),
    silent: false,
  })
  notification.on('click', () => {
    focusMainWindow(runId)
  })
  notification.show()

  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.flashFrame(true)
    const stopFlashing = () => {
      win.flashFrame(false)
      win.removeListener('focus', stopFlashing)
    }
    win.on('focus', stopFlashing)
  }
}

function shouldIgnoreRun(state: NotificationRunState): boolean {
  return state.agentName ? INTERNAL_AGENT_NAMES.has(state.agentName) : false
}

function truncateBody(text: string, limit: number = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 1)}…`
}

function handleRunEvent(event: RunEventType) {
  const state = getRunState(event.runId)

  switch (event.type) {
    case 'start':
      state.agentName = event.agentName
      break
    case 'run-processing-start':
      state.hadAssistantOutput = false
      state.lastAssistantPreview = undefined
      break
    case 'message':
      if (event.message.role === 'assistant') {
        const preview = extractVisibleText(event.message.content)
        if (preview) {
          state.hadAssistantOutput = true
          state.lastAssistantPreview = preview
        }
      }
      break
    case 'ask-human-request':
      state.pendingAskHumanIds.add(event.toolCallId)
      if (shouldIgnoreRun(state)) return
      if (!shouldNotifyForRun(event.runId)) return
      if (state.notifiedAskHumanIds.has(event.toolCallId)) return
      state.notifiedAskHumanIds.add(event.toolCallId)
      showNotification('Flazz needs your input', truncateBody(event.query), event.runId)
      break
    case 'ask-human-response':
      state.pendingAskHumanIds.delete(event.toolCallId)
      break
    case 'run-processing-end':
      if (shouldIgnoreRun(state)) return
      if (!shouldNotifyForRun(event.runId)) return
      if (state.pendingAskHumanIds.size > 0) return
      if (!state.hadAssistantOutput) return
      showNotification('Flazz response ready', truncateBody(state.lastAssistantPreview ?? 'Your run has finished.'), event.runId)
      state.hadAssistantOutput = false
      state.lastAssistantPreview = undefined
      break
    case 'run-stopped':
    case 'error':
      state.hadAssistantOutput = false
      state.lastAssistantPreview = undefined
      break
  }
}

export const runNotificationService: BackgroundService = {
  name: 'RunNotifications',
  async start(): Promise<void> {
    if (unsubscribe) return
    unsubscribe = await bus.subscribe('*', async (event) => {
      handleRunEvent(event)
    })
  },
  async stop(): Promise<void> {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    runStates.clear()
  },
}
