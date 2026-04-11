import { marked, type Tokens } from 'marked'
import remend from 'remend'

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

export function prepareStreamingMarkdown(text: string, streaming?: boolean) {
  if (!streaming || !text) return text

  const healed = healMarkdown(text)
  if (hasReferenceBlocks(text)) return healed

  const tokens = marked.lexer(text)
  let tailIndex = -1
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token?.type !== 'space') {
      tailIndex = index
      break
    }
  }
  if (tailIndex < 0) return healed

  const tail = tokens[tailIndex]
  if (!tail || tail.type !== 'code') return healed

  const code = tail as Tokens.Code
  if (!hasOpenCodeFence(code.raw)) return healed

  const head = tokens
    .slice(0, tailIndex)
    .map((token) => token.raw)
    .join('')

  if (!head) return code.raw
  return `${healMarkdown(head)}${code.raw}`
}
