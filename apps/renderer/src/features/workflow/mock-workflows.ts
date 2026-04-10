export type WorkflowStep = {
  id: string
  title: string
  kind: "trigger" | "input" | "agent" | "review" | "output"
  note: string
}

export type WorkflowBlueprint = {
  id: string
  name: string
  category: string
  description: string
  cadence: string
  health: "healthy" | "warning" | "draft"
  lastRun: string
  averageDuration: string
  steps: WorkflowStep[]
}

export const mockWorkflows: WorkflowBlueprint[] = [
  {
    id: "launch-watch",
    name: "Launch Watch",
    category: "Research",
    description:
      "Watch competitor launches, summarize the signal, and hand the team a short action memo.",
    cadence: "Every weekday at 09:00",
    health: "healthy",
    lastRun: "Today, 09:12",
    averageDuration: "6 min",
    steps: [
      { id: "trigger", title: "Start schedule", kind: "trigger", note: "Runs on weekday mornings." },
      { id: "search", title: "Collect web changes", kind: "input", note: "Search company blogs, docs, and release notes." },
      { id: "synthesize", title: "Synthesize with agent", kind: "agent", note: "Extract what changed, why it matters, and likely impact." },
      { id: "review", title: "Human spot-check", kind: "review", note: "Flag anything that looks speculative before sharing." },
      { id: "publish", title: "Write memo", kind: "output", note: "Save a concise launch watch note to the workspace." },
    ],
  },
  {
    id: "meeting-digest",
    name: "Meeting Digest",
    category: "Operations",
    description:
      "Turn transcript-heavy meetings into digestible notes, owners, and follow-up items.",
    cadence: "After each transcript import",
    health: "warning",
    lastRun: "Yesterday, 18:40",
    averageDuration: "11 min",
    steps: [
      { id: "trigger", title: "Transcript detected", kind: "trigger", note: "Starts when a new transcript appears in the workspace." },
      { id: "extract", title: "Extract decisions", kind: "agent", note: "Collect action items, owners, and key decisions." },
      { id: "review", title: "Check open questions", kind: "review", note: "Call out unanswered items for the team." },
      { id: "publish", title: "Update knowledge", kind: "output", note: "Create a note and link it into related topics." },
    ],
  },
  {
    id: "support-escalation",
    name: "Support Escalation",
    category: "Support",
    description:
      "Classify urgent tickets, detect billing or outage risk, and draft the next escalation note.",
    cadence: "Manual trigger",
    health: "draft",
    lastRun: "Not yet run",
    averageDuration: "4 min",
    steps: [
      { id: "trigger", title: "Ticket selected", kind: "trigger", note: "Started by a teammate from the inbox." },
      { id: "classify", title: "Classify issue", kind: "agent", note: "Determine severity, theme, and missing information." },
      { id: "handoff", title: "Draft escalation", kind: "output", note: "Produce a ready-to-send escalation summary." },
    ],
  },
]
