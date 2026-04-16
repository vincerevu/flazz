export type SkillItem = {
  id: string
  name: string
  category: string
  tagline: string
  description: string
  usageCountLabel: string
  lastUpdatedLabel: string
  triggers: string[]
  checklist: string[]
  promptStarter: string
  tools: string[]
  source: 'builtin' | 'workspace'
  status: 'active'
}

export type SkillCandidateItem = {
  id: string
  signature: string
  name: string
  category: string
  tagline: string
  description: string
  usageCountLabel: string
  lastUpdatedLabel: string
  triggers: string[]
  checklist: string[]
  promptStarter: string
  tools: string[]
  source: 'workspace'
  status: 'pending' | 'promoted' | 'rejected'
  confidence: number
  occurrences: number
}

export type SkillPanelItem = SkillItem | SkillCandidateItem

export type SkillRevisionItem = {
  id: string
  createdAt: string
  reason: string
  actor: 'system' | 'agent' | 'user'
  summary?: string
  previousContent?: string
  nextContent: string
}
