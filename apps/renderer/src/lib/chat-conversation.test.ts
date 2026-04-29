import { describe, expect, it } from 'vitest'

import {
  groupConversationRenderBlocks,
  type ChatMessage,
  type ContextCompactionItem,
  type ToolCall,
} from '@/lib/chat-conversation'

describe('groupConversationRenderBlocks', () => {
  it('groups consecutive auxiliary items into one completed turn block', () => {
    const conversation = [
      makeUserMessage('user-1', 'Do the thing', 1000),
      makeToolCall('tool-1', 'workspace-readFile', 'completed', 2000),
      makeToolCall('tool-2', 'workspace-edit', 'completed', 5000),
      makeAssistantMessage('assistant-1', 'Done', 7000),
    ]

    const blocks = groupConversationRenderBlocks(conversation)

    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toMatchObject({ kind: 'item', key: 'user-1' })
    expect(blocks[1]).toMatchObject({
      kind: 'turn',
      summary: 'Worked for 5s',
      defaultOpen: false,
    })
    expect(blocks[2]).toMatchObject({ kind: 'item', key: 'assistant-1' })
  })

  it('keeps active turns ungrouped until they finish', () => {
    const conversation = [
      makeUserMessage('user-1', 'Do the thing', 1000),
      makeToolCall('tool-1', 'workspace-readFile', 'running', 2000),
      makeAssistantMessage('assistant-1', 'Still working', 4000),
    ]

    const blocks = groupConversationRenderBlocks(conversation)

    expect(blocks).toHaveLength(3)
    expect(blocks[1]).toMatchObject({ kind: 'item', key: 'tool-1' })
    expect(blocks[2]).toMatchObject({ kind: 'item', key: 'assistant-1' })
  })

  it('marks failed turns in the summary', () => {
    const conversation = [
      makeUserMessage('user-1', 'Do the thing', 1000),
      makeToolCall('tool-1', 'workspace-readFile', 'error', 2000),
      makeAssistantMessage('assistant-1', 'It failed', 5000),
    ]

    const blocks = groupConversationRenderBlocks(conversation)
    const turn = blocks[1]

    expect(turn).toMatchObject({
      kind: 'turn',
      summary: 'Failed after 3s',
      defaultOpen: false,
    })
    expect(blocks[2]).toMatchObject({ kind: 'item', key: 'assistant-1' })
  })

  it('includes compaction items in the same grouped turn', () => {
    const conversation = [
      makeUserMessage('user-1', 'Compact if needed', 1000),
      makeCompactionItem('compact-1', 'completed', 2000),
      makeToolCall('tool-1', 'workspace-readFile', 'completed', 3000),
      makeAssistantMessage('assistant-1', 'Done', 6000),
    ]

    const blocks = groupConversationRenderBlocks(conversation)
    const turn = blocks[1]

    expect(turn).toMatchObject({
      kind: 'turn',
      summary: 'Worked for 4s',
      defaultOpen: false,
    })
    if (turn.kind !== 'turn') throw new Error('Expected grouped turn')
    expect(turn.items.map((item) => item.id)).toEqual(['compact-1', 'tool-1'])
    expect(blocks[2]).toMatchObject({ kind: 'item', key: 'assistant-1' })
  })

  it('does not split a turn on empty assistant messages', () => {
    const conversation = [
      makeUserMessage('user-1', 'Build the deck', 1000),
      makeToolCall('tool-1', 'workspace-readFile', 'completed', 2000),
      makeAssistantMessage('assistant-empty-1', '', 2500),
      makeToolCall('tool-2', 'workspace-writeFile', 'completed', 4000),
      makeAssistantMessage('assistant-1', 'Done', 6000),
    ]

    const blocks = groupConversationRenderBlocks(conversation)

    expect(blocks).toHaveLength(3)
    const turn = blocks[1]
    expect(turn).toMatchObject({
      kind: 'turn',
      summary: 'Worked for 4s',
      defaultOpen: false,
    })
    if (turn.kind !== 'turn') throw new Error('Expected grouped turn')
    expect(turn.items.map((item) => item.id)).toEqual(['tool-1', 'assistant-empty-1', 'tool-2'])
    expect(blocks[2]).toMatchObject({ kind: 'item', key: 'assistant-1' })
  })

  it('keeps the whole agent activity in one block even with interim assistant text', () => {
    const conversation = [
      makeUserMessage('user-1', 'Create slides', 1000),
      makeToolCall('tool-1', 'executeCommand', 'completed', 2000),
      makeAssistantMessage('assistant-plan', 'I found a template and will continue.', 3000),
      makeToolCall('tool-2', 'executeCommand', 'completed', 4000),
      makeToolCall('tool-3', 'executeCommand', 'completed', 5000),
      makeAssistantMessage('assistant-final', 'Presentation ready.', 7000),
    ]

    const blocks = groupConversationRenderBlocks(conversation)

    expect(blocks).toHaveLength(3)
    expect(blocks[1]).toMatchObject({
      kind: 'turn',
      summary: 'Worked for 5s',
      defaultOpen: false,
    })
    if (blocks[1]?.kind !== 'turn') throw new Error('Expected grouped turn')
    expect(blocks[1].items.map((item) => item.id)).toEqual([
      'tool-1',
      'assistant-plan',
      'tool-2',
      'tool-3',
    ])
    expect(blocks[2]).toMatchObject({ kind: 'item', key: 'assistant-final' })
  })

  it('keeps completed tool activity ungrouped while the run is still processing', () => {
    const conversation = [
      makeUserMessage('user-1', 'Create slides', 1000),
      makeToolCall('tool-1', 'executeCommand', 'completed', 2000),
      makeToolCall('tool-2', 'workspace-writeFile', 'completed', 4000),
    ]

    const blocks = groupConversationRenderBlocks(conversation, { keepActiveTurnUngrouped: true })

    expect(blocks).toHaveLength(3)
    expect(blocks.map((block) => block.key)).toEqual(['user-1', 'tool-1', 'tool-2'])
    expect(blocks.every((block) => block.kind === 'item')).toBe(true)
  })

  it('does not drop trailing activity after an interim assistant message', () => {
    const conversation = [
      makeUserMessage('user-1', 'Create slides', 1000),
      makeToolCall('tool-1', 'loadSkill', 'completed', 2000),
      makeAssistantMessage('assistant-plan', 'I need permission for the next step.', 3000),
      makeToolCall('tool-2', 'executeCommand', 'running', 4000),
    ]

    const blocks = groupConversationRenderBlocks(conversation)

    expect(blocks).toHaveLength(4)
    expect(blocks.map((block) => block.key)).toEqual([
      'user-1',
      'tool-1',
      'assistant-plan',
      'tool-2',
    ])
    expect(blocks.every((block) => block.kind === 'item')).toBe(true)
  })
})

function makeUserMessage(id: string, content: string, timestamp: number): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    timestamp,
  }
}

function makeAssistantMessage(id: string, content: string, timestamp: number): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    timestamp,
  }
}

function makeToolCall(
  id: string,
  name: string,
  status: ToolCall['status'],
  timestamp: number,
): ToolCall {
  return {
    id,
    name,
    input: {},
    status,
    timestamp,
  }
}

function makeCompactionItem(
  id: string,
  status: ContextCompactionItem['status'],
  timestamp: number,
): ContextCompactionItem {
  return {
    id,
    kind: 'context-compaction',
    status,
    strategy: 'summary-window',
    messageCountBefore: 10,
    estimatedTokensBefore: 2000,
    contextLimit: 128000,
    usableInputBudget: 119808,
    compactionThreshold: 119808,
    timestamp,
  }
}
