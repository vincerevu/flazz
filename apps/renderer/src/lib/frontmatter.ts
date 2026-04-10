export function splitFrontmatter(content: string): { raw: string | null; body: string } {
  if (!content.startsWith('---')) {
    return { raw: null, body: content }
  }

  const endIndex = content.indexOf('\n---', 3)
  if (endIndex === -1) {
    return { raw: null, body: content }
  }

  const closingEnd = endIndex + 4
  const raw = content.slice(0, closingEnd)
  let body = content.slice(closingEnd)
  if (body.startsWith('\n')) {
    body = body.slice(1)
  }

  return { raw, body }
}

export function joinFrontmatter(raw: string | null, body: string): string {
  if (!raw) return body
  return `${raw}\n${body}`
}

export function extractAllFrontmatterValues(raw: string | null): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  if (!raw) return result

  const lines = raw.split('\n')
  let currentKey: string | null = null

  for (const line of lines) {
    if (line === '---' || line.trim() === '') {
      if (line === '---') currentKey = null
      continue
    }

    const topMatch = line.match(/^([\w][\w\s-]*?):\s*(.*)$/)
    if (topMatch) {
      const key = topMatch[1].trim()
      const value = topMatch[2].trim()
      if (value) {
        result[key] = value
        currentKey = null
      } else {
        currentKey = key
        result[key] = []
      }
      continue
    }

    if (currentKey) {
      const itemMatch = line.match(/^\s*-\s+(.+)$/)
      if (itemMatch) {
        const arr = result[currentKey]
        if (Array.isArray(arr)) {
          arr.push(itemMatch[1].trim())
        }
      }
    }
  }

  return result
}

export function buildFrontmatter(fields: Record<string, string | string[]>): string | null {
  const lines: string[] = []

  for (const [key, value] of Object.entries(fields)) {
    const trimmedKey = key.trim()
    if (!trimmedKey) continue

    if (Array.isArray(value)) {
      const nextItems = value.map((item) => item.trim()).filter(Boolean)
      if (nextItems.length === 0) continue
      lines.push(`${trimmedKey}:`)
      for (const item of nextItems) {
        lines.push(`  - ${item}`)
      }
      continue
    }

    const trimmedValue = value.trim()
    if (!trimmedValue) continue
    lines.push(`${trimmedKey}: ${trimmedValue}`)
  }

  if (lines.length === 0) return null
  return `---\n${lines.join('\n')}\n---`
}

