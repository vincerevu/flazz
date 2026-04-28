import { useState, useEffect, useCallback } from 'react'
import type { GraphNode, GraphEdge } from '@/components/graph-view'
import { stripMemoryPrefix, wikiLabel, toMemoryPath } from '@/lib/wiki-links'
import { workspaceIpc } from '@/services/workspace-ipc'
import { inferGraphTopicIcon } from '@/features/memory/utils/graph-node-topics'

const defaultGraphColor = { hue: 210, sat: 55, light: 58 }

const graphGroupColors: Record<string, { hue: number; sat: number; light: number }> = {
  root: { hue: 248, sat: 88, light: 64 },
  knowledge: { hue: 248, sat: 88, light: 64 },
  organizations: { hue: 200, sat: 90, light: 60 },
  organization: { hue: 200, sat: 90, light: 60 },
  people: { hue: 338, sat: 86, light: 62 },
  projects: { hue: 164, sat: 72, light: 52 },
  project: { hue: 164, sat: 72, light: 52 },
  skills: { hue: 32, sat: 94, light: 58 },
  skill: { hue: 32, sat: 94, light: 58 },
  topics: { hue: 118, sat: 78, light: 50 },
  topic: { hue: 118, sat: 78, light: 50 },
  'voice memos': { hue: 276, sat: 82, light: 62 },
  'voice memo': { hue: 276, sat: 82, light: 62 },
  voice: { hue: 276, sat: 82, light: 62 },
  work: { hue: 48, sat: 92, light: 58 },
  'failure patterns': { hue: 8, sat: 88, light: 60 },
}

const reservedHues = Object.values(graphGroupColors).map((color) => color.hue)

const hashString = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const createFallbackGroupColor = (group: string) => {
  const seed = hashString(group || 'default')
  let hue = seed % 360

  for (const reservedHue of reservedHues) {
    const distance = Math.min(
      Math.abs(hue - reservedHue),
      360 - Math.abs(hue - reservedHue),
    )
    if (distance < 18) {
      hue = (hue + 31) % 360
    }
  }

  return {
    hue,
    sat: 58 + (seed % 18),
    light: 56 + ((seed >> 3) % 8),
  }
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const wikiLinkRegex = /\[\[([^[\]]+)\]\]/g
const GRAPH_READ_CONCURRENCY = 8

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
      const fileRecords: Array<{ path: string; markdown: string }> = []
      let nextIndex = 0

      const worker = async () => {
        while (nextIndex < memoryFilePaths.length) {
          const currentIndex = nextIndex
          nextIndex += 1
          const path = memoryFilePaths[currentIndex]
          if (cancelledRef.cancelled) return
          const result = await workspaceIpc.readFile(path)
          if (cancelledRef.cancelled) return
          fileRecords.push({ path, markdown: result.data })
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(GRAPH_READ_CONCURRENCY, memoryFilePaths.length) },
          () => worker(),
        ),
      )
      if (cancelledRef.cancelled) return

      fileRecords.forEach(({ path, markdown }) => {
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
      })

      const degreeMap = new Map<string, number>()
      edges.forEach((edge) => {
        degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
        degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
      })

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

      const getNodeColors = (group: string, depth: number) => {
        const base =
          graphGroupColors[group.toLowerCase()] ??
          (group ? createFallbackGroupColor(group.toLowerCase()) : defaultGraphColor)
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
        const colors = getNodeColors(group, depth)
        const label = wikiLabel(path) || path
        return {
          id: path,
          label,
          degree,
          radius,
          group,
          color: colors.fill,
          stroke: colors.stroke,
          iconKey: inferGraphTopicIcon(path, label, group, {}),
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
