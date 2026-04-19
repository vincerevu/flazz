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
  const parts = normalized.split('/').filter(Boolean)
  const lastPart = parts[parts.length - 1] || normalized
  const name = /^skill\.md$/i.test(lastPart)
    ? (parts[parts.length - 2] || lastPart)
    : lastPart
  return name.replace(/\.md$/i, '')
}
