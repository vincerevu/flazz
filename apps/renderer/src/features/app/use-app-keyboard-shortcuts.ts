import { useEffect, type RefObject } from 'react'

import { GRAPH_TAB_PATH } from '@/features/knowledge/types'
import type { FileTab, ChatTab } from '@/components/tab-bar'

interface HistoryHandlers {
  undo: () => void
  redo: () => void
}

interface UseAppKeyboardShortcutsProps {
  isMac: boolean
  setIsSearchOpen: (open: boolean) => void
  selectedPath: string | null
  isGraphOpen: boolean
  activeFileTabId: string | null
  fileHistoryHandlersRef: RefObject<Map<string, HistoryHandlers>>
  isChatSidebarOpen: boolean
  isRightPaneMaximized: boolean
  activeShortcutPane: 'left' | 'right'
  fileTabs: FileTab[]
  chatTabs: ChatTab[]
  activeChatTabId: string
  closeFileTab: (tabId: string) => void
  closeChatTab: (tabId: string) => void
  switchFileTab: (tabId: string) => void
  switchChatTab: (tabId: string) => void
}

export function useAppKeyboardShortcuts({
  isMac,
  setIsSearchOpen,
  selectedPath,
  isGraphOpen,
  activeFileTabId,
  fileHistoryHandlersRef,
  isChatSidebarOpen,
  isRightPaneMaximized,
  activeShortcutPane,
  fileTabs,
  chatTabs,
  activeChatTabId,
  closeFileTab,
  closeChatTab,
  switchFileTab,
  switchChatTab,
}: UseAppKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setIsSearchOpen])

  useEffect(() => {
    const handleHistoryKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey) return

      const key = e.key.toLowerCase()
      const wantsUndo = key === 'z' && !e.shiftKey
      const wantsRedo = (key === 'z' && e.shiftKey) || (!isMac && key === 'y')
      if (!wantsUndo && !wantsRedo) return

      if (!selectedPath || !selectedPath.endsWith('.md') || !activeFileTabId) return

      const target = e.target as EventTarget | null
      if (target instanceof HTMLElement) {
        const inTipTapEditor = Boolean(target.closest('.tiptap-editor'))
        const inOtherTextInput = (
          target instanceof HTMLInputElement
          || target instanceof HTMLTextAreaElement
          || target.isContentEditable
        ) && !inTipTapEditor
        if (inOtherTextInput) return
      }

      const handlers = fileHistoryHandlersRef.current?.get(activeFileTabId)
      if (!handlers) return

      e.preventDefault()
      e.stopPropagation()
      if (wantsUndo) {
        handlers.undo()
      } else {
        handlers.redo()
      }
    }

    document.addEventListener('keydown', handleHistoryKeyDown, true)
    return () => document.removeEventListener('keydown', handleHistoryKeyDown, true)
  }, [activeFileTabId, fileHistoryHandlersRef, isMac, selectedPath])

  useEffect(() => {
    const handleTabKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const rightPaneAvailable = Boolean((selectedPath || isGraphOpen) && isChatSidebarOpen)
      const targetPane: 'left' | 'right' = rightPaneAvailable
        ? (isRightPaneMaximized ? 'right' : activeShortcutPane)
        : 'left'
      const inFileView = targetPane === 'left' && Boolean(selectedPath || isGraphOpen)
      const selectedKnowledgePath = isGraphOpen ? GRAPH_TAB_PATH : selectedPath
      const targetFileTabId = activeFileTabId ?? (
        selectedKnowledgePath
          ? (fileTabs.find((tab) => tab.path === selectedKnowledgePath)?.id ?? null)
          : null
      )

      if (e.key === 'w') {
        e.preventDefault()
        if (inFileView && targetFileTabId) {
          closeFileTab(targetFileTabId)
        } else {
          closeChatTab(activeChatTabId)
        }
        return
      }

      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const n = Number.parseInt(e.key, 10)
        if (inFileView) {
          const idx = e.key === '9' ? fileTabs.length - 1 : n - 1
          const tab = fileTabs[idx]
          if (tab) switchFileTab(tab.id)
        } else {
          const idx = e.key === '9' ? chatTabs.length - 1 : n - 1
          const tab = chatTabs[idx]
          if (tab) switchChatTab(tab.id)
        }
        return
      }

      if (e.shiftKey && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        const direction = e.key === ']' ? 1 : -1
        if (inFileView) {
          const currentIdx = fileTabs.findIndex((tab) => tab.id === targetFileTabId)
          if (currentIdx === -1) return
          const nextIdx = (currentIdx + direction + fileTabs.length) % fileTabs.length
          switchFileTab(fileTabs[nextIdx].id)
        } else {
          const currentIdx = chatTabs.findIndex((tab) => tab.id === activeChatTabId)
          if (currentIdx === -1) return
          const nextIdx = (currentIdx + direction + chatTabs.length) % chatTabs.length
          switchChatTab(chatTabs[nextIdx].id)
        }
      }
    }

    document.addEventListener('keydown', handleTabKeyDown)
    return () => document.removeEventListener('keydown', handleTabKeyDown)
  }, [
    activeChatTabId,
    activeFileTabId,
    activeShortcutPane,
    chatTabs,
    closeChatTab,
    closeFileTab,
    fileTabs,
    isChatSidebarOpen,
    isGraphOpen,
    isRightPaneMaximized,
    selectedPath,
    switchChatTab,
    switchFileTab,
  ])
}
