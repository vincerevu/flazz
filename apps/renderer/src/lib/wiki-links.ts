const MEMORY_PREFIX = 'memory/'
const KNOWLEDGE_PREFIX = 'knowledge/' // Legacy support

export const stripKnowledgePrefix = (path: string) => {
  // Support both memory/ and knowledge/ (legacy)
  if (path.startsWith(MEMORY_PREFIX)) {
    return path.slice(MEMORY_PREFIX.length)
  }
  if (path.startsWith(KNOWLEDGE_PREFIX)) {
    return path.slice(KNOWLEDGE_PREFIX.length)
  }
  return path
}

export const normalizeWikiPath = (input: string) => {
  const trimmed = input.trim().replace(/^\/+/, '').replace(/^\.\//, '')
  return stripKnowledgePrefix(trimmed)
}

export const ensureMarkdownExtension = (path: string) => {
  if (path.toLowerCase().endsWith('.md')) return path
  return `${path}.md`
}

export const toKnowledgePath = (wikiPath: string) => {
  const normalized = normalizeWikiPath(wikiPath)
  if (!normalized || normalized.includes('..') || normalized.endsWith('/')) return null
  return `${MEMORY_PREFIX}${ensureMarkdownExtension(normalized)}`
}

export const wikiLabel = (wikiPath: string) => {
  const normalized = normalizeWikiPath(wikiPath)
  const name = normalized.split('/').pop() || normalized
  return name.replace(/\.md$/i, '')
}
