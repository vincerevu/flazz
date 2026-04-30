import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'
import type { NodeHoverDrawingFunction, NodeLabelDrawingFunction } from 'sigma/rendering'
import type { CameraState, SigmaNodeEventPayload } from 'sigma/types'
import {
  Check,
  ChevronDown,
  Search,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GraphTopicIconKey } from '@/features/memory/utils/graph-node-topics'

export type GraphNode = {
  id: string
  label: string
  degree: number
  radius: number
  group: string
  color: string
  stroke: string
  iconKey: GraphTopicIconKey
}

export type GraphEdge = {
  source: string
  target: string
}

type GraphViewProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  isLoading?: boolean
  error?: string | null
  onSelectNode?: (id: string) => void
}

type SigmaNodeAttributes = {
  x: number
  y: number
  label: string
  size: number
  color: string
  baseColor: string
  stroke: string
  group: string
  degree: number
  zIndex: number
}

type SigmaEdgeAttributes = {
  source: string
  target: string
  color: string
  size: number
  weight: number
}

type SigmaGraph = Graph<SigmaNodeAttributes, SigmaEdgeAttributes>
type SigmaRenderer = Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>
type CachedLayout = Map<string, { x: number; y: number }>
type CachedGraphState = {
  camera: CameraState | null
  layout: CachedLayout
}

const HIDE_EDGES_ON_MOVE_EDGE_LIMIT = 280
const MAX_GRAPH_STATE_CACHE_SIZE = 4
const GRAPH_LAYOUT_VERSION = 2
const MUTED_NODE_COLOR = '#343946'
const MUTED_EDGE_COLOR = '#252a34'
const DEFAULT_EDGE_COLOR = '#3b4350'
const ACTIVE_EDGE_COLOR = '#94a3b8'
const SEARCH_EDGE_COLOR = '#cbd5e1'
const LABEL_BACKGROUND_COLOR = 'rgba(15, 23, 42, 0.92)'
const LABEL_BORDER_COLOR = 'rgba(255, 255, 255, 0.24)'
const LABEL_TEXT_COLOR = '#f8fafc'
const LABEL_SHADOW_COLOR = 'rgba(0, 0, 0, 0.25)'
const graphStateCache = new Map<string, CachedGraphState>()

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(value: string, salt: string) {
  return hashString(`${value}:${salt}`) / 0xffffffff
}

function createGraphSignature(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodePart = nodes
    .map((node) => `${node.id}:${node.label}:${node.group}:${node.degree}`)
    .sort()
    .join('\n')
  const edgePart = edges
    .map((edge) => (edge.source < edge.target ? `${edge.source}|${edge.target}` : `${edge.target}|${edge.source}`))
    .sort()
    .join('\n')
  return `${GRAPH_LAYOUT_VERSION}:${nodes.length}:${edges.length}:${hashString(`${nodePart}\n--\n${edgePart}`)}`
}

function rememberGraphState(signature: string, state: CachedGraphState) {
  if (!signature) return
  graphStateCache.delete(signature)
  graphStateCache.set(signature, state)
  while (graphStateCache.size > MAX_GRAPH_STATE_CACHE_SIZE) {
    const oldestKey = graphStateCache.keys().next().value
    if (!oldestKey) break
    graphStateCache.delete(oldestKey)
  }
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function truncateCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text

  let truncated = text
  while (truncated.length > 1 && context.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}...`
}

const drawGraphNodeLabel: NodeLabelDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes> = (
  context,
  data,
  settings,
) => {
  if (!data.label) return

  const fontSize = settings.labelSize
  context.font = `${settings.labelWeight} ${fontSize}px ${settings.labelFont}`
  context.textBaseline = 'middle'

  const maxTextWidth = 170
  const text = truncateCanvasText(context, data.label, maxTextWidth)
  const textWidth = Math.ceil(context.measureText(text).width)
  const labelHeight = 22
  const dotSize = 8
  const gap = 6
  const paddingX = 7
  const labelX = data.x + data.size + 7
  const labelY = data.y - labelHeight / 2
  const labelWidth = paddingX + dotSize + gap + textWidth + paddingX

  context.save()
  context.shadowColor = LABEL_SHADOW_COLOR
  context.shadowBlur = 8
  context.shadowOffsetY = 2
  drawRoundedRect(context, labelX, labelY, labelWidth, labelHeight, 4)
  context.fillStyle = LABEL_BACKGROUND_COLOR
  context.fill()

  context.shadowColor = 'transparent'
  context.lineWidth = 1
  context.strokeStyle = LABEL_BORDER_COLOR
  context.stroke()

  context.beginPath()
  context.arc(labelX + paddingX + dotSize / 2, data.y, dotSize / 2, 0, Math.PI * 2)
  context.fillStyle = data.color
  context.fill()

  context.fillStyle = LABEL_TEXT_COLOR
  context.fillText(text, labelX + paddingX + dotSize + gap, data.y)
  context.restore()
}

const drawGraphNodeHover: NodeHoverDrawingFunction<SigmaNodeAttributes, SigmaEdgeAttributes> = (
  context,
  data,
  settings,
) => {
  context.save()
  context.beginPath()
  context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2)
  context.fillStyle = 'rgba(248, 250, 252, 0.16)'
  context.fill()
  context.lineWidth = 1.5
  context.strokeStyle = 'rgba(248, 250, 252, 0.7)'
  context.stroke()
  context.restore()

  drawGraphNodeLabel(context, data, settings)
}

function hslToHex(color: string) {
  const match = color.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/i)
  if (!match) return color

  const hue = Number(match[1])
  const saturation = Number(match[2]) / 100
  const lightness = Number(match[3]) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const second = chroma * (1 - Math.abs((segment % 2) - 1))
  const offset = lightness - chroma / 2
  const [r1, g1, b1] =
    segment < 1 ? [chroma, second, 0]
      : segment < 2 ? [second, chroma, 0]
        : segment < 3 ? [0, chroma, second]
          : segment < 4 ? [0, second, chroma]
            : segment < 5 ? [second, 0, chroma]
              : [chroma, 0, second]

  const toHex = (channel: number) => {
    const value = Math.round((channel + offset) * 255)
    return clamp(value, 0, 255).toString(16).padStart(2, '0')
  }

  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`
}

function buildSigmaGraph(nodes: GraphNode[], edges: GraphEdge[], cachedLayout: CachedLayout) {
  const graph: SigmaGraph = new Graph({ type: 'undirected', allowSelfLoops: false })
  const count = Math.max(1, nodes.length)
  const radius = Math.max(16, Math.min(80, Math.sqrt(count) * 8))
  let reusedNodeCount = 0

  nodes.forEach((node) => {
    const angle = seededUnit(node.id, 'angle') * Math.PI * 2
    const distance = Math.sqrt(seededUnit(node.id, 'radius')) * radius
    const cached = cachedLayout.get(node.id)
    if (cached) {
      reusedNodeCount += 1
    }
    const size = 3 + Math.min(7, Math.sqrt(Math.max(0, node.degree)) * 1.4)
    const color = hslToHex(node.color)
    graph.addNode(node.id, {
      x: cached?.x ?? distance * Math.cos(angle),
      y: cached?.y ?? distance * Math.sin(angle),
      label: node.label,
      size,
      color,
      baseColor: color,
      stroke: hslToHex(node.stroke),
      group: node.group || 'root',
      degree: node.degree,
      zIndex: 1 + node.degree,
    })
  })

  edges.forEach((edge, index) => {
    if (edge.source === edge.target) return
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    const key = `${edge.source}|${edge.target}|${index}`
    graph.addUndirectedEdgeWithKey(key, edge.source, edge.target, {
      source: edge.source,
      target: edge.target,
      color: DEFAULT_EDGE_COLOR,
      size: 1,
      weight: 1,
    })
  })

  const reusedMostLayout = reusedNodeCount >= graph.order * 0.8
  if (graph.order > 1 && !reusedMostLayout) {
    const inferred = forceAtlas2.inferSettings(graph)
    forceAtlas2.assign(graph, {
      iterations: graph.order > 1000 ? 80 : graph.order > 500 ? 120 : graph.order > 150 ? 180 : 240,
      getEdgeWeight: 'weight',
      settings: {
        ...inferred,
        adjustSizes: true,
        barnesHutOptimize: graph.order > 80,
        edgeWeightInfluence: 1.25,
        gravity: 1.1,
        linLogMode: false,
        outboundAttractionDistribution: false,
        scalingRatio: 4.5,
        slowDown: 10,
      },
    })
  }

  return graph
}

export function GraphView({ nodes, edges, isLoading, error, onSelectNode }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<SigmaRenderer | null>(null)
  const graphRef = useRef<SigmaGraph | null>(null)
  const onSelectNodeRef = useRef(onSelectNode)
  const layoutCacheRef = useRef<CachedLayout>(new Map())
  const cameraStateRef = useRef<CameraState | null>(null)
  const graphInputRef = useRef<{ nodes: GraphNode[]; edgeList: GraphEdge[] }>({ nodes, edgeList: [] })
  const graphSignatureRef = useRef('')
  const draggedNodeRef = useRef<string | null>(null)
  const draggedNodeMovedRef = useRef(false)
  const visualStateRef = useRef<{
    hoveredNodeId: string | null
    selectedGroups: Set<string>
    searchMatchingNodes: { matches: Set<string>; directMatches: Set<string> } | null
    hasSelectedGroups: boolean
    connectedNodes: Set<string> | null
  }>({
    hoveredNodeId: null,
    selectedGroups: new Set(),
    searchMatchingNodes: null,
    hasSelectedGroups: false,
    connectedNodes: null,
  })

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

  const edgeList = useMemo(
    () => edges.filter((edge) => edge.source !== edge.target),
    [edges],
  )
  const graphSignature = useMemo(
    () => createGraphSignature(nodes, edgeList),
    [edgeList, nodes],
  )

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode
  }, [onSelectNode])

  useEffect(() => {
    graphInputRef.current = { nodes, edgeList }
  }, [edgeList, nodes])

  const legendItems = useMemo(() => {
    const grouped = new Map<string, { group: string; label: string; color: string; stroke: string }>()
    nodes.forEach((node) => {
      const group = node.group || 'root'
      if (grouped.has(group)) return
      grouped.set(group, {
        group,
        label: group === 'root' ? 'Knowledge' : toTitleCase(group),
        color: node.color,
        stroke: node.stroke,
      })
    })
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [nodes])

  const searchMatchingNodes = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.toLowerCase()
    const directMatches = new Set<string>()
    nodes.forEach((node) => {
      if (node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query)) {
        directMatches.add(node.id)
      }
    })
    const withConnections = new Set(directMatches)
    edgeList.forEach((edge) => {
      if (directMatches.has(edge.source)) withConnections.add(edge.target)
      if (directMatches.has(edge.target)) withConnections.add(edge.source)
    })
    return { matches: withConnections, directMatches }
  }, [edgeList, nodes, searchQuery])

  const activeNodeId = hoveredNodeId
  const hasSelectedGroups = selectedGroups.size > 0
  const connectedNodes = useMemo(() => {
    if (!activeNodeId) return null
    const set = new Set([activeNodeId])
    edgeList.forEach((edge) => {
      if (edge.source === activeNodeId) set.add(edge.target)
      if (edge.target === activeNodeId) set.add(edge.source)
    })
    return set
  }, [activeNodeId, edgeList])
  const selectedGroupLabels = useMemo(() => (
    Array.from(selectedGroups)
      .map((group) => legendItems.find((item) => item.group === group)?.label ?? group)
      .join(', ')
  ), [legendItems, selectedGroups])

  useEffect(() => {
    visualStateRef.current = {
      hoveredNodeId,
      selectedGroups,
      searchMatchingNodes,
      hasSelectedGroups,
      connectedNodes,
    }
    sigmaRef.current?.refresh()
  }, [connectedNodes, hasSelectedGroups, hoveredNodeId, searchMatchingNodes, selectedGroups])

  const createNodeReducer = useCallback(() => (
    (node: string, data: SigmaNodeAttributes) => {
      const state = visualStateRef.current
      const isConnected = state.connectedNodes ? state.connectedNodes.has(node) : true
      const isDirectSearchMatch = state.searchMatchingNodes
        ? state.searchMatchingNodes.directMatches.has(node)
        : false
      const isSearchMatch = state.searchMatchingNodes
        ? state.searchMatchingNodes.matches.has(node)
        : true
      const isGroupMatch = state.hasSelectedGroups ? state.selectedGroups.has(data.group) : true
      const isPrimary = state.hoveredNodeId === node || isDirectSearchMatch || (state.hasSelectedGroups && isGroupMatch)

      if (state.hasSelectedGroups && !isGroupMatch) {
        return { ...data, color: MUTED_NODE_COLOR, size: Math.max(2, data.size * 0.65), label: null }
      }
      if (state.searchMatchingNodes && !isSearchMatch) {
        return { ...data, color: MUTED_NODE_COLOR, size: Math.max(2, data.size * 0.65), label: null }
      }
      if (state.hoveredNodeId && !isConnected) {
        return { ...data, color: MUTED_NODE_COLOR, size: Math.max(2, data.size * 0.75), label: null }
      }

      return {
        ...data,
        color: isPrimary ? data.stroke : data.baseColor,
        size: isPrimary ? data.size * 1.12 : data.size,
        forceLabel: isPrimary || isDirectSearchMatch,
        zIndex: isPrimary ? 1000 + data.degree : data.zIndex,
        highlighted: isPrimary,
      }
    }
  ), [])

  const createEdgeReducer = useCallback(() => (
    (_edge: string, data: SigmaEdgeAttributes) => {
      const state = visualStateRef.current
      const activeId = state.hoveredNodeId
      const isActiveEdge = activeId
        ? data.source === activeId || data.target === activeId
        : false
      const isSearchEdge = state.searchMatchingNodes
        ? state.searchMatchingNodes.matches.has(data.source) && state.searchMatchingNodes.matches.has(data.target)
        : false
      const isGroupEdge = state.hasSelectedGroups && graphRef.current
        ? state.selectedGroups.has(graphRef.current.getNodeAttribute(data.source, 'group')) &&
          state.selectedGroups.has(graphRef.current.getNodeAttribute(data.target, 'group'))
        : false

      if (state.hasSelectedGroups && !isGroupEdge) {
        return { ...data, color: MUTED_EDGE_COLOR, size: 0.35 }
      }
      if (state.searchMatchingNodes && !isSearchEdge) {
        return { ...data, color: MUTED_EDGE_COLOR, size: 0.35 }
      }
      if (activeId && !isActiveEdge) {
        return { ...data, color: MUTED_EDGE_COLOR, size: 0.35 }
      }

      return {
        ...data,
        color: isActiveEdge ? ACTIVE_EDGE_COLOR : state.searchMatchingNodes ? SEARCH_EDGE_COLOR : DEFAULT_EDGE_COLOR,
        size: isActiveEdge || isSearchEdge || isGroupEdge ? 1.8 : 1,
      }
    }
  ), [])

  useEffect(() => {
    const container = containerRef.current
    const currentInput = graphInputRef.current
    if (!container || currentInput.nodes.length === 0) return

    graphSignatureRef.current = graphSignature
    const cachedState = graphStateCache.get(graphSignature)
    if (cachedState) {
      layoutCacheRef.current = new Map(cachedState.layout)
      cameraStateRef.current = cachedState.camera
    } else {
      layoutCacheRef.current = new Map()
      cameraStateRef.current = null
    }

    const graph = buildSigmaGraph(currentInput.nodes, currentInput.edgeList, layoutCacheRef.current)
    graphRef.current = graph

    const renderer = new Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>(graph, container, {
      allowInvalidContainer: true,
      autoCenter: true,
      autoRescale: true,
      defaultEdgeColor: DEFAULT_EDGE_COLOR,
      defaultDrawNodeHover: drawGraphNodeHover,
      defaultDrawNodeLabel: drawGraphNodeLabel,
      defaultNodeColor: '#64748b',
      enableEdgeEvents: false,
      hideEdgesOnMove: graph.size > HIDE_EDGES_ON_MOVE_EDGE_LIMIT,
      hideLabelsOnMove: true,
      itemSizesReference: 'screen',
      labelColor: { color: LABEL_TEXT_COLOR },
      labelDensity: 0.08,
      labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
      labelRenderedSizeThreshold: 6,
      labelSize: 11,
      minCameraRatio: 0.04,
      maxCameraRatio: 6,
      nodeReducer: createNodeReducer(),
      edgeReducer: createEdgeReducer(),
      renderEdgeLabels: false,
      renderLabels: true,
      zIndex: true,
    })
    sigmaRef.current = renderer
    if (cameraStateRef.current) {
      renderer.getCamera().setState(cameraStateRef.current)
    }

    const handleEnterNode = ({ node }: SigmaNodeEventPayload) => {
      setHoveredNodeId(node)
    }
    const handleLeaveNode = () => {
      setHoveredNodeId(null)
    }
    const handleClickNode = ({ node }: SigmaNodeEventPayload) => {
      if (!draggedNodeMovedRef.current) {
        onSelectNodeRef.current?.(node)
      }
    }
    const handleDownNode = ({ node, preventSigmaDefault }: SigmaNodeEventPayload) => {
      draggedNodeRef.current = node
      draggedNodeMovedRef.current = false
      preventSigmaDefault()
      renderer.getCamera().disable()
    }
    const handleMouseMove = (event: { x: number; y: number }) => {
      const draggedNode = draggedNodeRef.current
      if (!draggedNode) return
      const position = renderer.viewportToGraph({ x: event.x, y: event.y })
      graph.setNodeAttribute(draggedNode, 'x', position.x)
      graph.setNodeAttribute(draggedNode, 'y', position.y)
      draggedNodeMovedRef.current = true
      renderer.scheduleRender()
    }
    const handleMouseUp = () => {
      draggedNodeRef.current = null
      renderer.getCamera().enable()
    }
    const handleCameraUpdate = (state: CameraState) => {
      cameraStateRef.current = state
    }

    renderer.on('enterNode', handleEnterNode)
    renderer.on('leaveNode', handleLeaveNode)
    renderer.on('clickNode', handleClickNode)
    renderer.on('downNode', handleDownNode)
    renderer.getMouseCaptor().on('mousemovebody', handleMouseMove)
    renderer.getMouseCaptor().on('mouseup', handleMouseUp)
    renderer.getCamera().on('updated', handleCameraUpdate)

    const resizeObserver = new ResizeObserver(() => {
      renderer.resize()
      renderer.scheduleRender()
    })
    resizeObserver.observe(container)

    return () => {
      const nextLayout: CachedLayout = new Map()
      graph.forEachNode((node, attributes) => {
        nextLayout.set(node, { x: attributes.x, y: attributes.y })
      })
      layoutCacheRef.current = nextLayout
      cameraStateRef.current = renderer.getCamera().getState()
      rememberGraphState(graphSignatureRef.current, {
        camera: cameraStateRef.current,
        layout: nextLayout,
      })
      resizeObserver.disconnect()
      renderer.kill()
      sigmaRef.current = null
      graphRef.current = null
      draggedNodeRef.current = null
      draggedNodeMovedRef.current = false
    }
  }, [createEdgeReducer, createNodeReducer, graphSignature])

  return (
    <div className="graph-view relative h-full w-full">
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!error && isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
          Loading graph...
        </div>
      ) : null}

      {!error && !isLoading && nodes.length === 0 ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
          No notes found.
        </div>
      ) : null}

      <div
        className="absolute left-3 right-3 top-3 z-20"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search nodes..."
              className="h-10 border-border/70 bg-background/88 pl-9 pr-20 shadow-lg backdrop-blur"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {searchMatchingNodes ? (
                <span className="text-xs text-muted-foreground">
                  {searchMatchingNodes.directMatches.size}
                </span>
              ) : null}
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>

          {legendItems.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex h-10 w-[260px] shrink-0 items-center justify-between rounded-lg border border-border/70 bg-background/88 px-3 text-sm text-foreground shadow-lg backdrop-blur transition-colors hover:bg-foreground/6">
                  <span className="truncate text-left">
                    {hasSelectedGroups ? selectedGroupLabels : 'All types'}
                  </span>
                  <ChevronDown className="ml-2 size-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2">
                <div className="grid gap-1">
                  <button
                    onClick={() => setSelectedGroups(new Set())}
                    className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/8 ${
                      !hasSelectedGroups ? 'bg-foreground/8 text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center">
                      {!hasSelectedGroups ? <Check className="size-4" /> : null}
                    </span>
                    <span>All types</span>
                  </button>
                  {legendItems.map((item) => {
                    const isSelected = selectedGroups.has(item.group)
                    return (
                      <button
                        key={item.group}
                        onClick={() => {
                          setSelectedGroups((prev) => {
                            const next = new Set(prev)
                            if (next.has(item.group)) {
                              next.delete(item.group)
                            } else {
                              next.add(item.group)
                            }
                            return next
                          })
                        }}
                        className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/8 ${
                          isSelected ? 'bg-foreground/8 text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        <span className="inline-flex h-4 w-4 items-center justify-center">
                          {isSelected ? <Check className="size-4" style={{ color: item.stroke }} /> : null}
                        </span>
                        <span
                          className="inline-flex h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color, boxShadow: `0 0 0 1px ${item.stroke}` }}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>

      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
