import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IPCChannels } from '@flazz/shared/src/ipc.js'
import { skillsIpc } from '@/services/skills-ipc'
import { runMemoryIpc } from '@/services/run-memory-ipc'
import type { SkillPanelItem, SkillRepairItem, SkillRevisionItem } from './types'

type SkillListItem = IPCChannels['skills:list']['res']['skills'][number]
type SkillCandidate = IPCChannels['skills:listCandidates']['res']['candidates'][number]
type SkillDetail = NonNullable<IPCChannels['skills:view']['res']['skill']>
type SkillLearningStats = IPCChannels['skills:getLearningStats']['res']
type RunMemoryItem = IPCChannels['run-memory:search']['res']['records'][number]

function relativeTimeLabel(value?: string): string {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} d ago`
  return date.toLocaleDateString()
}

function extractSectionItems(content: string, heading: string): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`##\\s+${escapedHeading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s+|$)`, 'i'))
  if (!match) return []

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
}

function extractPromptStarter(content: string): string {
  const codeMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/)
  if (codeMatch?.[1]) {
    return codeMatch[1].trim()
  }
  return 'Load this skill and follow its operating checklist.'
}

function inferTools(content: string): string[] {
  const matches = content.match(/`([^`]+)`/g) ?? []
  const candidates = matches
    .map((entry) => entry.slice(1, -1))
    .filter((entry) => /[:.-]|workspace|skill|composio|mcp|run|search/i.test(entry))
  return Array.from(new Set(candidates)).slice(0, 8)
}

function toPanelItem(skill: SkillListItem, detail?: SkillDetail): SkillPanelItem {
  const content = detail?.content ?? ''
  const checklist = extractSectionItems(content, 'Steps').slice(0, 6)
  const triggers = [
    ...(detail?.frontmatter.tags ?? []),
    ...(extractSectionItems(content, 'When to Use').slice(0, 3)),
  ]

  return {
    id: skill.name,
    name: skill.name,
    category: skill.category || 'General',
    tagline: skill.description,
    description: detail?.frontmatter.description || skill.description,
    usageCountLabel: skill.source === 'workspace' ? 'workspace skill' : 'built-in skill',
    lastUpdatedLabel: 'available now',
    triggers: Array.from(new Set(triggers)).slice(0, 6),
    checklist: checklist.length > 0 ? checklist : ['Load the skill before executing the task.'],
    promptStarter: extractPromptStarter(content),
    tools: inferTools(content),
    source: skill.source,
    status: 'active',
  }
}

function candidateToPanelItem(candidate: SkillCandidate): SkillPanelItem {
  return {
    id: candidate.signature,
    signature: candidate.signature,
    name: candidate.proposedSkillName || 'Untitled candidate',
    category: candidate.proposedCategory || 'Learning',
    tagline: candidate.rationale || 'Pending review from autonomous learning loop.',
    description: candidate.proposedDescription || candidate.rationale || 'No description yet.',
    usageCountLabel: `${candidate.occurrences} matching run${candidate.occurrences === 1 ? '' : 's'}`,
    lastUpdatedLabel: relativeTimeLabel(candidate.lastSeenAt),
    triggers: [],
    checklist: ['Review the draft candidate and promote it if the workflow is genuinely reusable.'],
    promptStarter: 'Promote this candidate if the workflow should become a reusable skill.',
    tools: [],
    source: 'workspace',
    status: candidate.status,
    confidence: candidate.confidence,
    occurrences: candidate.occurrences,
    relatedSkillName: candidate.relatedSkillName,
    recentRunIds: candidate.recentRunIds,
    intentFingerprint: candidate.intentFingerprint,
    toolSequenceFingerprint: candidate.toolSequenceFingerprint,
    outputShape: candidate.outputShape,
    explicitUserReuseSignal: candidate.explicitUserReuseSignal,
    complexityScore: candidate.complexityScore,
    recurrenceScore: candidate.recurrenceScore,
  }
}

export function useSkillsData() {
  const [skills, setSkills] = useState<SkillPanelItem[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState<string>('')
  const [learningStats, setLearningStats] = useState<SkillLearningStats | null>(null)
  const [repairCandidates, setRepairCandidates] = useState<SkillRepairItem[]>([])
  const [relatedRunMemories, setRelatedRunMemories] = useState<RunMemoryItem[]>([])
  const [revisionsBySkillId, setRevisionsBySkillId] = useState<Record<string, SkillRevisionItem[]>>({})
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mutatingCandidateId, setMutatingCandidateId] = useState<string | null>(null)
  const [rollingBackRevisionId, setRollingBackRevisionId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [skillList, candidateList, stats, repairs] = await Promise.all([
        skillsIpc.list(),
        skillsIpc.listCandidates(),
        skillsIpc.getLearningStats(),
        skillsIpc.listRepairCandidates(),
      ])

      const detailResults = await Promise.all(
        skillList.skills.map(async (skill) => ({
          skill,
          detail: (await skillsIpc.view(skill.name)).skill,
        })),
      )

      const nextSkills = [
        ...detailResults.map(({ skill, detail }) => toPanelItem(skill, detail)),
        ...candidateList.candidates.map(candidateToPanelItem),
      ]

      setSkills(nextSkills)
      setLearningStats(stats)
      setRepairCandidates(repairs.repairs.map((repair): SkillRepairItem => ({ ...repair })))
      setSelectedSkillId((current) => (
        nextSkills.some((skill) => skill.id === current) ? current : (nextSkills[0]?.id ?? '')
      ))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) ?? skills[0] ?? null,
    [selectedSkillId, skills],
  )

  useEffect(() => {
    async function loadSupportingData() {
      if (!selectedSkill || selectedSkill.status !== 'active' || selectedSkill.source !== 'workspace') {
        setSelectedRevisionId(null)
        setRelatedRunMemories([])
        return
      }

      const [result, runMemory] = await Promise.all([
        skillsIpc.listRevisions(selectedSkill.name),
        runMemoryIpc.search(selectedSkill.name, 3),
      ])
      setRevisionsBySkillId((prev) => ({
        ...prev,
        [selectedSkill.id]: result.revisions,
      }))
      setSelectedRevisionId((current) => current ?? result.revisions[0]?.id ?? null)
      setRelatedRunMemories(runMemory.records)
    }

    void loadSupportingData()
  }, [selectedSkill])

  const selectedRevisions = useMemo(
    () => (selectedSkill ? revisionsBySkillId[selectedSkill.id] ?? [] : []),
    [revisionsBySkillId, selectedSkill],
  )

  const selectedRevision = useMemo(
    () => selectedRevisions.find((revision) => revision.id === selectedRevisionId) ?? selectedRevisions[0] ?? null,
    [selectedRevisionId, selectedRevisions],
  )

  const relatedRepairs = useMemo(
    () => (selectedSkill && selectedSkill.status === 'active'
      ? repairCandidates.filter((repair) => repair.skillName === selectedSkill.name)
      : []),
    [repairCandidates, selectedSkill],
  )

  const promoteCandidate = useCallback(async (signature: string) => {
    setMutatingCandidateId(signature)
    try {
      await skillsIpc.promoteCandidate(signature)
      await refresh()
    } finally {
      setMutatingCandidateId(null)
    }
  }, [refresh])

  const rejectCandidate = useCallback(async (signature: string) => {
    setMutatingCandidateId(signature)
    try {
      await skillsIpc.rejectCandidate(signature)
      await refresh()
    } finally {
      setMutatingCandidateId(null)
    }
  }, [refresh])

  const rollbackToRevision = useCallback(async (skillName: string, revisionId: string) => {
    setRollingBackRevisionId(revisionId)
    try {
      await skillsIpc.rollbackToRevision(skillName, revisionId)
      await refresh()
      const revisions = await skillsIpc.listRevisions(skillName)
      setRevisionsBySkillId((prev) => ({
        ...prev,
        [skillName]: revisions.revisions,
      }))
      setSelectedRevisionId(revisions.revisions[0]?.id ?? null)
    } finally {
      setRollingBackRevisionId(null)
    }
  }, [refresh])

  return {
    skills,
    selectedSkill,
    selectedSkillId,
    setSelectedSkillId,
    learningStats,
    revisions: selectedRevisions,
    selectedRevision,
    selectedRevisionId,
    setSelectedRevisionId,
    relatedRepairs,
    relatedRunMemories,
    loading,
    mutatingCandidateId,
    rollingBackRevisionId,
    refresh,
    promoteCandidate,
    rejectCandidate,
    rollbackToRevision,
  }
}
