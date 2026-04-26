import { Search, SquarePen } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type AppTitlebarLeadingContentProps = {
  onNewChat: () => void
  onOpenSearch: () => void
}

export function AppTitlebarLeadingContent({
  onNewChat,
  onOpenSearch,
}: AppTitlebarLeadingContentProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onNewChat}
            className="titlebar-no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="New chat tab"
          >
            <SquarePen className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">New chat tab</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenSearch}
            className="titlebar-no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Search"
          >
            <Search className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Search</TooltipContent>
      </Tooltip>
    </>
  )
}
