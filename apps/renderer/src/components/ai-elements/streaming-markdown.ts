import { marked, type Tokens } from 'marked'
import remend from 'remend'

export type StreamingMarkdownBlock = {
  raw: string
  src: string
  mode: 'full' | 'live'
}

function hasReferenceBlocks(text: string) {
  return /^\[[^\]]+\]:\s+\S+/m.test(text) || /^\[\^[^\]]+\]:\s+/m.test(text)
}

function hasOpenCodeFence(raw: string) {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
  if (!match) return false
  const mark = match[1]
  if (!mark) return false
  const char = mark[0]
  const size = mark.length
  const lastLine = raw.trimEnd().split('\n').at(-1)?.trim() ?? ''
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(lastLine)
}

function healMarkdown(text: string) {
  return remend(text, { linkMode: 'text-only' })
}

export function splitStreamingMarkdown(text: string, streaming?: boolean): StreamingMarkdownBlock[] {
  if (!text) return []
  if (!streaming) {
    return [{ raw: text, src: text, mode: 'full' }]
  }

  const healed = healMarkdown(text)
  if (hasReferenceBlocks(text)) {
    return [{ raw: text, src: healed, mode: 'live' }]
  }

  const tokens = marked.lexer(text)
  let tailIndex = -1
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token?.type !== 'space') {
      tailIndex = index
      break
    }
  }
  if (tailIndex < 0) {
    return [{ raw: text, src: healed, mode: 'live' }]
  }

  const tail = tokens[tailIndex]
  if (!tail || tail.type !== 'code') {
    return [{ raw: text, src: healed, mode: 'live' }]
  }

  const code = tail as Tokens.Code
  if (!hasOpenCodeFence(code.raw)) {
    return [{ raw: text, src: healed, mode: 'live' }]
  }

  const head = tokens
    .slice(0, tailIndex)
    .map((token) => token.raw)
    .join('')

  if (!head) {
    return [{ raw: code.raw, src: code.raw, mode: 'live' }]
  }

  return [
    { raw: head, src: healMarkdown(head), mode: 'live' },
    { raw: code.raw, src: code.raw, mode: 'live' },
  ]
}

export function prepareStreamingMarkdown(text: string, streaming?: boolean) {
  return splitStreamingMarkdown(text, streaming)
    .map((block) => block.src)
    .join('')
}
