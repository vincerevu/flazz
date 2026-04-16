import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

export type GraphNode = {
  id: string
  label: string
  degree: number
  radius: number
  group: string
  color: string
  stroke: string
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

// Performance constants
const MAX_VISIBLE_NODES = 200 // Maximum nodes to render at once
const VIEWPORT_PADDING = 300 // Padding around viewport for smooth panning
const MIN_HUB_DEGREE = 3 // Minimum degree to be considered a hub
const MAX_HUB_NODES = 30 // Maximum hub nodes to always show

// Simulation constants (adaptive based on node count)
const SIMULATION_STEPS_BASE = 80  // Reduced from 240
const SIMULATION_STEPS_LARGE = 50 // Reduced from 100
const LARGE_GRAPH_THRESHOLD = 200

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

export function GraphView({ nodes, edges, isLoading, error, onSelectNode }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const positionsRef = useRef<Map<string, NodePosition>>(new Map())
  const motionSeedsRef = useRef<Map<string, { phase: number; amplitude: number; speed: number }>>(new Map())
  const motionTimeRef = useRef(0)
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
  const hasCenteredRef = useRef(false)
  const [viewport, setViewport] = useState({ width: 1, height: 1 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.6)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [visibleNodeIds, setVisibleNodeIds] = useState<Set<string>>(new Set())
  const [isSimulating, setIsSimulating] = useState(false)
  const [, forceRender] = useState(0)

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
        label: group === 'root' ? 'memory' : group,
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

  // Calculate viewport bounds in graph coordinates
  const viewportBounds = useMemo(() => {
    const padding = VIEWPORT_PADDING / zoom
    return {
      minX: (-pan.x) / zoom - padding,
      minY: (-pan.y) / zoom - padding,
      maxX: (-pan.x + viewport.width) / zoom + padding,
      maxY: (-pan.y + viewport.height) / zoom + padding,
    }
  }, [pan, zoom, viewport])

  // Select nodes to render based on viewport and importance
  const nodesToRender = useMemo(() => {
    if (nodes.length === 0) return []
    
    // If search or group filter is active, show all matching nodes
    if (searchQuery || selectedGroup) {
      return nodes
    }

    // For small graphs, show all nodes
    if (nodes.length <= MAX_VISIBLE_NODES) {
      return nodes
    }

    // Get hub nodes (high degree) - always visible
    const hubNodes = nodes
      .filter(n => n.degree >= MIN_HUB_DEGREE)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, MAX_HUB_NODES)
    
    const hubIds = new Set(hubNodes.map(n => n.id))

    // Get nodes in viewport
    const nodesInViewport = nodes.filter(node => {
      const pos = positionsRef.current.get(node.id)
      if (!pos) return false
      return (
        pos.x >= viewportBounds.minX &&
        pos.x <= viewportBounds.maxX &&
        pos.y >= viewportBounds.minY &&
        pos.y <= viewportBounds.maxY
      )
    })

    // Combine hubs and viewport nodes
    const visible = new Set<string>()
    hubNodes.forEach(n => visible.add(n.id))
    nodesInViewport.forEach(n => visible.add(n.id))

    // Add connected nodes of visible nodes (for context)
    const withConnections = new Set(visible)
    edgeList.forEach(edge => {
      if (visible.has(edge.source)) withConnections.add(edge.target)
      if (visible.has(edge.target)) withConnections.add(edge.source)
    })

    // Limit to MAX_VISIBLE_NODES
    const result = Array.from(withConnections)
      .map(id => nodes.find(n => n.id === id))
      .filter((n): n is GraphNode => n !== undefined)
      .slice(0, MAX_VISIBLE_NODES)

    return result
  }, [nodes, viewportBounds, searchQuery, selectedGroup, edgeList])

  // Update visible node IDs when nodesToRender changes
  useEffect(() => {
    setVisibleNodeIds(new Set(nodesToRender.map(n => n.id)))
  }, [nodesToRender])

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
    // Always return static position (no floating animation)
    return { x: base.x, y: base.y }
  }, [])

  const getGraphPoint = useCallback((event: React.PointerEvent) => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - pan.x) / zoom,
      y: (event.clientY - rect.top - pan.y) / zoom,
    }
  }, [pan.x, pan.y, zoom])

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

    // Adaptive simulation steps based on graph size
    const simulationSteps = nodes.length > LARGE_GRAPH_THRESHOLD 
      ? SIMULATION_STEPS_LARGE 
      : SIMULATION_STEPS_BASE

    let step = 0
    let rafId = 0
    let active = true
    let stableCount = 0 // Count stable iterations

    // Set simulating state
    setIsSimulating(true)

    const simulate = () => {
      if (!active) return
      step += 1

      const positions = positionsRef.current
      const ids = nodes.map((node) => node.id)
      const forces = new Map<string, { x: number; y: number }>()

      ids.forEach((id) => forces.set(id, { x: 0, y: 0 }))

      // Repulsion forces (O(n²) - most expensive part)
      // Optimization: Skip nodes that are too far apart
      const MAX_REPULSION_DISTANCE = 400
      for (let i = 0; i < ids.length; i += 1) {
        const idA = ids[i]
        const posA = positions.get(idA)
        if (!posA) continue
        for (let j = i + 1; j < ids.length; j += 1) {
          const idB = ids[j]
          const posB = positions.get(idB)
          if (!posB) continue
          const dx = posB.x - posA.x
          const dy = posB.y - posA.y
          const distanceSquared = dx * dx + dy * dy
          
          // Skip if too far (optimization)
          if (distanceSquared > MAX_REPULSION_DISTANCE * MAX_REPULSION_DISTANCE) continue
          
          const distance = Math.max(MIN_DISTANCE, Math.sqrt(distanceSquared))
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

      // Spring forces (edges)
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

      // Cluster forces
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

      // Apply forces and check for stability
      let maxVelocity = 0
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
        
        // Track max velocity for early termination
        const velocity = Math.abs(pos.vx) + Math.abs(pos.vy)
        if (velocity > maxVelocity) maxVelocity = velocity
      })

      // Early termination if graph is stable
      if (maxVelocity < 0.1) {
        stableCount++
        if (stableCount > 5) {
          // Graph is stable, stop early
          setIsSimulating(false)
          forceRender((prev) => prev + 1)
          return
        }
      } else {
        stableCount = 0
      }

      // Only render when simulation is complete for static graph
      if (step >= simulationSteps) {
        setIsSimulating(false)
        forceRender((prev) => prev + 1)
      }

      if (step < simulationSteps) {
        rafId = requestAnimationFrame(simulate)
      }
    }

    rafId = requestAnimationFrame(simulate)
    return () => {
      active = false
      setIsSimulating(false)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [nodes, edgeList, groupCenters, nodeGroupMap])

  // Floating animation - DISABLED for static graph like Obsidian
  // useEffect(() => {
  //   if (nodes.length === 0 || nodes.length > LARGE_GRAPH_THRESHOLD) return
  //   
  //   let rafId = 0
  //   let lastTime = performance.now()
  //
  //   const animate = (time: number) => {
  //     const delta = time - lastTime
  //     if (delta >= 32) {
  //       motionTimeRef.current += delta
  //       lastTime = time
  //       forceRender((prev) => prev + 1)
  //     }
  //     rafId = requestAnimationFrame(animate)
  //   }
  //
  //   rafId = requestAnimationFrame(animate)
  //   return () => {
  //     if (rafId) cancelAnimationFrame(rafId)
  //   }
  // }, [nodes.length])

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
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
        forceRender((prev) => prev + 1)
      }
      return
    }

    const panning = panningRef.current
    if (panning) {
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

  // Calculate display positions only for visible nodes
  const displayPositions = new Map<string, { x: number; y: number }>()
  nodesToRender.forEach((node) => {
    const pos = positionsRef.current.get(node.id)
    if (!pos) return
    const isDragging = draggingRef.current?.id === node.id
    displayPositions.set(node.id, getDisplayPosition(node.id, pos, isDragging))
  })
  
  // Filter edges to only show edges between visible nodes
  const visibleEdges = useMemo(() => {
    return edgeList.filter(edge => 
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    )
  }, [edgeList, visibleNodeIds])
  const activeNodeId = hoveredNodeId ?? draggingRef.current?.id ?? null
  const connectedNodes = useMemo(() => {
    if (!activeNodeId) return null
    const set = new Set([activeNodeId])
    edgeList.forEach((edge) => {
      if (edge.source === activeNodeId) set.add(edge.target)
      if (edge.target === activeNodeId) set.add(edge.source)
    })
    return set
  }, [activeNodeId, edgeList])

  const searchMatchingNodes = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.toLowerCase()
    const directMatches = new Set<string>()
    nodes.forEach((node) => {
      if (node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query)) {
        directMatches.add(node.id)
      }
    })
    // Include immediate connections of matching nodes
    const withConnections = new Set(directMatches)
    edgeList.forEach((edge) => {
      if (directMatches.has(edge.source)) withConnections.add(edge.target)
      if (directMatches.has(edge.target)) withConnections.add(edge.source)
    })
    return { matches: withConnections, directMatches }
  }, [searchQuery, nodes, edgeList])

  return (
    <div ref={containerRef} className="graph-view relative h-full w-full">
      {(isLoading || isSimulating) ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>{isLoading ? 'Building graph…' : 'Computing layout…'}</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!isLoading && !isSimulating && !error && nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No notes found.
        </div>
      ) : null}

      {legendItems.length > 0 && !isSimulating ? (
        <div
          className="absolute right-3 top-3 z-20 rounded-md border border-border/80 bg-background/90 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Folders
            </div>
            {nodes.length > MAX_VISIBLE_NODES && !searchQuery && !selectedGroup && (
              <div className="text-[0.65rem] text-muted-foreground">
                {nodesToRender.length}/{nodes.length}
              </div>
            )}
          </div>
          <div className="grid gap-1">
            {legendItems.map((item) => {
              const isSelected = selectedGroup === item.group
              return (
                <button
                  key={item.group}
                  onClick={() => setSelectedGroup(isSelected ? null : item.group)}
                  className={`flex items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-foreground/10 ${
                    isSelected ? 'bg-foreground/15' : ''
                  }`}
                >
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color, boxShadow: `0 0 0 1px ${item.stroke}` }}
                  />
                  <span className="truncate">{item.label}</span>
                  <X className={`ml-auto size-3 ${isSelected ? 'text-muted-foreground' : 'invisible'}`} />
                </button>
              )
            })}
          </div>
          {nodes.length > MAX_VISIBLE_NODES && !searchQuery && !selectedGroup && (
            <div className="mt-2 pt-2 border-t border-border/50 text-[0.65rem] text-muted-foreground">
              Pan or zoom to see more nodes
            </div>
          )}
        </div>
      ) : null}

      <svg
        className="h-full w-full touch-none"
        style={{ opacity: isSimulating ? 0 : 1, transition: 'opacity 0.3s' }}
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
          {Array.from(new Set(nodes.map((n) => n.color))).map((color) => (
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
          {visibleEdges.map((edge, index) => {
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
            const isGroupEdge = selectedGroup
              ? sourceGroup === selectedGroup && targetGroup === selectedGroup
              : false
            let strokeOpacity = 0.4
            let strokeWidth = 1
            if (selectedGroup) {
              strokeOpacity = isGroupEdge ? 0.6 : 0.05
              strokeWidth = isGroupEdge ? 1.5 : 1
            } else if (searchMatchingNodes) {
              strokeOpacity = isSearchEdge ? 0.6 : 0.05
              strokeWidth = isSearchEdge ? 1.5 : 1
            } else if (activeNodeId) {
              strokeOpacity = isActiveEdge ? 0.8 : 0.1
              strokeWidth = isActiveEdge ? 2 : 1
            }
            const activeNode = activeNodeId ? nodes.find((n) => n.id === activeNodeId) : null
            const stroke = isActiveEdge && activeNode ? activeNode.color : '#333'
            // Straight lines like Obsidian (no curves)
            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
                style={{ transition: 'stroke 0.2s, stroke-opacity 0.2s, stroke-width 0.2s' }}
              />
            )
          })}

          {nodesToRender.map((node) => {
            const pos = displayPositions.get(node.id)
            if (!pos) return null
            const nodeGroup = node.group || 'root'
            const isConnected = connectedNodes ? connectedNodes.has(node.id) : true
            const isSearchMatch = searchMatchingNodes ? searchMatchingNodes.matches.has(node.id) : true
            const isDirectMatch = searchMatchingNodes ? searchMatchingNodes.directMatches.has(node.id) : false
            const isGroupMatch = selectedGroup ? nodeGroup === selectedGroup : true
            const isPrimary = activeNodeId === node.id || isDirectMatch || (selectedGroup && isGroupMatch)
            let nodeOpacity = 1
            if (selectedGroup) {
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
                onPointerEnter={() => setHoveredNodeId(node.id)}
                onPointerLeave={() => setHoveredNodeId(null)}
                onPointerDown={(event) => startDragNode(event, node.id)}
                style={{ transition: 'opacity 0.2s' }}
                opacity={nodeOpacity}
              >
                <circle
                  r={30}
                  fill={node.color}
                  opacity={isPrimary ? 0.4 : 0}
                  style={{ transition: 'opacity 0.2s' }}
                />
                <circle
                  r={node.radius}
                  fill={node.color}
                  stroke={isDirectMatch ? '#fff' : '#0a0a0a'}
                  strokeWidth={isDirectMatch ? 3 : 2}
                  filter={isPrimary ? `url(#${glowFilterId})` : undefined}
                  style={{ transition: 'filter 0.2s, stroke 0.2s, stroke-width 0.2s' }}
                />
                <text
                  y={node.radius + 16}
                  textAnchor="middle"
                  className="text-[10px]"
                  style={{
                    fill: '#9ca3af',
                    fontWeight: 500,
                  }}
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      <div
        className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-64 pl-9 pr-20 shadow-lg backdrop-blur"
          />
          <div className="absolute right-3 flex items-center gap-2">
            {searchMatchingNodes && (
              <span className="text-xs text-muted-foreground">
                {searchMatchingNodes.directMatches.size}
              </span>
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
