import { useCallback, useMemo, useRef, useState } from 'react'

import { viewStatesEqual, type ViewState } from '@/features/memory/types'

type NavigationHistory = {
  back: ViewState[]
  forward: ViewState[]
}

type NavigateFn = (view: ViewState, opts?: { pushHistory?: boolean; newTab?: boolean }) => void

export function useNavigationHistory() {
  const historyRef = useRef<NavigationHistory>({ back: [], forward: [] })
  const [viewHistory, setViewHistory] = useState<NavigationHistory>({ back: [], forward: [] })
  const currentViewRef = useRef<ViewState>({ type: 'chat', runId: null })
  const navigateRef = useRef<NavigateFn>(() => {})

  const appendUnique = useCallback((stack: ViewState[], entry: ViewState) => {
    const last = stack[stack.length - 1]
    if (last && viewStatesEqual(last, entry)) return stack
    return [...stack, entry]
  }, [])

  const setViewHistoryFull = useCallback((next: NavigationHistory) => {
    historyRef.current = next
    setViewHistory(next)
  }, [])

  const canNavigateBack = viewHistory.back.length > 0
  const canNavigateForward = viewHistory.forward.length > 0

  const navigateToView = useCallback((view: ViewState, opts?: { pushHistory?: boolean; newTab?: boolean }) => {
    navigateRef.current(view, opts)
  }, [])

  const navigateToFile = useCallback((path: string, opts?: { newTab?: boolean }) => {
    navigateRef.current({ type: 'file', path }, opts)
  }, [])

  const navigateToFileRefThunk = useCallback((path: string, opts?: { newTab?: boolean }) => {
    navigateRef.current({ type: 'file', path }, opts)
  }, [])

  const navigateToViewRefThunk = useCallback((view: ViewState, opts?: { newTab?: boolean }) => {
    navigateRef.current(view, opts)
  }, [])

  const setNavigator = useCallback((navigate: NavigateFn) => {
    navigateRef.current = navigate
  }, [])

  const navigateBack = useCallback(() => {
    const backStack = [...historyRef.current.back]
    const next = backStack.pop()
    if (!next) return

    const from = currentViewRef.current
    setViewHistoryFull({
      back: backStack,
      forward: [from, ...historyRef.current.forward],
    })
    navigateRef.current(next, { pushHistory: false })
  }, [setViewHistoryFull])

  const navigateForward = useCallback(() => {
    const forwardStack = [...historyRef.current.forward]
    const next = forwardStack.shift()
    if (!next) return

    const from = currentViewRef.current
    setViewHistoryFull({
      back: appendUnique(historyRef.current.back, from),
      forward: forwardStack,
    })
    navigateRef.current(next, { pushHistory: false })
  }, [appendUnique, setViewHistoryFull])

  return useMemo(() => ({
    historyRef,
    currentViewRef,
    appendUnique,
    setViewHistoryFull,
    canNavigateBack,
    canNavigateForward,
    navigateToView,
    navigateToFile,
    navigateToFileRefThunk,
    navigateToViewRefThunk,
    setNavigator,
    navigateBack,
    navigateForward,
  }), [
    appendUnique,
    canNavigateBack,
    canNavigateForward,
    navigateBack,
    navigateForward,
    navigateToFile,
    navigateToFileRefThunk,
    navigateToView,
    navigateToViewRefThunk,
    setNavigator,
    setViewHistoryFull,
  ])
}
