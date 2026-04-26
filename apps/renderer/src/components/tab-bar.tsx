import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export type ChatTab = {
  id: string
  runId: string | null
}

export type FileTab = {
  id: string
  path: string
}

interface TabBarProps<T> {
  tabs: T[]
  activeTabId: string
  getTabTitle: (tab: T) => string
  getTabId: (tab: T) => string
  getTabIcon?: (tab: T, active: boolean) => React.ReactNode
  isProcessing?: (tab: T) => boolean
  onSwitchTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  layout?: 'fill' | 'scroll'
  variant?: 'default' | 'pill'
  allowSingleTabClose?: boolean
}

export function TabBar<T>({
  tabs,
  activeTabId,
  getTabTitle,
  getTabId,
  getTabIcon,
  isProcessing,
  onSwitchTab,
  onCloseTab,
  layout = 'fill',
  variant = 'default',
  allowSingleTabClose = false,
}: TabBarProps<T>) {
  const isPillVariant = variant === 'pill'

  return (
    <div
      className={cn(
        'flex min-w-0 self-stretch items-center',
        isPillVariant ? 'flex-1 gap-2 overflow-hidden px-2' : 'flex-1',
        layout === 'scroll'
          ? 'overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'overflow-hidden'
      )}
    >
      {tabs.map((tab, index) => {
        const tabId = getTabId(tab)
        const isActive = tabId === activeTabId
        const processing = isProcessing?.(tab) ?? false
        const title = getTabTitle(tab)
        const icon = getTabIcon?.(tab, isActive)

        return (
          <React.Fragment key={tabId}>
            {!isPillVariant && index > 0 && (
              <div className="self-stretch w-px bg-border/70 shrink-0" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={() => onSwitchTab(tabId)}
              className={cn(
                'titlebar-no-drag group/tab relative flex items-center transition-colors',
                isPillVariant
                  ? [
                      'h-8 gap-2 rounded-md border px-3 text-sm',
                      layout === 'scroll' ? 'min-w-[116px] max-w-[192px]' : 'min-w-0 max-w-[192px]',
                      isActive
                        ? 'border-border/70 bg-white text-foreground shadow-xs dark:border-zinc-700 dark:bg-zinc-900'
                        : 'border-transparent bg-transparent text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:border-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-100',
                    ]
                  : [
                      'gap-1.5 px-3 self-stretch text-xs',
                      layout === 'scroll' ? 'min-w-[140px] max-w-[240px]' : 'min-w-0 max-w-[220px]',
                      isActive
                        ? 'bg-background text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    ]
              )}
              style={layout === 'scroll'
                ? { flex: '0 0 auto' }
                : isPillVariant
                  ? { flex: '0 1 auto' }
                  : { flex: '1 1 0px' }}
            >
              {processing && (
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {icon ? <span className="shrink-0">{icon}</span> : null}
              <span className="truncate flex-1 text-left">{title}</span>
              {(allowSingleTabClose || tabs.length > 1) && (
                <span
                  role="button"
                  className={cn(
                    'shrink-0 flex items-center justify-center p-0.5 transition-all',
                    isPillVariant
                      ? 'rounded-sm opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'
                      : 'rounded-sm opacity-0 group-hover/tab:opacity-60 hover:opacity-100! hover:bg-foreground/10'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tabId)
                  }}
                  aria-label="Close tab"
                >
                  <X className={cn(isPillVariant ? 'size-3.5' : 'size-3')} />
                </span>
              )}
            </button>
            {!isPillVariant && index === tabs.length - 1 && (
              <div className="self-stretch w-px bg-border/70 shrink-0" aria-hidden="true" />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
