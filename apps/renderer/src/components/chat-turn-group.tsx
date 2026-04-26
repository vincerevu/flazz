import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

type ChatTurnGroupProps = {
  summary: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function ChatTurnGroup({
  summary,
  defaultOpen = false,
  children,
}: ChatTurnGroupProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  const previousDefaultOpenRef = React.useRef(defaultOpen)

  React.useEffect(() => {
    const previousDefaultOpen = previousDefaultOpenRef.current
    if (previousDefaultOpen !== defaultOpen) {
      setOpen(defaultOpen)
      previousDefaultOpenRef.current = defaultOpen
    }
  }, [defaultOpen])

  return (
    <div className="mb-4 w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-1.5 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground',
          open && 'mb-2',
        )}
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0" />
        ) : (
          <ChevronRight className="size-4 shrink-0" />
        )}
        <span className="truncate">{summary}</span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  )
}
