import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { ViewState, MarkdownHistoryHandlers } from '../types'
import {
  rewriteWikiLinksForRenamedFileInMarkdown,
  getHeadingTitle,
  sanitizeHeadingForFilename,
  isUntitledPlaceholderName,
  getBaseName,
} from '../utils/wiki-logic'
import { useDebounce } from '@/hooks/use-debounce'
import type { FileTab } from '@/components/tab-bar'
import { stripKnowledgePrefix, toKnowledgePath, wikiLabel } from '@/lib/wiki-links'
import { workspaceIpc } from '@/services/workspace-ipc'

const GRAPH_TAB_PATH = '__Flazz_graph_view__'
const untitledBaseName = 'untitled'

interface UseFileEditorOptions {
  workspaceRoot: string
  navigateToFile: (path: string) => void
  navigateToView: (view: ViewState) => void
  setHistory: (history: { back: ViewState[]; forward: ViewState[] }) => void
  historyRef: React.MutableRefObject<{ back: ViewState[]; forward: ViewState[] }>
  appendUnique: (stack: ViewState[], entry: ViewState) => ViewState[]
}

export function useFileEditor({
  workspaceRoot,
  navigateToFile,
  navigateToView,
  setHistory,
  historyRef,
  appendUnique,
}: UseFileEditorOptions) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [editorContent, setEditorContent] = useState<string>('')
  const editorContentRef = useRef<string>('')
  const [editorContentByPath, setEditorContentByPath] = useState<Record<string, string>>({})
  const editorContentByPathRef = useRef<Map<string, string>>(new Map())

  // Keep the latest selected path in a ref (avoids stale async updates when switching rapidly)
  const selectedPathRef = useRef<string | null>(null)
  const editorPathRef = useRef<string | null>(null)
  const fileLoadRequestIdRef = useRef(0)
  const initialContentByPathRef = useRef<Map<string, string>>(new Map())

  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const debouncedContent = useDebounce(editorContent, 500)
  const initialContentRef = useRef<string>('')
  const renameInProgressRef = useRef(false)

  const [fileTabs, setFileTabs] = useState<FileTab[]>([])
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null)
  const [editorSessionByTabId, setEditorSessionByTabId] = useState<Record<string, number>>({})
  const fileHistoryHandlersRef = useRef<Map<string, MarkdownHistoryHandlers>>(new Map())
  const fileTabIdCounterRef = useRef(0)
  const newFileTabId = () => `file-tab-${++fileTabIdCounterRef.current}`

  const [recentWikiFiles, setRecentWikiFiles] = useState<string[]>([])

  // Keep selectedPathRef in sync
  useEffect(() => {
    selectedPathRef.current = selectedPath
    if (!selectedPath) {
      editorPathRef.current = null
    }
  }, [selectedPath])

  const setEditorCacheForPath = useCallback((path: string, content: string) => {
    editorContentByPathRef.current.set(path, content)
    setEditorContentByPath((prev) => {
      if (prev[path] === content) return prev
      return { ...prev, [path]: content }
    })
  }, [])

  const removeEditorCacheForPath = useCallback((path: string) => {
    editorContentByPathRef.current.delete(path)
    setEditorContentByPath((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }, [])

  const handleEditorChange = useCallback((path: string, markdown: string) => {
    setEditorCacheForPath(path, markdown)
    const nextSelectedPath = selectedPathRef.current
    if (nextSelectedPath !== path) {
      return
    }
    if (!editorPathRef.current || (nextSelectedPath && editorPathRef.current === nextSelectedPath)) {
      editorPathRef.current = nextSelectedPath
    }
    editorContentRef.current = markdown
    setEditorContent(markdown)
  }, [setEditorCacheForPath])

  // Load file content
  useEffect(() => {
    if (!selectedPath) {
      setFileContent('')
      setEditorContent('')
      editorContentRef.current = ''
      initialContentRef.current = ''
      setLastSaved(null)
      return
    }
    if (selectedPath.endsWith('.md')) {
      const cachedContent = editorContentByPathRef.current.get(selectedPath)
      if (cachedContent !== undefined) {
        setFileContent(cachedContent)
        setEditorContent(cachedContent)
        editorContentRef.current = cachedContent
        editorPathRef.current = selectedPath
        initialContentRef.current = initialContentByPathRef.current.get(selectedPath) ?? cachedContent
        return
      }
    }
    const requestId = (fileLoadRequestIdRef.current += 1)
    const pathToLoad = selectedPath
    let cancelled = false
    ;(async () => {
      try {
        const stat = await workspaceIpc.stat(pathToLoad)
        if (cancelled || fileLoadRequestIdRef.current !== requestId || selectedPathRef.current !== pathToLoad) return
        if (stat.kind === 'file') {
          const result = await workspaceIpc.readFile(pathToLoad)
          if (cancelled || fileLoadRequestIdRef.current !== requestId || selectedPathRef.current !== pathToLoad) return
          setFileContent(result.data)
          const normalizeForCompare = (s: string) => s.split('\n').map(line => line.trimEnd()).join('\n').trim()
          const isSameEditorFile = editorPathRef.current === pathToLoad
          const wouldClobberActiveEdits =
            isSameEditorFile
            && normalizeForCompare(editorContentRef.current) !== normalizeForCompare(result.data)
          if (!wouldClobberActiveEdits) {
            setEditorContent(result.data)
            if (pathToLoad.endsWith('.md')) {
              setEditorCacheForPath(pathToLoad, result.data)
            }
            editorContentRef.current = result.data
            editorPathRef.current = pathToLoad
            initialContentByPathRef.current.set(pathToLoad, result.data)
            initialContentRef.current = result.data
            setLastSaved(null)
          } else {
            editorPathRef.current = pathToLoad
          }
        }
      } catch (err) {
        console.error('Failed to load file:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPath, setEditorCacheForPath])

  // Recent wiki files
  useEffect(() => {
    if (!selectedPath || !selectedPath.endsWith('.md')) return
    const wikiPath = stripKnowledgePrefix(selectedPath)
    setRecentWikiFiles((prev) => {
      const next = [wikiPath, ...prev.filter((path) => path !== wikiPath)]
      return next.slice(0, 50)
    })
  }, [selectedPath])

  // Auto-save logic
  useEffect(() => {
    const pathAtStart = editorPathRef.current
    if (!pathAtStart || !pathAtStart.endsWith('.md')) return

    const baseline = initialContentByPathRef.current.get(pathAtStart) ?? initialContentRef.current
    if (debouncedContent === baseline) return
    if (!debouncedContent) return

    const saveFile = async () => {
      const wasActiveAtStart = selectedPathRef.current === pathAtStart
      if (wasActiveAtStart) setIsSaving(true)
      let pathToSave = pathAtStart
      let contentToSave = debouncedContent
      let renamedFrom: string | null = null
      let renamedTo: string | null = null
      try {
        if (
          wasActiveAtStart &&
          selectedPathRef.current === pathAtStart &&
          !renameInProgressRef.current &&
          pathAtStart.startsWith('knowledge/')
        ) {
          const currentBase = getBaseName(pathAtStart)
          if (isUntitledPlaceholderName(currentBase)) {
            const headingTitle = getHeadingTitle(debouncedContent)
            const desiredName = headingTitle ? sanitizeHeadingForFilename(headingTitle) : null
            if (desiredName && desiredName !== currentBase) {
              const parentDir = pathAtStart.split('/').slice(0, -1).join('/')
              let targetPath = `${parentDir}/${desiredName}.md`
              if (targetPath !== pathAtStart) {
                let suffix = 1
                while (true) {
                  const exists = await workspaceIpc.exists(targetPath)
                  if (!exists.exists) break
                  targetPath = `${parentDir}/${desiredName}-${suffix}.md`
                  suffix += 1
                }
                renameInProgressRef.current = true
                await workspaceIpc.rename(pathAtStart, targetPath)
                pathToSave = targetPath
                contentToSave = rewriteWikiLinksForRenamedFileInMarkdown(
                  debouncedContent,
                  pathAtStart,
                  targetPath
                )
                renamedFrom = pathAtStart
                renamedTo = targetPath
                editorPathRef.current = targetPath
                setFileTabs(prev => prev.map(tab => (tab.path === pathAtStart ? { ...tab, path: targetPath } : tab)))
                initialContentByPathRef.current.delete(pathAtStart)
                const cachedContent = editorContentByPathRef.current.get(pathAtStart)
                if (cachedContent !== undefined) {
                  const rewrittenCachedContent = rewriteWikiLinksForRenamedFileInMarkdown(
                    cachedContent,
                    pathAtStart,
                    targetPath
                  )
                  editorContentByPathRef.current.delete(pathAtStart)
                  editorContentByPathRef.current.set(targetPath, rewrittenCachedContent)
                  setEditorContentByPath((prev) => {
                    const oldContent = prev[pathAtStart]
                    if (oldContent === undefined) return prev
                    const next = { ...prev }
                    delete next[pathAtStart]
                    next[targetPath] = rewriteWikiLinksForRenamedFileInMarkdown(
                      oldContent,
                      pathAtStart,
                      targetPath
                    )
                    return next
                  })
                }
                if (selectedPathRef.current === pathAtStart) {
                  editorContentRef.current = contentToSave
                  setEditorContent(contentToSave)
                }
              }
            }
          }
        }
        await workspaceIpc.writeFile(pathToSave, contentToSave, { encoding: 'utf8' })
        initialContentByPathRef.current.set(pathToSave, contentToSave)

        if (renamedFrom && renamedTo) {
          const fromPath = renamedFrom
          const toPath = renamedTo
          const replaceRenamedPath = (stack: ViewState[]) =>
            stack.map((v) => (v.type === 'file' && v.path === fromPath ? ({ type: 'file', path: toPath } satisfies ViewState) : v))
          setHistory({
            back: replaceRenamedPath(historyRef.current.back),
            forward: replaceRenamedPath(historyRef.current.forward),
          })

          if (selectedPathRef.current === fromPath) {
            setSelectedPath(toPath)
          }
        }

        if (selectedPathRef.current === pathAtStart || selectedPathRef.current === pathToSave) {
          initialContentRef.current = contentToSave
          setLastSaved(new Date())
        }
      } catch (err) {
        console.error('Failed to save file:', err)
      } finally {
        renameInProgressRef.current = false
        if (wasActiveAtStart && (selectedPathRef.current === pathAtStart || selectedPathRef.current === pathToSave)) {
          setIsSaving(false)
        }
      }
    }
    saveFile()
  }, [debouncedContent, setHistory, historyRef, appendUnique])

  const openFileInNewTab = useCallback((path: string) => {
    const existingTab = fileTabs.find((tab) => tab.path === path)
    if (existingTab) {
      setActiveFileTabId(existingTab.id)
      setSelectedPath(path)
      navigateToFile(path)
      return
    }
    const id = newFileTabId()
    setFileTabs((prev) => [...prev, { id, path }])
    setActiveFileTabId(id)
    setSelectedPath(path)
    navigateToFile(path)
  }, [fileTabs, navigateToFile])

  const closeFileTab = useCallback((tabId: string) => {
    const closingTab = fileTabs.find(t => t.id === tabId)
    if (closingTab && !closingTab.path.includes('__Flazz_graph_view__')) {
      removeEditorCacheForPath(closingTab.path)
      initialContentByPathRef.current.delete(closingTab.path)
      if (editorPathRef.current === closingTab.path) {
        editorPathRef.current = null
      }
    }
    setFileTabs(prev => {
      if (prev.length <= 1) {
        setActiveFileTabId(null)
        setSelectedPath(null)
        return []
      }
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return prev
      const next = prev.filter(t => t.id !== tabId)
      if (tabId === activeFileTabId && next.length > 0) {
        const newIdx = Math.min(idx, next.length - 1)
        const newActiveTab = next[newIdx]
        setActiveFileTabId(newActiveTab.id)
        if (newActiveTab.path.includes('__Flazz_graph_view__')) {
          setSelectedPath(null)
        } else {
          setSelectedPath(newActiveTab.path)
        }
      }
      return next
    })
    setEditorSessionByTabId((prev) => {
      if (!(tabId in prev)) return prev
      const next = { ...prev }
      delete next[tabId]
      return next
    })
    fileHistoryHandlersRef.current.delete(tabId)
  }, [activeFileTabId, fileTabs, removeEditorCacheForPath])

  const ensureFileTabForPath = useCallback((path: string) => {
    const existingTab = fileTabs.find((tab) => tab.path === path)
    if (existingTab) {
      setActiveFileTabId(existingTab.id)
      setSelectedPath(path)
      return
    }

    if (activeFileTabId) {
      const activeTab = fileTabs.find((tab) => tab.id === activeFileTabId)
      if (activeTab && !activeTab.path.includes('__Flazz_graph_view__')) {
        setFileTabs((prev) => prev.map((tab) => (
          tab.id === activeFileTabId ? { ...tab, path } : tab
        )))
        setEditorSessionByTabId((prev) => ({
          ...prev,
          [activeFileTabId]: (prev[activeFileTabId] ?? 0) + 1,
        }))
        setSelectedPath(path)
        return
      }
    }

    const id = newFileTabId()
    setFileTabs((prev) => [...prev, { id, path }])
    setActiveFileTabId(id)
    setSelectedPath(path)
  }, [fileTabs, activeFileTabId])

  const ensureGraphFileTab = useCallback(() => {
    const existingGraphTab = fileTabs.find((tab) => tab.path === GRAPH_TAB_PATH)
    if (existingGraphTab) {
      setActiveFileTabId(existingGraphTab.id)
      setSelectedPath(null)
      return
    }
    const id = newFileTabId()
    setFileTabs((prev) => [...prev, { id, path: GRAPH_TAB_PATH }])
    setActiveFileTabId(id)
    setSelectedPath(null)
  }, [fileTabs])

  const switchFileTab = useCallback((tabId: string) => {
    const tab = fileTabs.find(t => t.id === tabId)
    if (!tab) return
    setActiveFileTabId(tabId)
    if (tab.path === GRAPH_TAB_PATH) {
      setSelectedPath(null)
      navigateToView({ type: 'graph' })
    } else {
      setSelectedPath(tab.path)
      navigateToFile(tab.path)
    }
  }, [fileTabs, navigateToFile, navigateToView])

  const knowledgeActions = useMemo(() => ({
    createNote: async (parentPath: string = 'knowledge') => {
      try {
        let index = 0
        let name = untitledBaseName
        let fullPath = `${parentPath}/${name}.md`
        while (index < 1000) {
          const exists = await workspaceIpc.exists(fullPath)
          if (!exists.exists) break
          index += 1
          name = `${untitledBaseName}-${index}`
          fullPath = `${parentPath}/${name}.md`
        }
        await workspaceIpc.writeFile(fullPath, `# ${name}\n\n`, { encoding: 'utf8' })
        navigateToFile(fullPath)
      } catch (err) {
        console.error('Failed to create note:', err)
        throw err
      }
    },
    createFolder: async (parentPath: string = 'knowledge') => {
      try {
        await workspaceIpc.mkdir(`${parentPath}/new-folder-${Date.now()}`, { recursive: true })
      } catch (err) {
        console.error('Failed to create folder:', err)
        throw err
      }
    },
    rename: async (oldPath: string, newName: string, isDir: boolean) => {
      try {
        const parts = oldPath.split('/')
        const finalName = isDir ? newName : (newName.endsWith('.md') ? newName : `${newName}.md`)
        parts[parts.length - 1] = finalName
        const newPath = parts.join('/')
        await workspaceIpc.rename(oldPath, newPath)
        const rewriteForRename = (content: string) =>
          isDir ? content : rewriteWikiLinksForRenamedFileInMarkdown(content, oldPath, newPath)
        setFileTabs(prev => prev.map(tab => (tab.path === oldPath ? { ...tab, path: newPath } : tab)))
        if (editorPathRef.current === oldPath) {
          editorPathRef.current = newPath
        }
        const baseline = initialContentByPathRef.current.get(oldPath)
        if (baseline !== undefined) {
          initialContentByPathRef.current.delete(oldPath)
          initialContentByPathRef.current.set(newPath, rewriteForRename(baseline))
        }
        const cachedContent = editorContentByPathRef.current.get(oldPath)
        if (cachedContent !== undefined) {
          const rewrittenCachedContent = rewriteForRename(cachedContent)
          editorContentByPathRef.current.delete(oldPath)
          editorContentByPathRef.current.set(newPath, rewrittenCachedContent)
          setEditorContentByPath(prev => {
            if (!(oldPath in prev)) return prev
            const next = { ...prev }
            delete next[oldPath]
            next[newPath] = rewriteForRename(cachedContent)
            return next
          })
        }
        if (selectedPath === oldPath) {
          const rewrittenEditorContent = rewriteForRename(editorContentRef.current)
          editorContentRef.current = rewrittenEditorContent
          setEditorContent(rewrittenEditorContent)
          initialContentRef.current = rewriteForRename(initialContentRef.current)
          setSelectedPath(newPath)
        }
      } catch (err) {
        console.error('Failed to rename:', err)
        throw err
      }
    },
    remove: async (path: string) => {
      try {
        await workspaceIpc.remove(path, { trash: true })
        if (path.endsWith('.md')) {
          removeEditorCacheForPath(path)
          initialContentByPathRef.current.delete(path)
        }
        const tabForFile = fileTabs.find(t => t.path === path)
        if (tabForFile) {
          closeFileTab(tabForFile.id)
        } else if (selectedPath === path) {
          setSelectedPath(null)
        }
      } catch (err) {
        console.error('Failed to remove:', err)
        throw err
      }
    },
    copyPath: (path: string) => {
      const fullPath = workspaceRoot ? `${workspaceRoot}/${path}` : path
      navigator.clipboard.writeText(fullPath)
    },
    onOpenInNewTab: (path: string) => {
      openFileInNewTab(path)
    },
  }), [selectedPath, workspaceRoot, navigateToFile, openFileInNewTab, fileTabs, closeFileTab, removeEditorCacheForPath])

  const ensureWikiFile = useCallback(async (wikiPath: string) => {
    const resolvedPath = toKnowledgePath(wikiPath)
    if (!resolvedPath) return null
    try {
      const exists = await workspaceIpc.exists(resolvedPath)
      if (!exists.exists) {
        const title = wikiLabel(wikiPath) || 'New Note'
        await workspaceIpc.writeFile(resolvedPath, `# ${title}\n\n`, { encoding: 'utf8', mkdirp: true })
      }
      return resolvedPath
    } catch (err) {
      console.error('Failed to ensure wiki link target:', err)
      return null
    }
  }, [])

  const openWikiLink = useCallback(async (wikiPath: string) => {
    const resolvedPath = await ensureWikiFile(wikiPath)
    if (resolvedPath) {
      navigateToFile(resolvedPath)
    }
  }, [ensureWikiFile, navigateToFile])

  return {
    selectedPath,
    setSelectedPath,
    fileContent,
    setFileContent,
    editorContent,
    setEditorContent,
    editorContentByPath,
    isSaving,
    lastSaved,
    handleEditorChange,
    fileTabs,
    setFileTabs,
    activeFileTabId,
    setActiveFileTabId,
    editorSessionByTabId,
    fileHistoryHandlersRef,
    recentWikiFiles,
    knowledgeActions,
    ensureFileTabForPath,
    ensureGraphFileTab,
    switchFileTab,
    closeFileTab,
    openFileInNewTab,
    setEditorCacheForPath,
    removeEditorCacheForPath,
    ensureWikiFile,
    openWikiLink,
    selectedPathRef,
    editorPathRef,
    initialContentByPathRef,
    initialContentRef,
  }
}
