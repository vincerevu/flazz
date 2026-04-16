import { useState, useCallback, useEffect, useMemo } from 'react'
import type { TreeNode, DirEntry } from '../types'
import { stripMemoryPrefix, toMemoryPath } from '@/lib/wiki-links'
import { workspaceIpc } from '@/services/workspace-ipc'

// Sort nodes (dirs first, then alphabetically)
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  }).map(node => {
    if (node.children) {
      node.children = sortNodes(node.children)
    }
    return node
  })
}

// Build tree structure from flat entries
function buildTree(entries: DirEntry[]): TreeNode[] {
  const treeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Create nodes
  entries.forEach(entry => {
    const node: TreeNode = { ...entry, children: [], loaded: false }
    treeMap.set(entry.path, node)
  })

  // Build hierarchy
  entries.forEach(entry => {
    const node = treeMap.get(entry.path)!
    const parts = entry.path.split('/')
    if (parts.length === 1) {
      roots.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = treeMap.get(parentPath)
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  })

  return sortNodes(roots)
}

export const collectDirPaths = (nodes: TreeNode[]): string[] =>
  nodes.flatMap(n => n.kind === 'dir' ? [n.path, ...(n.children ? collectDirPaths(n.children) : [])] : [])

export const collectFilePaths = (nodes: TreeNode[]): string[] =>
  nodes.flatMap(n => n.kind === 'file' ? [n.path] : (n.children ? collectFilePaths(n.children) : []))

export const getAncestorDirectoryPaths = (path: string): string[] => {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return []
  const ancestors: string[] = []
  for (let i = 1; i < parts.length - 1; i++) {
    ancestors.push(parts.slice(0, i + 1).join('/'))
  }
  return ancestors
}

export function useWorkspaceTree() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const loadDirectory = useCallback(async () => {
    try {
      const result = await workspaceIpc.readdir('memory', { recursive: true, includeHidden: false })
      return buildTree(result)
    } catch (err) {
      console.error('Failed to load directory:', err)
      return []
    }
  }, [])

  const refreshTree = useCallback(async () => {
    const nextTree = await loadDirectory()
    setTree(nextTree)
    return nextTree
  }, [loadDirectory])

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshTree()
    }, 0)
    return () => clearTimeout(timer)
  }, [refreshTree])

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const expandPath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }, [])

  const expandAncestors = useCallback((path: string) => {
    const ancestors = getAncestorDirectoryPaths(path)
    if (ancestors.length === 0) return
    setExpandedPaths(prev => {
      let changed = false
      const next = new Set(prev)
      for (const dirPath of ancestors) {
        if (!next.has(dirPath)) {
          next.add(dirPath)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const memoryFiles = useMemo(() => {
    const files = collectFilePaths(tree).filter((path) => path.endsWith('.md'))
    return Array.from(new Set(files.map(stripMemoryPrefix)))
  }, [tree])

  const memoryFilePaths = useMemo(() => (
    memoryFiles.reduce<string[]>((acc, filePath) => {
      const resolved = toMemoryPath(filePath)
      if (resolved) acc.push(resolved)
      return acc
    }, [])
  ), [memoryFiles])

  const visibleMemoryFiles = useMemo(() => {
    const visible: string[] = []
    const isPathVisible = (path: string) => {
      const parts = path.split('/')
      if (parts.length <= 2) return true
      for (let i = 1; i < parts.length - 1; i++) {
        const parentPath = parts.slice(0, i + 1).join('/')
        if (!expandedPaths.has(parentPath)) return false
      }
      return true
    }

    for (const file of memoryFiles) {
      const fullPath = toMemoryPath(file)
      if (fullPath && isPathVisible(fullPath)) {
        visible.push(file)
      }
    }
    return visible
  }, [memoryFiles, expandedPaths])

  const expandAll = useCallback(() => setExpandedPaths(new Set(collectDirPaths(tree))), [tree])
  const collapseAll = useCallback(() => setExpandedPaths(new Set()), [])

  return {
    tree,
    setTree,
    expandedPaths,
    setExpandedPaths,
    refreshTree,
    toggleExpand,
    expandPath,
    expandAncestors,
    expandAll,
    collapseAll,
    memoryFiles,
    memoryFilePaths,
    visibleMemoryFiles,
  }
}
