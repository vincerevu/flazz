import { useEffect, useState, useCallback } from 'react'
import { agentScheduleIpc } from '@/services/agent-schedule-ipc'

export type ScheduleEntryStatus = 'scheduled' | 'running' | 'finished' | 'failed' | 'triggered'

export type ScheduleJob = {
  name: string
  // config
  enabled: boolean
  description?: string
  startingMessage?: string
  schedule: {
    type: 'cron' | 'window' | 'once'
    expression?: string
    cron?: string
    startTime?: string
    endTime?: string
    runAt?: string
  }
  // runtime state
  status?: ScheduleEntryStatus
  nextRunAt?: string | null
  lastRunAt?: string | null
  lastError?: string | null
  runCount?: number
  startedAt?: string | null
}

export function useScheduleJobs() {
  const [jobs, setJobs] = useState<ScheduleJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const [config, state] = await Promise.all([
        agentScheduleIpc.getConfig(),
        agentScheduleIpc.getState(),
      ])

      const merged: ScheduleJob[] = Object.entries(config.agents).map(([name, entry]) => {
        const agentState = state.agents[name]
        return {
          name,
          enabled: entry.enabled ?? true,
          description: entry.description,
          startingMessage: entry.startingMessage,
          schedule: entry.schedule,
          status: agentState?.status,
          nextRunAt: agentState?.nextRunAt,
          lastRunAt: agentState?.lastRunAt,
          lastError: agentState?.lastError,
          runCount: agentState?.runCount ?? 0,
          startedAt: agentState?.startedAt,
        }
      })

      setJobs(merged)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleEnabled = useCallback(async (job: ScheduleJob) => {
    await agentScheduleIpc.updateAgent(job.name, {
      enabled: !job.enabled,
      schedule: job.schedule,
      description: job.description,
      startingMessage: job.startingMessage,
    } as Parameters<typeof agentScheduleIpc.updateAgent>[1])
    await refresh()
  }, [refresh])

  const deleteJob = useCallback(async (name: string) => {
    await agentScheduleIpc.deleteAgent(name)
    await refresh()
  }, [refresh])

  useEffect(() => {
    void refresh()
    // Poll every 30s to reflect state changes
    const interval = setInterval(() => { void refresh() }, 30_000)
    return () => clearInterval(interval)
  }, [refresh])

  return { jobs, loading, error, refresh, toggleEnabled, deleteJob }
}
