export const KNOWLEDGE_COLLECTIONS = [
  {
    path: 'knowledge/Meetings',
    label: 'Meetings',
    description: 'Structured meeting notes, recaps, and preparation docs.',
  },
  {
    path: 'knowledge/Agent Notes',
    label: 'Agent Notes',
    description: 'AI-generated working memory, summaries, and operating notes.',
  },
] as const

export type KnowledgeCollectionPath = (typeof KNOWLEDGE_COLLECTIONS)[number]['path']

export function isKnowledgeCollectionPath(path: string | null | undefined): path is KnowledgeCollectionPath {
  if (!path) return false
  return KNOWLEDGE_COLLECTIONS.some((collection) => collection.path === path)
}

export function getKnowledgeCollectionMeta(path: string | null | undefined) {
  return KNOWLEDGE_COLLECTIONS.find((collection) => collection.path === path) ?? null
}

