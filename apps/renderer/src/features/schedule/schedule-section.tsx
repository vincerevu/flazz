import { useCallback, useState } from 'react'
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock,
  LoaderIcon,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Circle,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScheduleJobs, type ScheduleJob, type ScheduleEntryStatus } from './use-schedule-jobs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  const date = new Date(ts)
  if (isNaN(date.getTime())) return '—'
  const now = Date.now()
  const diff = date.getTime() - now
  const abs = Math.abs(diff)
  const isPast = diff < 0

  const mins = Math.floor(abs / 60_000)
  const hours = Math.floor(abs / 3_600_000)
  const days = Math.floor(abs / 86_400_000)

  let label: string
  if (mins < 1) label = 'just now'
  else if (mins < 60) label = `${mins}m`
  else if (hours < 24) label = `${hours}h`
  else label = `${days}d`

  return isPast ? `${label} ago` : `in ${label}`
}

function cronToHuman(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length < 5) return cron

  const [m, h, dom, mon, dow] = parts

  // Every X minutes
  if (h === '*' && dom === '*' && mon === '*' && dow === '*') {
    if (m === '*') return 'Every minute'
    if (m.startsWith('*/')) return `Every ${m.slice(2)} minutes`
    return `At minute ${m}`
  }

  // Every X hours
  if (dom === '*' && mon === '*' && dow === '*') {
    const timeStr = m === '0' ? '' : ` at minute ${m}`
    if (h === '*') return `Every hour${timeStr}`
    if (h.startsWith('*/')) return `Every ${h.slice(2)} hours${timeStr}`
  }

  // Daily at specific time
  if (dom === '*' && mon === '*' && dow === '*') {
    return `Daily at ${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  }

  // Weekly
  if (dow !== '*' && dom === '*' && mon === '*') {
    const daysMap: Record<string, string> = {
      '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat',
      '1-5': 'Mon-Fri', '0,6': 'Weekends'
    }
    const dayStr = daysMap[dow] || `on days ${dow}`
    return `${dayStr} at ${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  }

  return cron
}

function formatScheduleLabel(job: ScheduleJob): React.ReactNode {
  const s = job.schedule
  if (s.type === 'cron' && s.expression) {
    return (
      <span className="text-foreground font-medium">{cronToHuman(s.expression)}</span>
    )
  }
  if (s.type === 'window' ) return `Window: ${s.startTime}–${s.endTime}`
  if (s.type === 'once') return `Once: ${s.runAt ? new Date(s.runAt).toLocaleString() : '—'}`
  return '—'
}

function StatusDot({ status, isRunning }: { status?: ScheduleEntryStatus; isRunning?: boolean }) {
  if (isRunning || status === 'running') {
    return <LoaderIcon className="size-3 animate-spin text-blue-500" />
  }
  switch (status) {
    case 'scheduled':
      return <Circle className="size-3 text-muted-foreground/60 fill-muted-foreground/30" />
    case 'finished':
      return <CheckCircle2 className="size-3 text-green-500" />
    case 'failed':
      return <AlertCircle className="size-3 text-red-500" />
    case 'triggered':
      return <Zap className="size-3 text-yellow-500" />
    default:
      return <Circle className="size-3 text-muted-foreground/40" />
  }
}

function StatusBadge({ status }: { status?: ScheduleEntryStatus }) {
  const map: Record<ScheduleEntryStatus, { label: string; cls: string }> = {
    scheduled: { label: 'Scheduled', cls: 'bg-muted text-muted-foreground' },
    running:   { label: 'Running',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    finished:  { label: 'Finished',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    failed:    { label: 'Failed',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    triggered: { label: 'Triggered', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  }
  const entry = status ? map[status] : null
  if (!entry) return <span className="text-[10px] text-muted-foreground/50">—</span>

  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-medium leading-none', entry.cls)}>
      {entry.label}
    </span>
  )
}

// ─── Job Card ────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onToggle,
  onDelete,
}: {
  job: ScheduleJob
  onToggle: (job: ScheduleJob) => Promise<void>
  onDelete: (name: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isRunning = job.status === 'running'

  const handleToggle = useCallback(async () => {
    setToggling(true)
    try { await onToggle(job) } finally { setToggling(false) }
  }, [job, onToggle])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try { await onDelete(job.name) } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }, [job.name, onDelete])

  return (
    <>
      <div
        className={cn(
          'rounded-md border border-sidebar-border bg-sidebar-accent/30 transition-colors',
          !job.enabled && 'opacity-50',
        )}
      >
        {/* Header row */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        >
          <StatusDot status={job.status} isRunning={isRunning} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
            {job.name}
          </span>
          {!job.enabled && (
            <span className="shrink-0 rounded px-1 py-0.5 text-[10px] bg-muted text-muted-foreground">
              Paused
            </span>
          )}
          {job.enabled && <StatusBadge status={job.status} />}
          {expanded
            ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          }
        </button>

        {/* Next run time — always visible */}
        {job.enabled && job.nextRunAt && (
          <div className="flex items-center gap-1.5 px-2.5 pb-2 -mt-1">
            <Clock className="size-3 shrink-0 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground">
              Next: {formatRelativeTime(job.nextRunAt)}
            </span>
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-sidebar-border px-2.5 py-2 space-y-2">
            {/* Description */}
            {job.description && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">{job.description}</p>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <div>
                <div className="text-[10px] text-muted-foreground/60 tracking-wide">Schedule</div>
                <div className="text-[11px] text-foreground font-mono truncate">{formatScheduleLabel(job)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground/60 tracking-wide">Runs</div>
                <div className="text-[11px] text-foreground">{job.runCount ?? 0}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground/60 tracking-wide">Last run</div>
                <div className="text-[11px] text-foreground">{formatRelativeTime(job.lastRunAt)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground/60 tracking-wide">Next run</div>
                <div className="text-[11px] text-foreground">{job.nextRunAt ? formatRelativeTime(job.nextRunAt) : '—'}</div>
              </div>
            </div>

            {/* Starting message */}
            {job.startingMessage && (
              <div>
                <div className="text-[10px] text-muted-foreground/60 tracking-wide mb-0.5">Starting message</div>
                <div className="rounded bg-muted/50 px-2 py-1 text-[11px] text-foreground/80 font-mono truncate">
                  {job.startingMessage}
                </div>
              </div>
            )}

            {/* Last error */}
            {job.lastError && (
              <div className="rounded bg-red-50 dark:bg-red-900/20 px-2 py-1.5">
                <div className="flex items-center gap-1 mb-0.5">
                  <AlertCircle className="size-3 text-red-500" />
                  <span className="text-[10px] font-medium text-red-600 dark:text-red-400">Last error</span>
                </div>
                <p className="text-[10px] text-red-600 dark:text-red-400 leading-relaxed break-words">
                  {job.lastError}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 pt-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={toggling || isRunning}
                    onClick={handleToggle}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
                      job.enabled
                        ? 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20',
                    )}
                  >
                    {toggling
                      ? <LoaderIcon className="size-3 animate-spin" />
                      : job.enabled
                        ? <Pause className="size-3" />
                        : <Play className="size-3" />
                    }
                    {job.enabled ? 'Pause' : 'Resume'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {job.enabled ? 'Pause this job' : 'Resume this job'}
                </TooltipContent>
              </Tooltip>

              <div className="flex-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Delete this scheduled job</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete scheduled job?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{job.name}</strong> from the schedule. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? <LoaderIcon className="size-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export function ScheduleSection() {
  const { jobs, loading, error, refresh, toggleEnabled, deleteJob } = useScheduleJobs()

  const runningCount = jobs.filter((j) => j.status === 'running').length
  const enabledCount = jobs.filter((j) => j.enabled).length

  return (
    <SidebarGroup className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 py-1 px-1 sticky top-0 z-10 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-1.5 px-1">
          <CalendarClock className="size-3.5 text-muted-foreground/70" />
          <span className="text-xs text-muted-foreground/70">
            {loading ? '…' : `${enabledCount} active`}
            {runningCount > 0 && (
              <span className="ml-1.5 text-blue-500">· {runningCount} running</span>
            )}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Refresh</TooltipContent>
        </Tooltip>
      </div>

      <SidebarGroupContent className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1.5">
          {/* Loading */}
          {loading && jobs.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <AlertCircle className="size-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-600 dark:text-red-400">Error</span>
              </div>
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && jobs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
              <CalendarClock className="size-8 text-muted-foreground/30" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">No schedules configured</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed">
                  Create <code className="font-mono">~/Flazz/config/agent-schedule.json</code> to add scheduled agents.
                </p>
              </div>
            </div>
          )}

          {/* Job list */}
          {jobs.map((job) => (
            <JobCard
              key={job.name}
              job={job}
              onToggle={toggleEnabled}
              onDelete={deleteJob}
            />
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
