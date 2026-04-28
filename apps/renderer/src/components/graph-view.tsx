import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AiOutlineThunderbolt } from 'react-icons/ai'
import { GoOrganization, GoProject } from 'react-icons/go'
import { IoMdBook } from 'react-icons/io'
import { IoMicOutline } from 'react-icons/io5'
import { MdOutlineTopic, MdOutlineWorkOutline } from 'react-icons/md'
import { TiWarningOutline } from 'react-icons/ti'
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Briefcase,
  CalendarDays,
  Code2,
  Database,
  Folder,
  Globe2,
  Heart,
  Mail,
  MessageCircle,
  Mic,
  Rocket,
  Search,
  Shield,
  Sparkles,
  UserRound,
  Wallet,
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

type NodePosition = {
  x: number
  y: number
  vx: number
  vy: number
}

const SIMULATION_STEPS = 240
const SPRING_LENGTH = 80
const SPRING_STRENGTH = 0.0038
const REPULSION = 5800
const DAMPING = 0.83
const MIN_DISTANCE = 34
const CLUSTER_STRENGTH = 0.0018
const CLUSTER_RADIUS_MIN = 120
const CLUSTER_RADIUS_MAX = 240
const CLUSTER_RADIUS_STEP = 45
const FLOAT_BASE = 3.5
const FLOAT_VARIANCE = 2
const FLOAT_SPEED_BASE = 0.0006
const FLOAT_SPEED_VARIANCE = 0.00025
const REPULSION_CELL_SIZE = 180
const NEIGHBOR_CELL_RANGE = 1
const MOTION_ACTIVE_WINDOW_MS = 1800
const MINIMAP_EDGE_LIMIT = 280

const graphIconMap: Record<GraphTopicIconKey, React.ComponentType<{ className?: string }>> = {
  user: UserRound,
  folder: Folder,
  skill: AiOutlineThunderbolt,
  knowledge: IoMdBook,
  organization: GoOrganization,
  project: GoProject,
  topic: MdOutlineTopic,
  voice: IoMicOutline,
  work: MdOutlineWorkOutline,
  brain: Brain,
  briefcase: Briefcase,
  code: Code2,
  book: BookOpen,
  message: MessageCircle,
  calendar: CalendarDays,
  database: Database,
  mail: Mail,
  mic: Mic,
  shield: Shield,
  rocket: Rocket,
  heart: Heart,
  banknote: Wallet,
  globe: Globe2,
  sparkles: Sparkles,
}

graphIconMap.brain = TiWarningOutline

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function topicTintFromHsl(color: string) {
  const match = color.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/i)
  if (!match) {
    return 'rgba(24, 24, 36, 0.94)'
  }
  const [, hue, sat] = match
  return `hsla(${hue} ${sat}% 18% / 0.96)`
}

export function GraphView({ nodes, edges, error, onSelectNode }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const positionsRef = useRef<Map<string, NodePosition>>(new Map())
  const motionSeedsRef = useRef<Map<string, { phase: number; amplitude: number; speed: number }>>(new Map())
  const motionTimeRef = useRef(0)
  const interactionUntilRef = useRef(0)
  const draggingRef = useRef<{
    id: string
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)
  const panningRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const minimapDraggingRef = useRef(false)
  const hasCenteredRef = useRef(false)
  const [viewport, setViewport] = useState({ width: 1, height: 1 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.6)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [renderTick, setRenderTick] = useState(0)
  const [motionActive, setMotionActive] = useState(true)

  const edgeList = useMemo(
    () => edges.filter((edge) => edge.source !== edge.target),
    [edges]
  )
  const nodeGroupMap = useMemo(() => {
    const map = new Map<string, string>()
    nodes.forEach((node) => map.set(node.id, node.group || 'root'))
    return map
  }, [nodes])
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
  const groupCenters = useMemo(() => {
    const groups = Array.from(new Set(nodes.map((node) => node.group || 'root')))
    if (groups.length === 0) return new Map<string, { x: number; y: number }>()
    const radius = Math.min(
      CLUSTER_RADIUS_MAX,
      Math.max(CLUSTER_RADIUS_MIN, groups.length * CLUSTER_RADIUS_STEP)
    )
    const centers = new Map<string, { x: number; y: number }>()
    groups.forEach((group, index) => {
      const angle = (index / groups.length) * Math.PI * 2
      centers.set(group, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      })
    })
    return centers
  }, [nodes])

  const getMotionSeed = useCallback((id: string) => {
    const existing = motionSeedsRef.current.get(id)
    if (existing) return existing
    let hash = 0
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash << 5) - hash + id.charCodeAt(i)
      hash |= 0
    }
    const normalized = Math.abs(hash)
    const phase = ((normalized % 360) * Math.PI) / 180
    const amplitude = FLOAT_BASE + (normalized % 7) * (FLOAT_VARIANCE / 6)
    const speed = FLOAT_SPEED_BASE + (normalized % 5) * FLOAT_SPEED_VARIANCE
    const seed = { phase, amplitude, speed }
    motionSeedsRef.current.set(id, seed)
    return seed
  }, [])

  const getDisplayPosition = useCallback((id: string, base: NodePosition, skipMotion: boolean) => {
    if (skipMotion) {
      return { x: base.x, y: base.y }
    }
    const seed = getMotionSeed(id)
    const phase = seed.phase + motionTimeRef.current * seed.speed
    return {
      x: base.x + Math.sin(phase) * seed.amplitude,
      y: base.y + Math.cos(phase * 0.9) * seed.amplitude,
    }
  }, [getMotionSeed])

  const getGraphPoint = useCallback((event: React.PointerEvent) => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - pan.x) / zoom,
      y: (event.clientY - rect.top - pan.y) / zoom,
    }
  }, [pan.x, pan.y, zoom])

  const centerViewportOnGraphPoint = useCallback((graphX: number, graphY: number) => {
    setPan({
      x: viewport.width / 2 - graphX * zoom,
      y: viewport.height / 2 - graphY * zoom,
    })
  }, [viewport.height, viewport.width, zoom])

  const wakeMotion = useCallback((durationMs: number = MOTION_ACTIVE_WINDOW_MS) => {
    interactionUntilRef.current = performance.now() + durationMs
    setMotionActive(true)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setViewport({ width, height })
      if (!hasCenteredRef.current) {
        setPan({ x: width / 2, y: height / 2 })
        hasCenteredRef.current = true
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (nodes.length === 0) {
      positionsRef.current = new Map()
      return
    }

    wakeMotion()

    const nextPositions = new Map<string, NodePosition>()
    const count = nodes.length
    const radius = Math.max(110, Math.min(220, count * 9))

    nodes.forEach((node, index) => {
      const existing = positionsRef.current.get(node.id)
      if (existing) {
        nextPositions.set(node.id, { ...existing })
        return
      }
      const angle = (index / count) * Math.PI * 2
      nextPositions.set(node.id, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      })
    })

    positionsRef.current = nextPositions

    let step = 0
    let rafId = 0
    let active = true

    const simulate = () => {
      if (!active) return
      step += 1

      const positions = positionsRef.current
      const ids = nodes.map((node) => node.id)
      const forces = new Map<string, { x: number; y: number }>()

      ids.forEach((id) => forces.set(id, { x: 0, y: 0 }))

      const spatialGrid = new Map<string, string[]>()
      ids.forEach((id) => {
        const pos = positions.get(id)
        if (!pos) return
        const cellX = Math.floor(pos.x / REPULSION_CELL_SIZE)
        const cellY = Math.floor(pos.y / REPULSION_CELL_SIZE)
        const key = `${cellX}:${cellY}`
        const bucket = spatialGrid.get(key)
        if (bucket) {
          bucket.push(id)
        } else {
          spatialGrid.set(key, [id])
        }
      })

      spatialGrid.forEach((bucket, key) => {
        const [cellX, cellY] = key.split(':').map(Number)
        for (let dxCell = -NEIGHBOR_CELL_RANGE; dxCell <= NEIGHBOR_CELL_RANGE; dxCell += 1) {
          for (let dyCell = -NEIGHBOR_CELL_RANGE; dyCell <= NEIGHBOR_CELL_RANGE; dyCell += 1) {
            const neighborKey = `${cellX + dxCell}:${cellY + dyCell}`
            const neighborBucket = spatialGrid.get(neighborKey)
            if (!neighborBucket) continue

            for (const idA of bucket) {
              const posA = positions.get(idA)
              if (!posA) continue

              for (const idB of neighborBucket) {
                if (idA >= idB) continue
                const posB = positions.get(idB)
                if (!posB) continue
                const dx = posB.x - posA.x
                const dy = posB.y - posA.y
                const distance = Math.max(MIN_DISTANCE, Math.hypot(dx, dy))
                const force = REPULSION / (distance * distance)
                const fx = (force * dx) / distance
                const fy = (force * dy) / distance
                const forceA = forces.get(idA)
                const forceB = forces.get(idB)
                if (forceA) {
                  forceA.x -= fx
                  forceA.y -= fy
                }
                if (forceB) {
                  forceB.x += fx
                  forceB.y += fy
                }
              }
            }
          }
        }
      })

      edgeList.forEach((edge) => {
        const posA = positions.get(edge.source)
        const posB = positions.get(edge.target)
        if (!posA || !posB) return
        const dx = posB.x - posA.x
        const dy = posB.y - posA.y
        const distance = Math.max(20, Math.hypot(dx, dy))
        const delta = distance - SPRING_LENGTH
        const force = delta * SPRING_STRENGTH
        const fx = (force * dx) / distance
        const fy = (force * dy) / distance
        const forceA = forces.get(edge.source)
        const forceB = forces.get(edge.target)
        if (forceA) {
          forceA.x += fx
          forceA.y += fy
        }
        if (forceB) {
          forceB.x -= fx
          forceB.y -= fy
        }
      })

      ids.forEach((id) => {
        const pos = positions.get(id)
        const force = forces.get(id)
        if (!pos || !force) return
        const group = nodeGroupMap.get(id) ?? 'root'
        const center = groupCenters.get(group)
        if (!center) return
        const dx = center.x - pos.x
        const dy = center.y - pos.y
        force.x += dx * CLUSTER_STRENGTH
        force.y += dy * CLUSTER_STRENGTH
      })

      ids.forEach((id) => {
        const pos = positions.get(id)
        const force = forces.get(id)
        if (!pos || !force) return
        if (draggingRef.current?.id === id) {
          pos.vx = 0
          pos.vy = 0
          return
        }
        pos.vx = (pos.vx + force.x) * DAMPING
        pos.vy = (pos.vy + force.y) * DAMPING
        pos.x += pos.vx
        pos.y += pos.vy
      })

      setRenderTick((prev) => prev + 1)

      if (step < SIMULATION_STEPS) {
        rafId = requestAnimationFrame(simulate)
      }
    }

    rafId = requestAnimationFrame(simulate)
    return () => {
      active = false
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [edgeList, groupCenters, nodeGroupMap, nodes, wakeMotion])

  useEffect(() => {
    if (nodes.length === 0) return
    let rafId = 0
    let lastTime = performance.now()

    const animate = (time: number) => {
      const now = performance.now()
      const shouldAnimate =
        draggingRef.current !== null ||
        panningRef.current !== null ||
        minimapDraggingRef.current ||
        hoveredNodeId !== null ||
        now < interactionUntilRef.current

      if (!shouldAnimate) {
        setMotionActive(false)
        return
      }

      const delta = time - lastTime
      if (delta >= 32) {
        motionTimeRef.current += delta
        lastTime = time
        setRenderTick((prev) => prev + 1)
      }
      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [hoveredNodeId, motionActive, nodes.length])

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    wakeMotion()
    event.currentTarget.setPointerCapture(event.pointerId)
    panningRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    }
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    const dragging = draggingRef.current
    if (dragging) {
      const point = getGraphPoint(event)
      const pos = positionsRef.current.get(dragging.id)
      if (pos) {
        pos.x = point.x - dragging.offsetX
        pos.y = point.y - dragging.offsetY
        dragging.moved = true
        setRenderTick((prev) => prev + 1)
      }
      return
    }

    const panning = panningRef.current
    if (panning) {
      wakeMotion()
      setPan({
        x: panning.originX + (event.clientX - panning.startX),
        y: panning.originY + (event.clientY - panning.startY),
      })
    }
  }

  const handlePointerUp = () => {
    const dragging = draggingRef.current
    if (dragging) {
      if (!dragging.moved) {
        onSelectNode?.(dragging.id)
      }
      draggingRef.current = null
    }
    panningRef.current = null
  }

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault()
    wakeMotion()
    const rawDelta = event.deltaY
    const normalizedDelta = event.deltaMode === 1
      ? rawDelta * 16
      : event.deltaMode === 2
        ? rawDelta * viewport.height
        : rawDelta
    const sensitivity = Math.abs(normalizedDelta) < 40 ? 0.004 : 0.0022
    const zoomFactor = Math.exp(-normalizedDelta * sensitivity)
    const nextZoom = Math.min(2.5, Math.max(0.4, zoom * zoomFactor))
    if (nextZoom === zoom) return

    const container = containerRef.current
    if (!container) {
      setZoom(nextZoom)
      return
    }

    const rect = container.getBoundingClientRect()
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const graphX = (cursorX - pan.x) / zoom
    const graphY = (cursorY - pan.y) / zoom
    setZoom(nextZoom)
    setPan({
      x: cursorX - graphX * nextZoom,
      y: cursorY - graphY * nextZoom,
    })
  }

  const startDragNode = (event: React.PointerEvent, nodeId: string) => {
    event.stopPropagation()
    event.preventDefault()
    wakeMotion()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = getGraphPoint(event)
    const pos = positionsRef.current.get(nodeId)
    if (!pos) return
    const displayPos = getDisplayPosition(nodeId, pos, false)
    draggingRef.current = {
      id: nodeId,
      offsetX: point.x - displayPos.x,
      offsetY: point.y - displayPos.y,
      moved: false,
    }
  }

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
  }, [searchQuery, nodes, edgeList])

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>()
    nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [nodes])
  const displayPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    nodes.forEach((node) => {
      const pos = positionsRef.current.get(node.id)
      if (!pos) return
      const isDragging = draggingRef.current?.id === node.id
      map.set(node.id, getDisplayPosition(node.id, pos, isDragging))
    })
    return map
  }, [getDisplayPosition, nodes, renderTick])
  const activeNodeId = hoveredNodeId ?? draggingRef.current?.id ?? null
  const hasSelectedGroups = selectedGroups.size > 0
  const activeNodeColor = activeNodeId ? nodeById.get(activeNodeId)?.color ?? null : null
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
  const uniqueNodeColors = useMemo(
    () => Array.from(new Set(nodes.map((node) => node.color))),
    [nodes],
  )
  const minimapEdges = useMemo(() => {
    const step = edgeList.length > MINIMAP_EDGE_LIMIT
      ? Math.ceil(edgeList.length / MINIMAP_EDGE_LIMIT)
      : 1
    return edgeList.filter((_, index) => index % step === 0)
  }, [edgeList])

  const minimapData = useMemo(() => {
    if (nodes.length === 0 || displayPositions.size === 0) return null

    const MINIMAP_WIDTH = 184
    const MINIMAP_HEIGHT = 124
    const MINIMAP_PADDING = 12
    const VIEWPORT_PADDING = 80

    const points = Array.from(displayPositions.values())
    const viewportLeft = -pan.x / zoom
    const viewportTop = -pan.y / zoom
    const viewportRight = viewportLeft + viewport.width / zoom
    const viewportBottom = viewportTop + viewport.height / zoom

    const minX = Math.min(...points.map((point) => point.x), viewportLeft) - VIEWPORT_PADDING
    const maxX = Math.max(...points.map((point) => point.x), viewportRight) + VIEWPORT_PADDING
    const minY = Math.min(...points.map((point) => point.y), viewportTop) - VIEWPORT_PADDING
    const maxY = Math.max(...points.map((point) => point.y), viewportBottom) + VIEWPORT_PADDING

    const graphWidth = Math.max(1, maxX - minX)
    const graphHeight = Math.max(1, maxY - minY)
    const scale = Math.min(
      (MINIMAP_WIDTH - MINIMAP_PADDING * 2) / graphWidth,
      (MINIMAP_HEIGHT - MINIMAP_PADDING * 2) / graphHeight,
    )
    const offsetX = (MINIMAP_WIDTH - graphWidth * scale) / 2
    const offsetY = (MINIMAP_HEIGHT - graphHeight * scale) / 2

    const project = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: offsetY + (y - minY) * scale,
    })
    const toGraphPoint = (x: number, y: number) => ({
      x: minX + (x - offsetX) / scale,
      y: minY + (y - offsetY) / scale,
    })

    return {
      width: MINIMAP_WIDTH,
      height: MINIMAP_HEIGHT,
      project,
      toGraphPoint,
      viewportRect: {
        ...project(viewportLeft, viewportTop),
        width: (viewport.width / zoom) * scale,
        height: (viewport.height / zoom) * scale,
      },
    }
  }, [displayPositions, nodes.length, pan.x, pan.y, viewport.height, viewport.width, zoom])

  return (
    <div ref={containerRef} className="graph-view relative h-full w-full">
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!error && nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
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
              onChange={(e) => setSearchQuery(e.target.value)}
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

      <svg
        className="h-full w-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          handlePointerUp()
          setHoveredNodeId(null)
        }}
        onWheel={handleWheel}
      >
        <rect width={viewport.width} height={viewport.height} fill="transparent" />
        <defs>
          {uniqueNodeColors.map((color) => (
            <filter
              key={color}
              id={`glow-${color.replace('#', '')}`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {edgeList.map((edge, index) => {
            const source = displayPositions.get(edge.source)
            const target = displayPositions.get(edge.target)
            if (!source || !target) return null
            const sourceGroup = nodeGroupMap.get(edge.source) ?? 'root'
            const targetGroup = nodeGroupMap.get(edge.target) ?? 'root'
            const isActiveEdge = activeNodeId
              ? edge.source === activeNodeId || edge.target === activeNodeId
              : false
            const isSearchEdge = searchMatchingNodes
              ? searchMatchingNodes.matches.has(edge.source) && searchMatchingNodes.matches.has(edge.target)
              : false
            const isGroupEdge = hasSelectedGroups
              ? selectedGroups.has(sourceGroup) && selectedGroups.has(targetGroup)
              : false
            let strokeOpacity = 0.4
            let strokeWidth = 1
            if (hasSelectedGroups) {
              strokeOpacity = isGroupEdge ? 0.6 : 0.05
              strokeWidth = isGroupEdge ? 1.5 : 1
            } else if (searchMatchingNodes) {
              strokeOpacity = isSearchEdge ? 0.6 : 0.05
              strokeWidth = isSearchEdge ? 1.5 : 1
            } else if (activeNodeId) {
              strokeOpacity = isActiveEdge ? 0.8 : 0.1
              strokeWidth = isActiveEdge ? 2 : 1
            }
            const stroke = isActiveEdge && activeNodeColor ? activeNodeColor : '#333'
            const dx = target.x - source.x
            const dy = target.y - source.y
            const dr = Math.sqrt(dx * dx + dy * dy) * 1.5
            const pathD = `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`
            return (
              <path
                key={`${edge.source}-${edge.target}-${index}`}
                d={pathD}
                fill="none"
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
                style={{ transition: 'stroke 0.2s, stroke-opacity 0.2s, stroke-width 0.2s' }}
              />
            )
          })}

          {nodes.map((node) => {
            const pos = displayPositions.get(node.id)
            if (!pos) return null
            const Icon = graphIconMap[node.iconKey]
            const nodeGroup = node.group || 'root'
            const isConnected = connectedNodes ? connectedNodes.has(node.id) : true
            const isSearchMatch = searchMatchingNodes ? searchMatchingNodes.matches.has(node.id) : true
            const isDirectMatch = searchMatchingNodes ? searchMatchingNodes.directMatches.has(node.id) : false
            const isGroupMatch = hasSelectedGroups ? selectedGroups.has(nodeGroup) : true
            const isPrimary = activeNodeId === node.id || isDirectMatch || (hasSelectedGroups && isGroupMatch)
            let nodeOpacity = 1
            if (hasSelectedGroups) {
              nodeOpacity = isGroupMatch ? 1 : 0.1
            } else if (searchMatchingNodes) {
              if (isDirectMatch) {
                nodeOpacity = 1
              } else if (isSearchMatch) {
                nodeOpacity = 0.5
              } else {
                nodeOpacity = 0.1
              }
            } else if (activeNodeId) {
              nodeOpacity = isConnected ? 1 : 0.3
            }
            const glowFilterId = `glow-${node.color.replace('#', '')}`
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x} ${pos.y})`}
                className="cursor-pointer"
                onPointerEnter={() => {
                  wakeMotion()
                  setHoveredNodeId(node.id)
                }}
                onPointerLeave={() => {
                  wakeMotion(350)
                  setHoveredNodeId(null)
                }}
                onPointerDown={(event) => startDragNode(event, node.id)}
                style={{ transition: 'opacity 0.2s' }}
                opacity={nodeOpacity}
              >
                <circle
                  r={34}
                  fill={node.color}
                  opacity={isPrimary ? 0.22 : 0.08}
                  style={{ transition: 'opacity 0.2s' }}
                />
                <circle
                  r={node.radius + 7}
                  fill={topicTintFromHsl(node.color)}
                  stroke={node.stroke}
                  strokeWidth={isPrimary || isDirectMatch ? 2.5 : 1.5}
                  filter={isPrimary ? `url(#${glowFilterId})` : undefined}
                  style={{ transition: 'filter 0.2s, stroke 0.2s, stroke-width 0.2s' }}
                />
                <foreignObject
                  x={-(node.radius + 1)}
                  y={-(node.radius + 1)}
                  width={(node.radius + 1) * 2}
                  height={(node.radius + 1) * 2}
                  style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon
                      className=""
                      style={{
                        width: Math.max(14, node.radius * 1.15),
                        height: Math.max(14, node.radius * 1.15),
                        color: node.stroke,
                      }}
                    />
                  </div>
                </foreignObject>
                <text
                  y={node.radius + 24}
                  textAnchor="middle"
                  className="text-[10px]"
                  style={{
                    fill: '#cbd5e1',
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                  }}
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {minimapData ? (
        <div className="absolute bottom-3 right-3 z-20 rounded-xl border border-border/70 bg-background/82 p-2 shadow-lg backdrop-blur">
          <svg
            width={minimapData.width}
            height={minimapData.height}
            className="block cursor-pointer"
            onPointerDown={(event) => {
              wakeMotion()
              minimapDraggingRef.current = true
              const rect = event.currentTarget.getBoundingClientRect()
              const point = minimapData.toGraphPoint(
                event.clientX - rect.left,
                event.clientY - rect.top,
              )
              centerViewportOnGraphPoint(point.x, point.y)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!minimapDraggingRef.current) return
              wakeMotion()
              const rect = event.currentTarget.getBoundingClientRect()
              const point = minimapData.toGraphPoint(
                event.clientX - rect.left,
                event.clientY - rect.top,
              )
              centerViewportOnGraphPoint(point.x, point.y)
            }}
            onPointerUp={() => {
              minimapDraggingRef.current = false
            }}
            onPointerLeave={() => {
              minimapDraggingRef.current = false
            }}
          >
            <rect
              x={0}
              y={0}
              width={minimapData.width}
              height={minimapData.height}
              rx={10}
              fill="rgba(9, 12, 18, 0.88)"
            />

            {minimapEdges.map((edge, index) => {
              const source = displayPositions.get(edge.source)
              const target = displayPositions.get(edge.target)
              if (!source || !target) return null
              const start = minimapData.project(source.x, source.y)
              const end = minimapData.project(target.x, target.y)
              return (
                <line
                  key={`minimap-${edge.source}-${edge.target}-${index}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="rgba(148, 163, 184, 0.18)"
                  strokeWidth={1}
                />
              )
            })}

            {nodes.map((node) => {
              const pos = displayPositions.get(node.id)
              if (!pos) return null
              const point = minimapData.project(pos.x, pos.y)
              return (
                <circle
                  key={`minimap-node-${node.id}`}
                  cx={point.x}
                  cy={point.y}
                  r={2.8}
                  fill={node.stroke}
                  opacity={0.95}
                />
              )
            })}

            <rect
              x={minimapData.viewportRect.x}
              y={minimapData.viewportRect.y}
              width={minimapData.viewportRect.width}
              height={minimapData.viewportRect.height}
              rx={8}
              fill="rgba(255, 255, 255, 0.08)"
            />

          </svg>
        </div>
      ) : null}

    </div>
  )
}
