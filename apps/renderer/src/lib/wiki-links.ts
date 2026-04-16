const MEMORY_PREFIX = 'memory/'

export const stripMemoryPrefix = (path: string) => {
  if (path.startsWith(MEMORY_PREFIX)) {
    return path.slice(MEMORY_PREFIX.length)
  }
  return path
}

export const normalizeWikiPath = (input: string) => {
  const trimmed = input.trim().replace(/^\/+/, '').replace(/^\.\//, '')
  return stripMemoryPrefix(trimmed)
}

export const ensureMarkdownExtension = (path: string) => {
  if (path.toLowerCase().endsWith('.md')) return path
  return `${path}.md`
}

export const toMemoryPath = (wikiPath: string) => {
  const normalized = normalizeWikiPath(wikiPath)
  if (!normalized || normalized.includes('..') || normalized.endsWith('/')) return null
  return `${MEMORY_PREFIX}${ensureMarkdownExtension(normalized)}`
}

export const wikiLabel = (wikiPath: string) => {
  const normalized = normalizeWikiPath(wikiPath)
  const name = normalized.split('/').pop() || normalized
  return name.replace(/\.md$/i, '')
}
