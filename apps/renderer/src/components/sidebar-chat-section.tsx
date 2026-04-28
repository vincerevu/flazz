"use client"

import { useState } from 'react'
import { ExternalLink, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export type SidebarRunListItem = {
  id: string
  title?: string
  createdAt: string
  agentId: string
}

export type SidebarTasksActions = {
  onNewChat: () => void
  onSelectRun: (runId: string) => void
  onDeleteRun: (runId: string) => void
  onOpenInNewTab?: (runId: string) => void
  onSelectBackgroundTask?: (taskName: string) => void
}

function formatRunTime(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const now = Date.now()
  const diffMs = Math.max(0, now - date.getTime())
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} m`
  if (diffHours < 24) return `${diffHours} h`
  if (diffDays < 7) return `${diffDays} d`
  if (diffWeeks < 4) return `${diffWeeks} w`
  return `${Math.max(1, diffMonths)} m`
}

type SidebarChatSectionProps = {
  runs: SidebarRunListItem[]
  isLoading?: boolean
  currentRunId?: string | null
  processingRunIds?: Set<string>
  actions?: SidebarTasksActions
}

export function SidebarChatSection({
  runs,
  isLoading = false,
  currentRunId,
  processingRunIds,
  actions,
}: SidebarChatSectionProps) {
  const [pendingDeleteRunId, setPendingDeleteRunId] = useState<string | null>(null)

  return (
    <SidebarGroup className="flex flex-1 flex-col overflow-hidden">
      <SidebarGroupContent className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Loading chats...</span>
          </div>
        )}
        {!isLoading && runs.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Chat history
            </div>
            <SidebarMenu>
              {runs.map((run) => (
                <ContextMenu key={run.id}>
                  <ContextMenuTrigger asChild>
                    <SidebarMenuItem className="group/chat-item">
                      <SidebarMenuButton
                        isActive={currentRunId === run.id}
                        onClick={(event) => {
                          if (event.metaKey && actions?.onOpenInNewTab) {
                            actions.onOpenInNewTab(run.id)
                          } else {
                            actions?.onSelectRun(run.id)
                          }
                        }}
                        className="data-[active=true]:font-normal"
                      >
                        <div className="flex min-w-0 w-full items-center gap-2">
                          {processingRunIds?.has(run.id) ? (
                            <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-xs">{run.title || '(Untitled chat)'}</span>
                          {run.createdAt ? (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatRunTime(run.createdAt)}
                            </span>
                          ) : null}
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    {actions?.onOpenInNewTab && (
                      <ContextMenuItem onClick={() => actions.onOpenInNewTab?.(run.id)}>
                        <ExternalLink className="mr-2 size-4" />
                        Open in new tab
                      </ContextMenuItem>
                    )}
                    {!processingRunIds?.has(run.id) && (
                      <>
                        {actions?.onOpenInNewTab && <ContextMenuSeparator />}
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => setPendingDeleteRunId(run.id)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </SidebarMenu>
          </>
        )}
        {!isLoading && runs.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No chats yet.
          </div>
        )}
      </SidebarGroupContent>

      <Dialog open={!!pendingDeleteRunId} onOpenChange={(open) => { if (!open) setPendingDeleteRunId(null) }}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingDeleteRunId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (pendingDeleteRunId) {
                  actions?.onDeleteRun(pendingDeleteRunId)
                }
                setPendingDeleteRunId(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  )
}
