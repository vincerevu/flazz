import { useCallback, useEffect, useState } from 'react'

import { agentScheduleIpc } from '@/services/agent-schedule-ipc'

export type BackgroundTaskSchedule =
  | { type: 'cron'; expression: string }
  | { type: 'window'; cron: string; startTime: string; endTime: string }
  | { type: 'once'; runAt: string }

export interface AgentSchedule {
  name: string
  description?: string
  startingMessage?: string
  schedule: BackgroundTaskSchedule
  enabled: boolean
  status?: 'running' | 'scheduled' | 'finished' | 'failed' | 'triggered'
  nextRunAt?: string | null
  lastRunAt?: string | null
  lastError?: string | null
  runCount?: number
}

export function useBackgroundTasks() {
  const [backgroundTasks, setBackgroundTasks] = useState<AgentSchedule[]>([])
  const [selectedBackgroundTask, setSelectedBackgroundTask] = useState<string | null>(null)

  const loadBackgroundTasks = useCallback(async () => {
    try {
      const config = await agentScheduleIpc.getConfig()
      const state = await agentScheduleIpc.getState()

      const merged: AgentSchedule[] = Object.entries(config.agents).map(([name, entry]) => {
        const agentState = state.agents[name]
        return {
          name,
          description: entry.description,
          startingMessage: entry.startingMessage,
          schedule: entry.schedule,
          enabled: entry.enabled ?? true,
          status: agentState?.status,
          nextRunAt: agentState?.nextRunAt,
          lastRunAt: agentState?.lastRunAt,
          lastError: agentState?.lastError,
          runCount: agentState?.runCount,
        }
      })

      setBackgroundTasks(merged)
    } catch (err) {
      console.error('Failed to load background tasks:', err)
    }
  }, [])

  const handleToggleBackgroundTask = useCallback(async (name: string, enabled: boolean) => {
    const task = backgroundTasks.find((entry) => entry.name === name)
    if (!task) return

    try {
      await agentScheduleIpc.updateAgent(name, {
        schedule: task.schedule,
        enabled,
        startingMessage: task.startingMessage,
        description: task.description,
      })
      await loadBackgroundTasks()
    } catch (err) {
      console.error('Failed to toggle background task:', err)
    }
  }, [backgroundTasks, loadBackgroundTasks])

  useEffect(() => {
    void loadBackgroundTasks()
  }, [loadBackgroundTasks])

  return {
    backgroundTasks,
    selectedBackgroundTask,
    setSelectedBackgroundTask,
    loadBackgroundTasks,
    handleToggleBackgroundTask,
  }
}
