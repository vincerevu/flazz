import { z } from 'zod';
import type { MemoryManager } from '../../../memory/memory-manager.js';

let memoryManager: MemoryManager | null = null;

export function setMemoryManager(manager: MemoryManager): void {
  memoryManager = manager;
}

export const memoryTools = {
  memory_read: {
    description:
      'Read hot memory (agent notes and user profile). This memory is always in context and contains recent learnings, current tasks, and user preferences.',
    inputSchema: z.object({}),
    execute: async () => {
      if (!memoryManager) {
        return { error: 'Memory system not initialized' };
      }

      const context = await memoryManager.getContext();
      return { success: true, context };
    },
  },

  memory_write: {
    description:
      'Write to hot memory. Use this to remember important information, learnings, user preferences, or current task context. Memory is bounded and automatically curated.',
    inputSchema: z.object({
      section: z
        .enum(['agent', 'user'])
        .describe(
          'Which memory section to write to. Use "agent" for your own notes and learnings. Use "user" for user preferences and profile information.'
        ),
      content: z
        .string()
        .describe('The content to remember. Be concise and specific.'),
    }),
    execute: async ({
      section,
      content,
    }: {
      section: 'agent' | 'user';
      content: string;
    }) => {
      if (!memoryManager) {
        return { error: 'Memory system not initialized' };
      }

      await memoryManager.append(section, content);
      return { success: true, message: 'Memory updated' };
    },
  },

  memory_search: {
    description: 'Search within hot memory for specific information.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
    }),
    execute: async ({ query }: { query: string }) => {
      if (!memoryManager) {
        return { error: 'Memory system not initialized' };
      }

      const results = await memoryManager.search(query);
      return { success: true, results };
    },
  },
};
