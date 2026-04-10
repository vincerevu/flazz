export type SkillPreset = {
  id: string
  name: string
  category: string
  tagline: string
  description: string
  usageCount: number
  lastUpdated: string
  triggers: string[]
  tools: string[]
  checklist: string[]
  promptStarter: string
}

export const mockSkills: SkillPreset[] = [
  {
    id: "deep-research-brief",
    name: "Deep Research Brief",
    category: "Research",
    tagline: "Turn a vague topic into a concise, sourced brief.",
    description:
      "Best for competitor scans, launch monitoring, and company research. It guides the assistant to gather multiple sources, compare evidence, and leave you with a readable summary.",
    usageCount: 42,
    lastUpdated: "2 hours ago",
    triggers: ["market scan", "trend summary", "competitor brief"],
    tools: ["web-search", "mcp:exa", "workspace.readFile"],
    checklist: [
      "Clarify the target audience and decision to support.",
      "Collect at least 3 independent sources.",
      "Summarize points of agreement and disagreement.",
      "End with clear takeaways and open questions.",
    ],
    promptStarter:
      "Research the latest developments around {{topic}} and summarize what matters for {{audience}}.",
  },
  {
    id: "product-spec-splitter",
    name: "Product Spec Splitter",
    category: "Productivity",
    tagline: "Break a large feature request into execution-ready tasks.",
    description:
      "Useful when a rough idea needs acceptance criteria, dependencies, and sequencing before implementation starts.",
    usageCount: 18,
    lastUpdated: "yesterday",
    triggers: ["implementation plan", "task breakdown", "scope review"],
    tools: ["workspace.writeFile", "workspace.readFile"],
    checklist: [
      "Separate must-haves from polish.",
      "List risky assumptions and dependencies.",
      "Define the smallest useful milestone first.",
      "Call out testing and rollout concerns.",
    ],
    promptStarter:
      "Turn this feature request into a practical execution plan with milestones, owners, and risks.",
  },
  {
    id: "support-triage",
    name: "Support Triage",
    category: "Operations",
    tagline: "Classify an incoming issue and draft the next response.",
    description:
      "Good for inbox triage, bug reports, and customer requests that need a calm, structured response.",
    usageCount: 31,
    lastUpdated: "3 days ago",
    triggers: ["customer issue", "bug report", "support reply"],
    tools: ["workspace.readFile", "slack.sendMessage"],
    checklist: [
      "Restate the issue in plain language.",
      "Identify missing details that block resolution.",
      "Draft the next reply with a clear ask or next step.",
      "Flag urgency if the issue affects billing or outages.",
    ],
    promptStarter:
      "Review this support thread, classify the issue, and draft the next response.",
  },
]
