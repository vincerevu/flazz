import { useEffect, useState } from 'react'

import { appIpc } from '@/services/app-ipc'

const CHAT_NOTIFICATIONS_STORAGE_KEY = 'flazz:chat-notifications-enabled'

type UseChatNotificationOrchestratorOptions = {
  activeRunId: string | null
  onNotificationActivated: (runId: string) => void
}

export function useChatNotificationOrchestrator({
  activeRunId,
  onNotificationActivated,
}: UseChatNotificationOrchestratorOptions) {
  const [isWindowFocusedForNotifications, setIsWindowFocusedForNotifications] = useState<boolean>(() => (
    typeof document !== 'undefined' ? document.hasFocus() : true
  ))
  const [isDocumentVisibleForNotifications, setIsDocumentVisibleForNotifications] = useState<boolean>(() => (
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  ))
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const raw = window.localStorage.getItem(CHAT_NOTIFICATIONS_STORAGE_KEY)
    return raw == null ? true : raw === 'true'
  })

  useEffect(() => {
    const handleFocus = () => setIsWindowFocusedForNotifications(true)
    const handleBlur = () => setIsWindowFocusedForNotifications(false)
    const handleVisibility = () => setIsDocumentVisibleForNotifications(document.visibilityState === 'visible')
    const handleNotificationPreferenceChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail
      if (typeof detail?.enabled === 'boolean') {
        setChatNotificationsEnabled(detail.enabled)
        return
      }
      const raw = window.localStorage.getItem(CHAT_NOTIFICATIONS_STORAGE_KEY)
      setChatNotificationsEnabled(raw == null ? true : raw === 'true')
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('flazz:chat-notifications-changed', handleNotificationPreferenceChanged as EventListener)

    handleFocus()
    handleVisibility()
    handleNotificationPreferenceChanged(new CustomEvent('flazz:chat-notifications-changed'))

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('flazz:chat-notifications-changed', handleNotificationPreferenceChanged as EventListener)
    }
  }, [])

  useEffect(() => {
    void appIpc.updateAttentionState({
      activeRunId,
      isWindowFocused: isWindowFocusedForNotifications,
      isDocumentVisible: isDocumentVisibleForNotifications,
      notificationsEnabled: chatNotificationsEnabled,
    })
  }, [
    activeRunId,
    chatNotificationsEnabled,
    isDocumentVisibleForNotifications,
    isWindowFocusedForNotifications,
  ])

  useEffect(() => {
    const cleanup = appIpc.onNotificationActivated(({ runId }) => {
      if (!runId) return
      onNotificationActivated(runId)
    })
    return cleanup
  }, [onNotificationActivated])

  return {
    isWindowFocusedForNotifications,
    isDocumentVisibleForNotifications,
    chatNotificationsEnabled,
  }
}
