import { useState, useEffect, useCallback } from 'react'
import type { GraphNode, GraphEdge } from '@/components/graph-view'
import { stripMemoryPrefix, wikiLabel, toMemoryPath } from '@/lib/wiki-links'
import { workspaceIpc } from '@/services/workspace-ipc'

// Vibrant color palette - works well in both dark and light themes
const graphPalette = [
  { hue: 260, sat: 85, light: 65 },  // Purple - vibrant
  { hue: 200, sat: 90, light: 60 },  // Blue - bright
  { hue: 340, sat: 85, light: 60 },  // Pink - vivid
  { hue: 160, sat: 75, light: 55 },  // Teal - fresh
  { hue: 30, sat: 90, light: 60 },   // Orange - warm
  { hue: 120, sat: 70, light: 55 },  // Green - natural
  { hue: 280, sat: 80, light: 60 },  // Magenta - bold
  { hue: 50, sat: 85, light: 60 },   // Yellow - bright
]

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const wikiLinkRegex = /\[\[([^[\]]+)\]\]/g

export function useGraphView(isGraphOpen: boolean, memoryFilePaths: string[]) {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  })
  const [graphStatus, setGraphStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [graphError, setGraphError] = useState<string | null>(null)

  const buildGraph = useCallback(async (cancelledRef: { cancelled: boolean }) => {
    if (memoryFilePaths.length === 0) {
      setGraphData({ nodes: [], edges: [] })
      setGraphStatus('ready')
      return
    }

    setGraphStatus('loading')
    setGraphError(null)

    try {
      const edges: GraphEdge[] = []
      const nodeSet = new Set(memoryFilePaths)
      const edgeKeys = new Set<string>()

      for (const path of memoryFilePaths) {
        if (cancelledRef.cancelled) return
        const result = await workspaceIpc.readFile(path)
        const markdown = result.data
        const matches = markdown.matchAll(wikiLinkRegex)
        for (const match of matches) {
          const rawTarget = match[1].split('|')[0].split('#')[0].trim()
          const targetPath = toMemoryPath(rawTarget)
          if (!targetPath || targetPath === path) continue
          if (!nodeSet.has(targetPath)) continue
          const edgeKey = path < targetPath ? `${path}|${targetPath}` : `${targetPath}|${path}`
          if (edgeKeys.has(edgeKey)) continue
          edgeKeys.add(edgeKey)
          edges.push({ source: path, target: targetPath })
        }
      }

      const degreeMap = new Map<string, number>()
      edges.forEach((edge) => {
        degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
        degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
      })

      const groupIndexMap = new Map<string, number>()
      const getGroupIndex = (group: string) => {
        const existing = groupIndexMap.get(group)
        if (existing !== undefined) return existing
        const nextIndex = groupIndexMap.size
        groupIndexMap.set(group, nextIndex)
        return nextIndex
      }

      const getNodeGroup = (path: string) => {
        const normalized = stripMemoryPrefix(path)
        const parts = normalized.split('/').filter(Boolean)
        if (parts.length <= 1) {
          return { group: 'root', depth: 0 }
        }
        return {
          group: parts[0],
          depth: Math.max(0, parts.length - 2),
        }
      }

      const getNodeColors = (groupIndex: number, depth: number) => {
        const base = graphPalette[groupIndex % graphPalette.length]
        // Adjust lightness for better visibility in both themes
        // Light theme: slightly darker, Dark theme: slightly lighter
        const light = clampNumber(base.light + depth * 4, 50, 70)
        const strokeLight = clampNumber(light - 15, 35, 55)
        return {
          fill: `hsl(${base.hue} ${base.sat}% ${light}%)`,
          stroke: `hsl(${base.hue} ${Math.min(90, base.sat + 10)}% ${strokeLight}%)`,
        }
      }

      const nodes = memoryFilePaths.map((path) => {
        const degree = degreeMap.get(path) ?? 0
        const radius = 6 + Math.min(18, degree * 2)
        const { group, depth } = getNodeGroup(path)
        const groupIndex = getGroupIndex(group)
        const colors = getNodeColors(groupIndex, depth)
        return {
          id: path,
          label: wikiLabel(path) || path,
          degree,
          radius,
          group,
          color: colors.fill,
          stroke: colors.stroke,
        }
      })

      if (!cancelledRef.cancelled) {
        setGraphData({ nodes, edges })
        setGraphStatus('ready')
      }
    } catch (err) {
      if (!cancelledRef.cancelled) {
        console.error('Failed to build graph:', err)
        setGraphStatus('error')
        setGraphError(err instanceof Error ? err.message : 'Failed to build graph')
      }
    }
  }, [memoryFilePaths])

  useEffect(() => {
    if (!isGraphOpen) return

    const cancelledRef = { cancelled: false }
    // Initial build
    const timer = setTimeout(() => {
      buildGraph(cancelledRef)
    }, 0)
    
    return () => {
      clearTimeout(timer)
      cancelledRef.cancelled = true
    }
  }, [isGraphOpen, buildGraph])

  return {
    graphData,
    graphStatus,
    graphError,
    refreshGraph: () => buildGraph({ cancelled: false }),
  }
}
