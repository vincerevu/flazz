import { describe, expect, it } from 'vitest'
import type { LanguageModelUsage } from 'ai'
import type z from 'zod'

import { deriveContextWindowState } from './model-context-budget'
import type { ModelConfig } from '@/features/providers/provider-connections'
import { RunStatusEvent } from '@flazz/shared/src/runs.js'
import type { ConversationItem } from '@/lib/chat-conversation'

type RunStatus = z.infer<typeof RunStatusEvent>

const config: ModelConfig = {
  provider: { flavor: 'openai-compatible' },
  model: 'test-model',
  limits: {
    context: 1000,
    output: 100,
  },
}

function runStatus(estimatedPromptTokens: number, ts = '2026-04-28T00:00:00.000Z'): RunStatus {
  return {
    type: 'run-status',
    runId: 'run-1',
    subflow: [],
    ts,
    phase: 'checking-context',
    message: 'Checking context window...',
    contextDebug: {
      providerFlavor: 'openai-compatible',
      modelId: 'test-model',
      contextLimit: 1000,
      usableInputBudget: 900,
      outputReserve: 100,
      compactionThreshold: 900,
      targetThreshold: 500,
      estimatedPromptTokens,
      overflowSource: 'estimated',
      budgetSource: 'registry',
    },
  }
}

describe('deriveContextWindowState', () => {
  it('prefers newer runtime prompt estimates over stale usage so context does not move backward between turns', () => {
    const usage: LanguageModelUsage = {
      inputTokens: 300,
      outputTokens: 20,
      totalTokens: 320,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    }

    const state = deriveContextWindowState({
      conversation: [],
      usage,
      usageUpdatedAt: Date.parse('2026-04-28T00:00:01.000Z'),
      config,
      runStatus: runStatus(320, '2026-04-28T00:00:02.000Z'),
    })

    expect(state.usedTokens).toBe(320)
    expect(state.percent).toBe(32)
  })

  it('ignores stale pre-compaction estimates after compaction lowers the active context', () => {
    const conversation: ConversationItem[] = [{
      id: 'context-compaction-1',
      kind: 'context-compaction',
      status: 'completed',
      strategy: 'summary-window',
      messageCountBefore: 10,
      estimatedTokensBefore: 800,
      estimatedTokensAfter: 300,
      contextLimit: 1000,
      usableInputBudget: 900,
      compactionThreshold: 900,
      targetThreshold: 500,
      timestamp: Date.parse('2026-04-28T00:00:05.000Z'),
    }]

    const state = deriveContextWindowState({
      conversation,
      usage: null,
      config,
      runStatus: runStatus(800, '2026-04-28T00:00:04.000Z'),
    })

    expect(state.usedTokens).toBe(300)
    expect(state.percent).toBe(30)
  })
})
