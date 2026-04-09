import { MessageCircle, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type ChatKnowledgeView = 'chat' | 'knowledge'

interface ChatKnowledgeMenuProps {
  activeView: ChatKnowledgeView
  onViewChange: (view: ChatKnowledgeView) => void
}

export function ChatKnowledgeMenu({
  activeView,
  onViewChange,
}: ChatKnowledgeMenuProps) {
  const menuItems = [
    {
      id: 'chat' as const,
      label: 'Chat',
      icon: MessageCircle,
      description: 'Chat with AI',
    },
    {
      id: 'knowledge' as const,
      label: 'Knowledge',
      icon: BookOpen,
      description: 'Browse knowledge base',
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
