import { useState, useEffect, useCallback } from 'react'
import type { GraphNode, GraphEdge } from '@/components/graph-view'
import { stripKnowledgePrefix, wikiLabel, toKnowledgePath } from '@/lib/wiki-links'
import { workspaceIpc } from '@/services/workspace-ipc'

const graphPalette = [
  { hue: 210, sat: 72, light: 52 },
  { hue: 28, sat: 78, light: 52 },
  { hue: 120, sat: 62, light: 48 },
  { hue: 170, sat: 66, light: 46 },
  { hue: 280, sat: 70, light: 56 },
  { hue: 330, sat: 68, light: 54 },
  { hue: 55, sat: 80, light: 52 },
  { hue: 0, sat: 72, light: 52 },
]

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const wikiLinkRegex = /\[\[([^[\]]+)\]\]/g

export function useGraphView(isGraphOpen: boolean, knowledgeFilePaths: string[]) {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  })
  const [graphStatus, setGraphStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [graphError, setGraphError] = useState<string | null>(null)

  const buildGraph = useCallback(async (cancelledRef: { cancelled: boolean }) => {
    if (knowledgeFilePaths.length === 0) {
      setGraphData({ nodes: [], edges: [] })
      setGraphStatus('ready')
      return
    }

    setGraphStatus('loading')
    setGraphError(null)

    try {
      const edges: GraphEdge[] = []
      const nodeSet = new Set(knowledgeFilePaths)
      const edgeKeys = new Set<string>()

      for (const path of knowledgeFilePaths) {
        if (cancelledRef.cancelled) return
        const result = await workspaceIpc.readFile(path)
        const markdown = result.data
        const matches = markdown.matchAll(wikiLinkRegex)
        for (const match of matches) {
          const rawTarget = match[1].split('|')[0].split('#')[0].trim()
          const targetPath = toKnowledgePath(rawTarget)
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
        const normalized = stripKnowledgePrefix(path)
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
        const light = clampNumber(base.light + depth * 6, 36, 72)
        const strokeLight = clampNumber(light - 12, 28, 60)
        return {
          fill: `hsl(${base.hue} ${base.sat}% ${light}%)`,
          stroke: `hsl(${base.hue} ${Math.min(80, base.sat + 8)}% ${strokeLight}%)`,
        }
      }

      const nodes = knowledgeFilePaths.map((path) => {
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
  }, [knowledgeFilePaths])

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
