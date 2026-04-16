const KNOWN_COLLECTION_META: Record<string, { label: string; description: string }> = {
  'memory/Meetings': {
    label: 'Meetings',
    description: 'Structured meeting notes, recaps, and preparation docs.',
  },
  'memory/Agent Notes': {
    label: 'Agent Notes',
    description: 'AI-generated working memory, summaries, and operating notes.',
  },
  'memory/People': {
    label: 'People',
    description: 'Contact intelligence, relationship notes, and people context.',
  },
  'memory/Organizations': {
    label: 'Organizations',
    description: 'Company profiles, teams, and org-level memory.',
  },
  'memory/Projects': {
    label: 'Projects',
    description: 'Project updates, plans, decisions, and working documents.',
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
}

export type MemoryCollectionPath = string

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
  return path === 'memory' || path.startsWith('memory/')
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
