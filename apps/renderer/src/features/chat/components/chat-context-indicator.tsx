import { useEffect, useMemo, useRef } from 'react'

import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from '@/components/ai-elements/context'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { ConversationItem } from '@/lib/chat-conversation'
import type { LanguageModelUsage } from 'ai'
import type { ModelConfig } from '@/features/providers/provider-connections'
import { deriveContextWindowState } from '@/features/chat/model-context-budget'

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)
}

function getIndicatorTone(status: string) {
  if (status === 'failed') return 'text-destructive'
  if (status === 'running') return 'text-amber-500'
  if (status === 'pending') return 'text-amber-500'
  if (status === 'completed') return 'text-emerald-500'
  return 'text-muted-foreground'
}

export function ChatContextIndicator({
  conversation,
  usage,
  usageUpdatedAt,
  runtimeConfig,
  className,
}: {
  conversation: ConversationItem[]
  usage: LanguageModelUsage | null
  usageUpdatedAt?: number | null
  runtimeConfig: ModelConfig | null
  className?: string
}) {
  const lastKnownUsageRef = useRef<LanguageModelUsage | null>(usage)
  const lastModelRef = useRef<string | null>(runtimeConfig?.model ?? null)

  useEffect(() => {
    const nextModel = runtimeConfig?.model ?? null
    if (lastModelRef.current !== nextModel) {
      lastModelRef.current = nextModel
      lastKnownUsageRef.current = usage ?? null
      return
    }
    if (usage) {
      lastKnownUsageRef.current = usage
    }
  }, [usage, runtimeConfig?.model])

  const effectiveUsage = usage ?? lastKnownUsageRef.current
  const state = useMemo(() => deriveContextWindowState({
    conversation,
    usage: effectiveUsage,
    usageUpdatedAt,
    config: runtimeConfig,
  }), [conversation, effectiveUsage, runtimeConfig, usageUpdatedAt])

  if (!state.contextLimit) return null

  const title = 'Context window'
  const subtitle = `${compactNumber(state.usedTokens)} / ${compactNumber(state.contextLimit)} tokens used`
  const postCompactionSubtitle =
    state.latestCompaction?.status === 'completed' && state.latestCompaction.estimatedTokensAfter
      ? `${compactNumber(state.latestCompaction.estimatedTokensAfter)} / ${compactNumber(state.contextLimit)} tokens after compaction`
      : subtitle
  const radius = 11
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (Math.min(100, Math.max(0, state.percent)) / 100) * circumference
  const toneClass = getIndicatorTone(state.status)
  return (
    <Context
      usedTokens={Math.max(0, state.usedTokens)}
      maxTokens={Math.max(1, state.contextLimit)}
      usage={effectiveUsage ?? undefined}
      modelId={runtimeConfig?.model}
    >
      <ContextTrigger
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/90 p-0 shadow-sm backdrop-blur-sm hover:bg-background',
          className,
        )}
        aria-label={`${title}: ${state.summary}. ${subtitle}`}
      >
        <div className="relative flex h-7 w-7 items-center justify-center">
          <svg className="-rotate-90 h-7 w-7" viewBox="0 0 32 32" aria-hidden="true">
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              className="stroke-border/70"
              strokeWidth="2.75"
            />
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              className={cn('transition-all duration-300', toneClass)}
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          {state.percent > 0 ? (
            <span className="absolute text-[9px] font-semibold text-foreground">{state.percent}</span>
          ) : null}
        </div>
      </ContextTrigger>
      <ContextContent className="w-80">
        <ContextContentHeader />
        <ContextContentBody className="space-y-3">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">{state.summary}</div>
            <div className="text-xs text-muted-foreground">
              {state.usageIsEstimatedFromCompaction ? postCompactionSubtitle : subtitle}
            </div>
            <Progress value={state.percent} className="h-1.5 bg-muted" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Compaction threshold</span>
              <span>{compactNumber(state.compactionThreshold)} tokens</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Usable input budget</span>
              <span>{compactNumber(state.usableInputBudget)} tokens</span>
            </div>
            {state.latestCompaction ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last compaction</span>
                  <span className={cn(
                    state.latestCompaction.status === 'failed' && 'text-destructive',
                  )}>
                    {state.latestCompaction.status === 'running'
                      ? 'In progress'
                      : state.latestCompaction.status === 'completed'
                        ? 'Completed'
                        : 'Failed'}
                  </span>
                </div>
                {typeof state.latestCompaction.tokensSaved === 'number' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Saved</span>
                    <span>
                      {compactNumber(state.latestCompaction.tokensSaved)} tokens
                      {typeof state.latestCompaction.reductionPercent === 'number'
                        ? ` (${state.latestCompaction.reductionPercent}%)`
                        : ''}
                    </span>
                  </div>
                ) : null}
                {typeof state.latestCompaction.omittedMessages === 'number' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Compressed turns</span>
                    <span>
                      {state.latestCompaction.omittedMessages} summarized
                      {typeof state.latestCompaction.recentMessages === 'number'
                        ? ` · ${state.latestCompaction.recentMessages} kept recent`
                        : ''}
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
            {state.metrics.totalAttempts > 0 ? (
              <>
                <div className="flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="text-muted-foreground">Compactions</span>
                  <span>{state.metrics.completedCompactions}/{state.metrics.totalAttempts} completed</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Escalations</span>
                  <span>{state.metrics.escalatedCompactions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Saved total</span>
                  <span>{compactNumber(state.metrics.totalTokensSaved)} tokens</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Avg reduction</span>
                  <span>{state.metrics.averageReductionPercent}%</span>
                </div>
              </>
            ) : null}
          </div>
          <div className="space-y-2 border-t border-border/60 pt-3">
            <ContextInputUsage />
            <ContextOutputUsage />
            <ContextReasoningUsage />
            <ContextCacheUsage />
          </div>
        </ContextContentBody>
        <ContextContentFooter>
          <div className="flex w-full items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Model</span>
            <span className="truncate">{runtimeConfig?.model ?? 'Unknown'}</span>
          </div>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  )
}
