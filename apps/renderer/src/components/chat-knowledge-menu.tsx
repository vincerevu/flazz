import { MessageCircle, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type ChatMemoryView = 'chat' | 'memory'

interface ChatMemoryMenuProps {
  activeView: ChatMemoryView
  onViewChange: (view: ChatMemoryView) => void
}

export function ChatMemoryMenu({
  activeView,
  onViewChange,
}: ChatMemoryMenuProps) {
  const menuItems = [
    {
      id: 'chat' as const,
      label: 'Chat',
      icon: MessageCircle,
      description: 'Chat with AI',
    },
    {
      id: 'memory' as const,
      label: 'Memory',
      icon: BookOpen,
      description: 'Browse workspace memory',
    },
  ]

  return (
    <div className="flex flex-col gap-1 px-2 py-2 border-b border-border">
      {menuItems.map((item) => {
        const Icon = item.icon
        const isActive = activeView === item.id

        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onViewChange(item.id)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-2">
              {item.description}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
