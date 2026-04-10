import { useMemo } from "react"
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Activity, Clock3, GitBranch, Workflow as WorkflowIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { WorkflowBlueprint } from "@/features/workflow/mock-workflows"

const nodeColors = {
  trigger: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  input: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  agent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  review: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  output: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const

export function WorkflowMainPanel({
  workflows,
  selectedWorkflowId,
}: {
  workflows: WorkflowBlueprint[]
  selectedWorkflowId: string
}) {
  const workflow = workflows.find((item) => item.id === selectedWorkflowId) ?? workflows[0]

  const { nodes, edges } = useMemo(() => {
    if (!workflow) {
      return { nodes: [] as Node[], edges: [] as Edge[] }
    }

    const nextNodes: Node[] = workflow.steps.map((step, index) => ({
      id: step.id,
      position: { x: index * 280, y: 96 + (index % 2) * 96 },
      data: { label: step.title, note: step.note, kind: step.kind },
      draggable: false,
      selectable: true,
      style: {
        width: 220,
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
      },
      className: nodeColors[step.kind],
    }))

    const nextEdges: Edge[] = workflow.steps.slice(0, -1).map((step, index) => ({
      id: `${step.id}-${workflow.steps[index + 1].id}`,
      source: step.id,
      target: workflow.steps[index + 1].id,
      animated: workflow.health === "healthy",
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: { strokeWidth: 1.5 },
    }))

    return { nodes: nextNodes, edges: nextEdges }
  }, [workflow])

  if (!workflow) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <WorkflowIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{workflow.name}</h1>
              <Badge variant="outline" className="rounded-full px-2 text-[11px] font-normal">
                {workflow.category}
              </Badge>
              <HealthBadge health={workflow.health} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[320px] shrink-0 border-r border-border bg-card/30 p-5">
          <div className="space-y-5">
            <MetricRow icon={Clock3} label="Cadence" value={workflow.cadence} />
            <MetricRow icon={Activity} label="Last run" value={workflow.lastRun} />
            <MetricRow icon={GitBranch} label="Avg. duration" value={workflow.averageDuration} />

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-medium">Step notes</div>
              <div className="space-y-3">
                {workflow.steps.map((step, index) => (
                  <div key={step.id} className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <div className="text-xs font-medium">
                      {index + 1}. {step.title}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-h-0 flex-1 bg-background">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background gap={20} size={1} color="hsl(var(--border))" />
            <MiniMap
              pannable
              zoomable
              nodeBorderRadius={12}
              className="rounded-lg border border-border bg-background/90"
            />
            <Controls className="rounded-lg border border-border bg-background/90" />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}

function MetricRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  )
}

function HealthBadge({ health }: { health: WorkflowBlueprint["health"] }) {
  const label = health === "healthy" ? "Healthy" : health === "warning" ? "Needs review" : "Draft"
  const className =
    health === "healthy"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : health === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border bg-muted/40 text-muted-foreground"

  return (
    <Badge variant="outline" className={`rounded-full px-2 text-[11px] font-normal ${className}`}>
      {label}
    </Badge>
  )
}
