import { stripMemoryPrefix, toMemoryPath, wikiLabel } from '@/lib/wiki-links'

export const WIKI_LINK_REGEX = /\[\[([^[\]]+)\]\]/g
export const MEMORY_PREFIX = 'memory/'

export const isUntitledPlaceholderName = (name: string) =>
  name === 'untitled' || /^untitled-\d+$/.test(name)

export const getHeadingTitle = (markdown: string) => {
  const lines = markdown.split('\n')
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/)
    if (match) return match[1].trim()
    const trimmed = line.trim()
    if (trimmed !== '') return trimmed
  }
  return null
}

export const sanitizeHeadingForFilename = (heading: string) => {
  let name = heading.trim()
  if (!name) return null
  if (name.toLowerCase().endsWith('.md')) {
    name = name.slice(0, -3)
  }
  name = name.replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim()
  return name || null
}

export const getBaseName = (path: string) => {
  const file = path.split('/').pop() ?? ''
  return file.replace(/\.md$/i, '')
}

export const normalizeRelPathForWiki = (relPath: string) =>
  relPath.replace(/\\/g, '/').replace(/^\/+/, '')

export const stripMemoryPrefixForWiki = (relPath: string) => {
  const normalized = normalizeRelPathForWiki(relPath)
  const lower = normalized.toLowerCase()
  if (lower.startsWith(MEMORY_PREFIX)) {
    return normalized.slice(MEMORY_PREFIX.length)
  }
  return normalized
}

export const stripMarkdownExtensionForWiki = (wikiPath: string) =>
  wikiPath.toLowerCase().endsWith('.md') ? wikiPath.slice(0, -3) : wikiPath

export const wikiPathCompareKey = (wikiPath: string) =>
  stripMarkdownExtensionForWiki(wikiPath).toLowerCase()

export const splitWikiPathPrefix = (rawPath: string) => {
  let normalized = rawPath.trim().replace(/^\/+/, '').replace(/^\.\//, '')
  const lower = normalized.toLowerCase()
  const hadMemoryPrefix = lower.startsWith(MEMORY_PREFIX)
  if (lower.startsWith(MEMORY_PREFIX)) {
    normalized = normalized.slice(MEMORY_PREFIX.length)
  }
  return { pathWithoutPrefix: normalized, hadMemoryPrefix }
}

export const rewriteWikiLinksForRenamedFileInMarkdown = (
  markdown: string,
  fromRelPath: string,
  toRelPath: string
) => {
  const normalizedFrom = normalizeRelPathForWiki(fromRelPath)
  const normalizedTo = normalizeRelPathForWiki(toRelPath)
  const lowerFrom = normalizedFrom.toLowerCase()
  const lowerTo = normalizedTo.toLowerCase()
  const fromIsTracked = lowerFrom.startsWith(MEMORY_PREFIX) && lowerFrom.endsWith('.md')
  const toIsTracked = lowerTo.startsWith(MEMORY_PREFIX) && lowerTo.endsWith('.md')
  if (!fromIsTracked || !toIsTracked) return markdown

  const fromWikiPath = stripMemoryPrefixForWiki(normalizedFrom)
  const toWikiPath = stripMemoryPrefixForWiki(normalizedTo)
  const fromCompareKey = wikiPathCompareKey(fromWikiPath)
  const fromBaseName = stripMarkdownExtensionForWiki(fromWikiPath).split('/').pop()?.toLowerCase() ?? null
  const toWikiPathWithoutExtension = stripMarkdownExtensionForWiki(toWikiPath)
  const toBaseName = toWikiPathWithoutExtension.split('/').pop() ?? toWikiPathWithoutExtension

  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, innerRaw: string) => {
    const pipeIndex = innerRaw.indexOf('|')
    const pathAndAnchor = pipeIndex >= 0 ? innerRaw.slice(0, pipeIndex) : innerRaw
    const aliasSuffix = pipeIndex >= 0 ? innerRaw.slice(pipeIndex) : ''

    const hashIndex = pathAndAnchor.indexOf('#')
    const pathPart = hashIndex >= 0 ? pathAndAnchor.slice(0, hashIndex) : pathAndAnchor
    const anchorSuffix = hashIndex >= 0 ? pathAndAnchor.slice(hashIndex) : ''

    const leadingWhitespace = pathPart.match(/^\s*/)?.[0] ?? ''
    const trailingWhitespace = pathPart.match(/\s*$/)?.[0] ?? ''
    const rawPath = pathPart.trim()
    if (!rawPath) return fullMatch

    const { pathWithoutPrefix, hadMemoryPrefix } = splitWikiPathPrefix(rawPath)
    if (!pathWithoutPrefix) return fullMatch

    const matchesFullPath = wikiPathCompareKey(pathWithoutPrefix) === fromCompareKey
    const isBareTarget = !pathWithoutPrefix.includes('/')
    const targetBaseName = stripMarkdownExtensionForWiki(pathWithoutPrefix).toLowerCase()
    const matchesBareSelfName = Boolean(fromBaseName && isBareTarget && targetBaseName === fromBaseName)
    if (!matchesFullPath && !matchesBareSelfName) return fullMatch

    const preserveMarkdownExtension = rawPath.toLowerCase().endsWith('.md')
    const rewrittenTarget = matchesBareSelfName
      ? (preserveMarkdownExtension ? `${toBaseName}.md` : toBaseName)
      : (preserveMarkdownExtension ? toWikiPath : toWikiPathWithoutExtension)
    const finalPath = hadMemoryPrefix ? `${MEMORY_PREFIX}${rewrittenTarget}` : rewrittenTarget

    return `[[${leadingWhitespace}${finalPath}${trailingWhitespace}${anchorSuffix}${aliasSuffix}]]`
  })
}

export { stripMemoryPrefix, toMemoryPath, wikiLabel }
