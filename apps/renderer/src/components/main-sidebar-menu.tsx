import { Brain, MessageSquare, Workflow, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ActiveSection } from "@/contexts/sidebar-context"

type SidebarSectionItem = {
  id: ActiveSection
  label: string
  icon: typeof MessageSquare
}

const sectionItems: SidebarSectionItem[] = [
  { id: "tasks", label: "Chat", icon: MessageSquare },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "skills", label: "Skills", icon: Zap },
  { id: "workflow", label: "Workflow", icon: Workflow },
]

type MainSidebarMenuProps = {
  activeSection: ActiveSection
  onChange: (section: ActiveSection) => void
}

export function MainSidebarMenu({ activeSection, onChange }: MainSidebarMenuProps) {
  return (
    <nav className="titlebar-no-drag flex w-full flex-col gap-1">
      {sectionItems.map((item) => {
        const Icon = item.icon
        const isActive = activeSection === item.id

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-normal transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
            aria-pressed={isActive}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="font-normal">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
