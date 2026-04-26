import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ChatTab } from '@/components/tab-bar'
import type { ChatTabViewState } from '@/lib/chat-conversation'
import { createEmptyChatTabViewState, isToolCall } from '@/lib/chat-conversation'

type UseChatTabsOrchestratorOptions = {
  runs: Array<{ id: string; title?: string }>
  processingRunIds: Set<string>
  chatRuntimeSnapshot: ChatTabViewState
  loadRun: (runId: string) => void | Promise<void>
  restoreChatRuntime: (snapshot: ChatTabViewState, fallbackRunId: string | null) => boolean
  resetChatRuntime: () => void
}

export function useChatTabsOrchestrator({
  runs,
  processingRunIds,
  chatRuntimeSnapshot,
  loadRun,
  restoreChatRuntime,
  resetChatRuntime,
}: UseChatTabsOrchestratorOptions) {
  const chatDraftsRef = useRef<Map<string, string>>(new Map())
  const [activeChatTabId, setActiveChatTabId] = useState<string>('default-chat')
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([{ id: 'default-chat', runId: null }])
  const [chatViewStateByTab, setChatViewStateByTab] = useState<Record<string, ChatTabViewState>>({})
  const [toolOpenByTab, setToolOpenByTab] = useState<Record<string, Record<string, boolean>>>({})
  const activeChatTabIdRef = useRef('default-chat')
  const previousToolStatusesRef = useRef<Record<string, Record<string, string>>>({})

  useEffect(() => {
    activeChatTabIdRef.current = activeChatTabId
  }, [activeChatTabId])

  useEffect(() => {
    const previousStatuses = previousToolStatusesRef.current[activeChatTabId] ?? {}
    const nextStatuses: Record<string, string> = {}
    const completedToolIds: string[] = []

    for (const item of chatRuntimeSnapshot.conversation) {
      if (!isToolCall(item)) continue
      nextStatuses[item.id] = item.status
      const previousStatus = previousStatuses[item.id]
      const wasActive = previousStatus === 'pending' || previousStatus === 'running'
      const isTerminal = item.status === 'completed' || item.status === 'error'
      const shouldNormalizeClosed = previousStatus === undefined && isTerminal
      if ((wasActive && isTerminal) || shouldNormalizeClosed) {
        completedToolIds.push(item.id)
      }
    }

    previousToolStatusesRef.current = {
      ...previousToolStatusesRef.current,
      [activeChatTabId]: nextStatuses,
    }

    if (completedToolIds.length === 0) return

    setToolOpenByTab((prev) => {
      const tabState = prev[activeChatTabId]
      if (!tabState) return prev

      let changed = false
      const nextTabState = { ...tabState }
      for (const toolId of completedToolIds) {
        if (nextTabState[toolId]) {
          nextTabState[toolId] = false
          changed = true
        }
      }

      if (!changed) return prev
      return {
        ...prev,
        [activeChatTabId]: nextTabState,
      }
    })
  }, [activeChatTabId, chatRuntimeSnapshot.conversation])

  const isToolOpenForTab = useCallback((tabId: string, toolId: string): boolean => {
    return toolOpenByTab[tabId]?.[toolId] ?? false
  }, [toolOpenByTab])

  const setToolOpenForTab = useCallback((tabId: string, toolId: string, open: boolean) => {
    setToolOpenByTab((prev) => ({
      ...prev,
      [tabId]: { ...prev[tabId], [toolId]: open },
    }))
  }, [])

  const clearToolOpenForTab = useCallback((tabId: string) => {
    setToolOpenByTab((prev) => {
      if (!prev[tabId]) return prev
      const next = { ...prev }
      delete next[tabId]
      return next
    })
  }, [])

  const setChatDraftForTab = useCallback((tabId: string, text: string) => {
    chatDraftsRef.current.set(tabId, text)
  }, [])

  const persistChatTabState = useCallback((tabId: string, snapshot: ChatTabViewState) => {
    setChatViewStateByTab((prev) => ({
      ...prev,
      [tabId]: snapshot,
    }))
  }, [])

  const activateChatTab = useCallback((tabId: string, fallbackRunId: string | null) => {
    const currentTabId = activeChatTabIdRef.current
    if (currentTabId !== tabId) {
      persistChatTabState(currentTabId, chatRuntimeSnapshot)
    }

    clearToolOpenForTab(tabId)
    setActiveChatTabId(tabId)

    const savedState = chatViewStateByTab[tabId]
    if (savedState && restoreChatRuntime(savedState, fallbackRunId)) {
      return
    }

    if (fallbackRunId) {
      void loadRun(fallbackRunId)
      return
    }

    resetChatRuntime()
  }, [chatRuntimeSnapshot, chatViewStateByTab, clearToolOpenForTab, loadRun, persistChatTabState, resetChatRuntime, restoreChatRuntime])

  const switchChatTab = useCallback((tabId: string) => {
    if (tabId === activeChatTabIdRef.current) return
    const nextTab = chatTabs.find((tab) => tab.id === tabId)
    if (!nextTab) return
    activateChatTab(tabId, nextTab.runId)
  }, [activateChatTab, chatTabs])

  const closeChatTab = useCallback((tabId: string) => {
    if (chatTabs.length <= 1) return

    const nextTabs = chatTabs.filter((tab) => tab.id !== tabId)
    setChatTabs(nextTabs)

    if (activeChatTabIdRef.current !== tabId) {
      return
    }

    const replacementTab = nextTabs[nextTabs.length - 1]
    if (!replacementTab) return
    activateChatTab(replacementTab.id, replacementTab.runId)
  }, [activateChatTab, chatTabs])

  const openNewChatTab = useCallback(() => {
    const id = `chat-${Date.now()}`
    setChatTabs((prev) => [...prev, { id, runId: null }])
    activateChatTab(id, null)
  }, [activateChatTab])

  const openChatInNewTab = useCallback((targetRunId?: string) => {
    const id = `chat-${Date.now()}`
    setChatTabs((prev) => [...prev, { id, runId: targetRunId || null }])
    activateChatTab(id, targetRunId || null)
  }, [activateChatTab])

  const replaceActiveTabRunId = useCallback((nextRunId: string | null) => {
    setChatTabs((prev) => prev.map((tab) => (
      tab.id === activeChatTabIdRef.current
        ? { ...tab, runId: nextRunId }
        : tab
    )))
  }, [])

  const replaceTabRunId = useCallback((tabId: string, nextRunId: string | null) => {
    setChatTabs((prev) => prev.map((tab) => (
      tab.id === tabId ? { ...tab, runId: nextRunId } : tab
    )))
  }, [])

  const getChatTabTitle = useCallback((tab: ChatTab) => {
    if (!tab.runId) return 'New chat'
    return runs.find((run) => run.id === tab.runId)?.title || '(Untitled chat)'
  }, [runs])

  const getChatTabStateForRender = useCallback((tabId: string): ChatTabViewState => {
    if (tabId === activeChatTabId) return chatRuntimeSnapshot
    return chatViewStateByTab[tabId] || createEmptyChatTabViewState()
  }, [activeChatTabId, chatRuntimeSnapshot, chatViewStateByTab])

  const activeChatTabState = useMemo(() => (
    getChatTabStateForRender(activeChatTabId)
  ), [activeChatTabId, getChatTabStateForRender])

  const hasConversation = useMemo(() => {
    return activeChatTabState.conversation.length > 0 || !!activeChatTabState.currentAssistantMessage
  }, [activeChatTabState])

  const isChatTabProcessing = useCallback((tab: ChatTab) => {
    return processingRunIds.has(tab.runId || '')
  }, [processingRunIds])

  const findTabByRunId = useCallback((runId: string | null | undefined) => {
    if (!runId) return undefined
    return chatTabs.find((tab) => tab.runId === runId)
  }, [chatTabs])

  return {
    chatDraftsRef,
    activeChatTabId,
    chatTabs,
    chatViewStateByTab,
    activeChatTabState,
    hasConversation,
    setChatTabs,
    setActiveChatTabId,
    isToolOpenForTab,
    setToolOpenForTab,
    clearToolOpenForTab,
    setChatDraftForTab,
    activateChatTab,
    switchChatTab,
    closeChatTab,
    openNewChatTab,
    openChatInNewTab,
    replaceActiveTabRunId,
    replaceTabRunId,
    getChatTabTitle,
    getChatTabStateForRender,
    isChatTabProcessing,
    findTabByRunId,
  }
}
