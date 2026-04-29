import { describe, expect, it } from 'vitest'

import { splitStreamingMarkdown } from './streaming-markdown'

describe('splitStreamingMarkdown', () => {
  it('keeps completed paragraphs in stable blocks while streaming', () => {
    const blocks = splitStreamingMarkdown('One paragraph.\n\nSecond paragraph is still streaming', true)

    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.raw).toBe('One paragraph.\n\n')
    expect(blocks[1]?.raw).toBe('Second paragraph is still streaming')
  })

  it('keeps an open code fence isolated from earlier markdown', () => {
    const blocks = splitStreamingMarkdown('Intro text.\n\n```ts\nconst value = 1', true)

    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.raw).toBe('Intro text.\n\n')
    expect(blocks[1]?.raw).toBe('```ts\nconst value = 1')
  })
})
