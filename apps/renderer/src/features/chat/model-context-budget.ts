import type { LanguageModelUsage } from 'ai'

import type { ConversationItem, ContextCompactionItem } from '@/lib/chat-conversation'
import type { ModelConfig } from '@/features/providers/provider-connections'

type BudgetPreset = {
  contextLimit: number
  outputReserve: number
  safetyBuffer: number
}

type ContextBudget = BudgetPreset & {
  usableInputBudget: number
  compactionThreshold: number
}

type ContextCompactionMetrics = {
  totalAttempts: number
  completedCompactions: number
  failedCompactions: number
  escalatedCompactions: number
  totalTokensSaved: number
  averageReductionPercent: number
}

const DEFAULT_CONTEXT_LIMIT = 128_000
const DEFAULT_OUTPUT_RESERVE = 8_192
const DEFAULT_SAFETY_BUFFER = 4_096
const THRESHOLD_RATIO = 0.85

const PRESETS: Array<{ match: (config: ModelConfig) => boolean; budget: BudgetPreset }> = [
  {
    match: (config) => /claude/i.test(config.model) || config.provider.flavor === 'anthropic',
    budget: { contextLimit: 200_000, outputReserve: 16_000, safetyBuffer: 8_000 },
  },
  {
    match: (config) => /gemini/i.test(config.model) || config.provider.flavor === 'google' || config.provider.flavor === 'google-vertex',
    budget: { contextLimit: 1_000_000, outputReserve: 32_000, safetyBuffer: 16_000 },
  },
  {
    match: (config) => /(gpt-5|gpt-4\.1|gpt-4o|o3|o4-mini)/i.test(config.model),
    budget: { contextLimit: 128_000, outputReserve: 16_000, safetyBuffer: 8_000 },
  },
  {
    match: (config) => /minimax/i.test(config.model) || config.provider.flavor === 'openai-compatible',
    budget: { contextLimit: 128_000, outputReserve: 8_192, safetyBuffer: 4_096 },
  },
]

export function resolveRendererContextBudget(config: ModelConfig | null): ContextBudget {
  const preset = config ? PRESETS.find((item) => item.match(config))?.budget : undefined
  const budget = preset ?? {
    contextLimit: DEFAULT_CONTEXT_LIMIT,
    outputReserve: DEFAULT_OUTPUT_RESERVE,
    safetyBuffer: DEFAULT_SAFETY_BUFFER,
  }

  const usableInputBudget = Math.max(8_000, budget.contextLimit - budget.outputReserve - budget.safetyBuffer)
  const compactionThreshold = Math.floor(usableInputBudget * THRESHOLD_RATIO)

  return {
    ...budget,
    usableInputBudget,
    compactionThreshold,
  }
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
}) {
  const latestCompaction = getLatestContextCompactionItem(args.conversation)
  const metrics = deriveContextCompactionMetrics(args.conversation)
  const resolved = resolveRendererContextBudget(args.config)
  const contextLimit = latestCompaction?.contextLimit ?? resolved.contextLimit
  const usageIsNewerThanCompaction = Boolean(
    args.usage
      && args.usageUpdatedAt
      && latestCompaction
      && args.usageUpdatedAt >= latestCompaction.timestamp,
  )
  const usedTokens =
    usageIsNewerThanCompaction
      ? (args.usage?.inputTokens ?? 0)
      : latestCompaction?.status === 'completed'
        ? (latestCompaction.estimatedTokensAfter ?? latestCompaction.estimatedTokensBefore)
        : latestCompaction?.estimatedTokensBefore
          ?? args.usage?.inputTokens
          ?? 0
  const percent = contextLimit > 0 ? Math.min(100, Math.max(0, Math.round((usedTokens / contextLimit) * 100))) : 0

  const status = latestCompaction?.status ?? 'idle'
  const summary =
    status === 'running'
      ? 'Auto-compacting context'
      : status === 'completed'
        ? 'Context auto-compacted'
        : status === 'failed'
          ? 'Context compaction failed'
          : `${percent}% full`

  return {
    usedTokens,
    contextLimit,
    usableInputBudget: latestCompaction?.usableInputBudget ?? resolved.usableInputBudget,
    compactionThreshold: latestCompaction?.compactionThreshold ?? resolved.compactionThreshold,
    percent,
    status,
    summary,
    latestCompaction,
    usageIsEstimatedFromCompaction: Boolean(latestCompaction && !usageIsNewerThanCompaction),
    metrics,
  }
}
