const KNOWN_COLLECTION_META: Record<string, { label: string; description: string }> = {
  'memory/Work': {
    label: 'Work',
    description: 'Captured work items, synced threads, and actionable context.',
  },
  'memory/Projects': {
    label: 'Projects',
    description: 'Project knowledge distilled from notes and synced sources.',
  },
  'memory/People': {
    label: 'People',
    description: 'People knowledge, contacts, and relationship context.',
  },
  'memory/Organizations': {
    label: 'Organizations',
    description: 'Organization profiles and company context.',
  },
  'memory/Meetings': {
    label: 'Meetings',
    description: 'Structured meeting notes, recaps, and preparation docs.',
  },
  'memory/Agent Notes': {
    label: 'Agent Notes',
    description: 'AI-generated working memory, summaries, and operating notes.',
  },
  'memory/Topics': {
    label: 'Topics',
    description: 'Topic-driven notes, references, and reusable research.',
  },
  'memory/topic': {
    label: 'Topics',
    description: 'Topic-driven notes, references, and reusable research.',
  },
  'memory/Notes': {
    label: 'My Notes',
    description: 'General notes and scratch work across your workspace.',
  },
  'memory/Skills': {
    label: 'Skills',
    description: 'Saved reusable skills and procedures.',
  },
  'memory/Workflows': {
    label: 'Workflow Memory',
    description: 'Aggregated precedent notes for repeated workflows.',
  },
}

export type MemoryCollectionPath = string

const NON_COLLECTION_PATHS = new Set(['memory', 'memory/Knowledge', 'memory/Sources'])

function toCollectionLabel(path: string): string {
  const known = KNOWN_COLLECTION_META[path]
  if (known) return known.label
  const folderName = path.split('/').filter(Boolean).at(-1) ?? 'Collection'
  return folderName
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function isMemoryCollectionPath(path: string | null | undefined): path is MemoryCollectionPath {
  if (!path) return false
  if (!path.startsWith('memory/')) return false
  return !NON_COLLECTION_PATHS.has(path)
}

export function getMemoryCollectionMeta(path: string | null | undefined) {
  if (!path || !isMemoryCollectionPath(path)) return null
  const known = KNOWN_COLLECTION_META[path]
  if (known) {
    return { path, ...known }
  }
  return {
    path,
    label: toCollectionLabel(path),
    description: 'Structured note collection',
  }
}
