import remend from 'remend'

export type StreamingMarkdownBlock = {
  raw: string
  src: string
  mode: 'full' | 'live'
}

function hasReferenceBlocks(text: string) {
  return /^\[[^\]]+\]:\s+\S+/m.test(text) || /^\[\^[^\]]+\]:\s+/m.test(text)
}

function healMarkdown(text: string) {
  return remend(text, { linkMode: 'text-only' })
}

function findOpenFenceStart(text: string) {
  const fencePattern = /^[ \t]{0,3}(`{3,}|~{3,})/gm
  let openFence: { index: number; char: string; size: number } | null = null
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(text)) !== null) {
    const mark = match[1]
    if (!mark) continue

    if (!openFence) {
      openFence = {
        index: match.index,
        char: mark[0] ?? '`',
        size: mark.length,
      }
      continue
    }

    if (mark[0] === openFence.char && mark.length >= openFence.size) {
      openFence = null
    }
  }

  return openFence?.index ?? -1
}

function splitClosedMarkdownBlocks(text: string): string[] {
  const blocks: string[] = []
  const paragraphBreakPattern = /\n{2,}/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = paragraphBreakPattern.exec(text)) !== null) {
    const end = match.index + match[0].length
    blocks.push(text.slice(cursor, end))
    cursor = end
  }

  if (cursor < text.length) {
    blocks.push(text.slice(cursor))
  }

  return blocks.length > 0 ? blocks : [text]
}

function toLiveBlocks(text: string): StreamingMarkdownBlock[] {
  return splitClosedMarkdownBlocks(text).map((block) => ({
    raw: block,
    src: healMarkdown(block),
    mode: 'live',
  }))
}

export function splitStreamingMarkdown(text: string, streaming?: boolean): StreamingMarkdownBlock[] {
  if (!text) return []
  if (!streaming) {
    return [{ raw: text, src: text, mode: 'full' }]
  }

  if (hasReferenceBlocks(text)) {
    return [{ raw: text, src: healMarkdown(text), mode: 'live' }]
  }

  const openFenceStart = findOpenFenceStart(text)
  if (openFenceStart < 0) return toLiveBlocks(text)

  const head = text.slice(0, openFenceStart)
  const code = text.slice(openFenceStart)
  if (!head) {
    return [{ raw: code, src: code, mode: 'live' }]
  }

  return [
    ...toLiveBlocks(head),
    { raw: code, src: code, mode: 'live' },
  ]
}

export function prepareStreamingMarkdown(text: string, streaming?: boolean) {
  return splitStreamingMarkdown(text, streaming)
    .map((block) => block.src)
    .join('')
}
