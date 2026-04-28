import type { LanguageModelUsage } from 'ai'
import z from 'zod'

import type { ConversationItem, ContextCompactionItem } from '@/lib/chat-conversation'
import type { ModelConfig } from '@/features/providers/provider-connections'
import { RunStatusEvent } from '@flazz/shared/src/runs.js'

type ContextCompactionMetrics = {
  totalAttempts: number
  completedCompactions: number
  failedCompactions: number
  escalatedCompactions: number
  totalTokensSaved: number
  averageReductionPercent: number
}

export type DerivedContextBudgetSource = 'config' | 'registry' | 'fallback' | 'unknown'

export type DerivedContextWindowState = {
  usedTokens: number
  contextLimit: number
  usableInputBudget: number
  compactionThreshold: number
  percent: number
  status: 'idle' | 'running' | 'completed' | 'failed'
  summary: string
  latestCompaction: ContextCompactionItem | null
  usageIsEstimatedFromCompaction: boolean
  metrics: ContextCompactionMetrics
  budgetSource: DerivedContextBudgetSource
  hasKnownContextLimit: boolean
}

function getEffectiveInputUsage(usage: LanguageModelUsage | null | undefined): number {
  if (!usage) return 0
  return usage.inputTokens ?? 0
}

function getEventTimestamp(event: { ts?: string } | null | undefined): number | null {
  if (!event?.ts) return null
  const timestamp = new Date(event.ts).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function getLatestContextCompactionItem(
  conversation: ConversationItem[],
): ContextCompactionItem | null {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const item = conversation[index]
    if ('kind' in item && item.kind === 'context-compaction') {
      return item
    }
  }
  return null
}

export function deriveContextCompactionMetrics(
  conversation: ConversationItem[],
): ContextCompactionMetrics {
  let totalAttempts = 0
  let completedCompactions = 0
  let failedCompactions = 0
  let escalatedCompactions = 0
  let totalTokensSaved = 0
  let totalReductionPercent = 0

  for (const item of conversation) {
    if (!('kind' in item) || item.kind !== 'context-compaction') continue
    totalAttempts += 1
    if (item.escalated) escalatedCompactions += 1
    if (item.status === 'completed') {
      completedCompactions += 1
      totalTokensSaved += item.tokensSaved ?? 0
      totalReductionPercent += item.reductionPercent ?? 0
    } else if (item.status === 'failed') {
      failedCompactions += 1
    }
  }

  return {
    totalAttempts,
    completedCompactions,
    failedCompactions,
    escalatedCompactions,
    totalTokensSaved,
    averageReductionPercent: completedCompactions > 0
      ? Math.round(totalReductionPercent / completedCompactions)
      : 0,
  }
}

export function deriveContextWindowState(args: {
  conversation: ConversationItem[]
  usage: LanguageModelUsage | null
  usageUpdatedAt?: number | null
  config: ModelConfig | null
  runStatus?: z.infer<typeof RunStatusEvent> | null
}): DerivedContextWindowState {
  const latestCompaction = getLatestContextCompactionItem(args.conversation)
  const metrics = deriveContextCompactionMetrics(args.conversation)
  const runtimeBudget = args.runStatus?.contextDebug
  const configContextLimit = args.config?.limits?.context ?? 0
  const configOutputReserve = args.config?.limits?.output ?? 8192
  const configReserved = Math.min(20000, configOutputReserve || 8192)
  const configUsableInputBudget = Math.max(
    8000,
    (args.config?.limits?.input ?? 0) > 0
      ? Math.max(0, (args.config?.limits?.input ?? 0) - configReserved)
      : Math.max(0, configContextLimit - configReserved),
  )
  const configCompactionThreshold = configUsableInputBudget

  const budgetSource = runtimeBudget?.budgetSource
    ?? (configContextLimit > 0 ? 'config' : 'unknown')
  const hasKnownContextLimit = budgetSource === 'config' || budgetSource === 'registry'
  const contextLimit = latestCompaction?.contextLimit ?? runtimeBudget?.contextLimit ?? configContextLimit
  const runStatusTimestamp = getEventTimestamp(args.runStatus)
  const usageIsNewerThanCompaction = Boolean(
    args.usage
      && args.usageUpdatedAt
      && latestCompaction
      && args.usageUpdatedAt >= latestCompaction.timestamp,
  )
  const runtimeBudgetIsNewerThanCompaction = Boolean(
    runtimeBudget
      && (!latestCompaction || (runStatusTimestamp != null && runStatusTimestamp >= latestCompaction.timestamp)),
  )
  const compactionTokens = latestCompaction?.status === 'completed'
    ? (latestCompaction.estimatedTokensAfter ?? latestCompaction.estimatedTokensBefore)
    : latestCompaction?.estimatedTokensBefore ?? 0
  const usageTokens = !latestCompaction || usageIsNewerThanCompaction
    ? getEffectiveInputUsage(args.usage)
    : 0
  const runtimeEstimatedTokens = runtimeBudgetIsNewerThanCompaction
    ? runtimeBudget?.estimatedPromptTokens ?? 0
    : 0
  const usedTokens = Math.max(compactionTokens, usageTokens, runtimeEstimatedTokens)
  const percent = hasKnownContextLimit && contextLimit > 0
    ? Math.min(100, Math.max(0, Math.round((usedTokens / contextLimit) * 100)))
    : 0

  const status = latestCompaction?.status ?? 'idle'
  const summary =
    status === 'running'
      ? 'Auto-compacting context'
      : status === 'completed'
        ? 'Context auto-compacted'
        : status === 'failed'
          ? 'Context compaction failed'
          : hasKnownContextLimit
            ? `${percent}% full`
            : 'Context limit unknown'

  return {
    usedTokens,
    contextLimit,
    usableInputBudget: latestCompaction?.usableInputBudget ?? runtimeBudget?.usableInputBudget ?? configUsableInputBudget,
    compactionThreshold: latestCompaction?.compactionThreshold ?? runtimeBudget?.compactionThreshold ?? configCompactionThreshold,
    percent,
    status,
    summary,
    latestCompaction,
    usageIsEstimatedFromCompaction: Boolean(latestCompaction && !usageIsNewerThanCompaction),
    metrics,
    budgetSource,
    hasKnownContextLimit,
  }
}
