import { useCallback, useEffect, useState } from 'react'

import { appIpc } from '@/services/app-ipc'

export interface DesktopWindowState {
  isMaximized: boolean
  isFullscreen: boolean
  platform: string
  supportsCustomTitlebar: boolean
  workspaceRoot?: string
}

export function useDesktopWindow() {
  const [windowState, setWindowState] = useState<DesktopWindowState | null>(null)

  const handleWindowMinimize = useCallback(() => {
    void appIpc.minimizeWindow()
  }, [])

  const handleWindowToggleMaximize = useCallback(() => {
    void appIpc.toggleMaximizeWindow().then((nextState) => {
      setWindowState(nextState)
    })
  }, [])

  const handleWindowClose = useCallback(() => {
    void appIpc.closeWindow()
  }, [])

  useEffect(() => {
    let isMounted = true

    void appIpc.getWindowState().then((nextState) => {
      if (isMounted) {
        setWindowState(nextState)
      }
    }).catch((error) => {
      console.error('Failed to load window state', error)
    })

    const cleanup = appIpc.onWindowStateChanged((nextState) => {
      setWindowState(nextState)
    })

    return () => {
      isMounted = false
      cleanup()
    }
  }, [])

  return {
    windowState,
    setWindowState,
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
  }
}
