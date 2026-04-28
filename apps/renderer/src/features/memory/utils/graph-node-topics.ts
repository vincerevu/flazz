export type GraphTopicIconKey =
  | 'user'
  | 'folder'
  | 'skill'
  | 'knowledge'
  | 'organization'
  | 'project'
  | 'topic'
  | 'voice'
  | 'work'
  | 'brain'
  | 'briefcase'
  | 'code'
  | 'book'
  | 'message'
  | 'calendar'
  | 'database'
  | 'mail'
  | 'mic'
  | 'shield'
  | 'rocket'
  | 'heart'
  | 'banknote'
  | 'globe'
  | 'sparkles'

export type GraphTopicFrontmatter = Record<string, string | string[]>

const exactGroupIconMap: Record<string, GraphTopicIconKey> = {
  knowledge: 'knowledge',
  organizations: 'organization',
  organization: 'organization',
  projects: 'project',
  project: 'project',
  topics: 'topic',
  topic: 'topic',
  'voice memos': 'voice',
  'voice memo': 'voice',
  voice: 'voice',
  work: 'work',
  skills: 'skill',
  skill: 'skill',
  people: 'user',
  'failure patterns': 'brain',
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s/_-]+/g, ' ')

export function inferGraphTopicIcon(
  _path: string,
  _label: string,
  group: string,
  _frontmatter: GraphTopicFrontmatter = {},
): GraphTopicIconKey {
  const normalizedGroup = normalize(group)

  const exactGroupMatch = exactGroupIconMap[normalizedGroup]
  if (exactGroupMatch) {
    return exactGroupMatch
  }

  if (group === 'root') return 'knowledge'
  if (group) return 'folder'
  return 'sparkles'
}
