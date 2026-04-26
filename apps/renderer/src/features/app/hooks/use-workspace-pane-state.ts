import { useCallback, useMemo } from 'react'

import type { FileTab } from '@/components/tab-bar'
import type { TreeNode } from '@/features/memory/types'
import { getMemoryCollectionMeta, isMemoryCollectionPath } from '@/features/memory/utils/collections'

function findTreeNode(nodes: TreeNode[], targetPath: string | null): TreeNode | null {
  if (!targetPath) return null
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children?.length) {
      const match = findTreeNode(node.children, targetPath)
      if (match) return match
    }
  }
  return null
}

type BaseMemoryActions = {
  createNote: (parentPath?: string) => Promise<void>
  createFolder: (parentPath?: string) => Promise<string | null | undefined>
  rename: (path: string, newName: string, isDir: boolean) => Promise<void>
  remove: (path: string) => Promise<void>
  copyPath: (path: string) => void
  onOpenInNewTab?: (path: string) => void
}

type UseWorkspacePaneStateOptions = {
  tree: TreeNode[]
  selectedPath: string | null
  fileTabs: FileTab[]
  baseMemoryActions: BaseMemoryActions
  refreshTree: () => Promise<unknown> | void
  expandPath: (path: string) => void
  expandAll: () => void
  collapseAll: () => void
  ensureGraphFileTab: () => void
  pendingFolderRenamePath: string | null
  setPendingFolderRenamePath: (path: string | null) => void
  navigateToFile: (path: string, opts?: { newTab?: boolean }) => void
}

export function useWorkspacePaneState({
  tree,
  selectedPath,
  fileTabs,
  baseMemoryActions,
  refreshTree,
  expandPath,
  expandAll,
  collapseAll,
  ensureGraphFileTab,
  pendingFolderRenamePath,
  setPendingFolderRenamePath,
  navigateToFile,
}: UseWorkspacePaneStateOptions) {
  const memoryActions = useMemo(() => ({
    ...baseMemoryActions,
    createNote: async (parentPath?: string) => {
      const result = await baseMemoryActions.createNote(parentPath)
      await refreshTree()
      return result
    },
    createFolder: async (parentPath?: string) => {
      const createdPath = await baseMemoryActions.createFolder(parentPath)
      if (!createdPath) return createdPath
      const parentDir = createdPath.split('/').slice(0, -1).join('/')
      if (parentDir) expandPath(parentDir)
      await refreshTree()
      setPendingFolderRenamePath(createdPath)
      return createdPath
    },
    rename: async (path: string, newName: string, isDir: boolean) => {
      const result = await baseMemoryActions.rename(path, newName, isDir)
      await refreshTree()
      return result
    },
    remove: async (path: string) => {
      const result = await baseMemoryActions.remove(path)
      await refreshTree()
      if (pendingFolderRenamePath === path) {
        setPendingFolderRenamePath(null)
      }
      return result
    },
    openGraph: ensureGraphFileTab,
    expandAll,
    collapseAll,
  }), [
    baseMemoryActions,
    collapseAll,
    ensureGraphFileTab,
    expandAll,
    expandPath,
    pendingFolderRenamePath,
    refreshTree,
    setPendingFolderRenamePath,
  ])

  const handleSelectMemoryItem = useCallback((path: string, _kind: 'file' | 'dir') => {
    navigateToFile(path)
  }, [navigateToFile])

  const selectedTreeNode = useMemo(() => findTreeNode(tree, selectedPath), [tree, selectedPath])
  const selectedCollection = useMemo(() => getMemoryCollectionMeta(selectedPath), [selectedPath])
  const isCollectionOpen = useMemo(
    () => Boolean(selectedTreeNode?.kind === 'dir' && isMemoryCollectionPath(selectedPath)),
    [selectedPath, selectedTreeNode],
  )

  const openMarkdownTabs = useMemo(() => {
    const markdownTabs = fileTabs.filter((tab) => tab.path.endsWith('.md'))
    if (selectedPath?.endsWith('.md')) {
      const hasSelectedTab = markdownTabs.some((tab) => tab.path === selectedPath)
      if (!hasSelectedTab) {
        return [...markdownTabs, { id: '__active-markdown-tab__', path: selectedPath }]
      }
    }
    return markdownTabs
  }, [fileTabs, selectedPath])

  return {
    memoryActions,
    handleSelectMemoryItem,
    selectedCollection,
    isCollectionOpen,
    openMarkdownTabs,
  }
}
