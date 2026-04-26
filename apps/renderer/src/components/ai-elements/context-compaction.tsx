import { cn } from '@/lib/utils'
import type { ContextCompactionItem } from '@/lib/chat-conversation'

const statusLabel: Record<ContextCompactionItem['status'], string> = {
  running: 'Compacting context',
  completed: 'Context compacted',
  failed: 'Context compaction failed',
}

function buildCompactionSummary(item: ContextCompactionItem): string {
  const parts: string[] = []

  if (typeof item.messageCountAfter === 'number') {
    parts.push(`${item.messageCountBefore} -> ${item.messageCountAfter} messages`)
  } else {
    parts.push(`${item.messageCountBefore} messages`)
  }

  if (typeof item.estimatedTokensAfter === 'number') {
    parts.push(`~${item.estimatedTokensBefore.toLocaleString()} -> ~${item.estimatedTokensAfter.toLocaleString()} tokens`)
  } else {
    parts.push(`~${item.estimatedTokensBefore.toLocaleString()} tokens`)
  }

  if (typeof item.tokensSaved === 'number') {
    parts.push(`saved ~${item.tokensSaved.toLocaleString()} tokens`)
  }

  if (item.reused) {
    parts.push('reused summary')
  }

  if (item.status === 'failed' && item.error) {
    parts.push(item.error)
  }

  return parts.join(' · ')
}

export function ContextCompactionCard({ item }: { item: ContextCompactionItem }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-1 py-1.5">
      <div
        className={cn(
          'text-xs text-muted-foreground',
          item.status === 'failed' && 'text-destructive',
        )}
      >
        {statusLabel[item.status]}
        {item.escalated ? ' (escalated)' : ''}
        {' · '}
        {buildCompactionSummary(item)}
      </div>
    </div>
  )
}
