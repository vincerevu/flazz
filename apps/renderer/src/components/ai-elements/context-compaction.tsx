import { ChevronDown } from 'lucide-react'
import * as Collapsible from '@radix-ui/react-collapsible'

import { cn } from '@/lib/utils'
import type { ContextCompactionItem } from '@/lib/chat-conversation'

const statusLabel: Record<ContextCompactionItem['status'], string> = {
  running: 'Compressing context',
  completed: 'Context compacted',
  failed: 'Context compaction failed',
}

export function ContextCompactionCard({ item }: { item: ContextCompactionItem }) {
  const canExpand = Boolean(item.summary || item.error)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Collapsible.Root defaultOpen={false}>
        <div className="px-1 py-2">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={cn(
                  'text-sm',
                  item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                )}>
                  {statusLabel[item.status]}{item.escalated ? ' (escalated)' : ''}
                </div>
                <div className="mt-1 text-xs text-muted-foreground/80">
                  {item.messageCountBefore} messages
                  {item.messageCountAfter ? ` -> ${item.messageCountAfter} prompt messages` : ''}
                  {' · '}
                  ~{item.estimatedTokensBefore.toLocaleString()} tokens
                  {item.estimatedTokensAfter ? ` -> ~${item.estimatedTokensAfter.toLocaleString()} tokens` : ''}
                  {item.reused ? ' · reused summary' : ''}
                </div>
                {typeof item.tokensSaved === 'number' ? (
                  <div className="mt-1 text-[11px] text-muted-foreground/70">
                    Saved ~{item.tokensSaved.toLocaleString()} tokens
                    {typeof item.reductionPercent === 'number' ? ` (${item.reductionPercent}% reduction)` : ''}
                    {typeof item.omittedMessages === 'number' ? ` · summarized ${item.omittedMessages} older turns` : ''}
                    {typeof item.recentMessages === 'number' ? ` · kept ${item.recentMessages} recent turns` : ''}
                  </div>
                ) : null}
                {item.status === 'running' ? (
                  <div className="mt-1 text-xs text-muted-foreground/80">
                    Summarizing older turns so the run can keep working without losing recent context.
                  </div>
                ) : null}
              </div>
              {canExpand ? (
                <Collapsible.Trigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  Details
                  <ChevronDown className="size-3.5" />
                </Collapsible.Trigger>
              ) : null}
            </div>
          </div>
          {canExpand ? (
            <Collapsible.Content className="pt-2">
              {item.summary ? (
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {item.summary}
                </pre>
              ) : null}
              {item.provenanceRefs && item.provenanceRefs.length > 0 ? (
                <div className="mt-2 text-[11px] text-muted-foreground/70">
                  Sources: {item.provenanceRefs.join(' · ')}
                </div>
              ) : null}
              {item.error ? (
                <div className="text-xs text-destructive">
                  {item.error}
                </div>
              ) : null}
            </Collapsible.Content>
          ) : null}
        </div>
      </Collapsible.Root>
    </div>
  )
}
