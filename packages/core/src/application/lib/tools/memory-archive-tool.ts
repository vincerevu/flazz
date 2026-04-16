import { z } from 'zod';
import type { IMemoryArchiver } from '../../../memory/memory-archiver.js';

let memoryArchiver: IMemoryArchiver | null = null;

export function setMemoryArchiver(archiver: IMemoryArchiver): void {
  memoryArchiver = archiver;
}

export const memoryArchiveTools = {
  memory_archive: {
    description:
      'Archive memory into the long-lived workspace memory. Moves entries from hot memory ' +
      '(MEMORY.md or USER.md) to a permanent note under memory/, then clears the memory section.\n\n' +
      'Use this when:\n' +
      '- Memory is getting full and you need to make space\n' +
      '- Information is important but no longer needs to be in hot memory\n' +
      '- User explicitly asks to save memory into a durable note\n\n' +
      'The archived content will be added to the specified memory note and the memory ' +
      'section will be cleared. The memory index will be updated automatically.\n\n' +
      'Target path should be relative to the memory directory (e.g., "Projects/my-project.md").',
    inputSchema: z.object({
      section: z
        .enum(['agent', 'user'])
        .describe('Which memory section to archive: "agent" or "user".'),
      target_path: z
        .string()
        .describe(
          'Path to memory note (relative to the memory directory, must end with .md). ' +
          'Example: "Projects/my-project.md" or "Topics/learning-notes.md"'
        ),
    }),
    execute: async ({
      section,
      target_path,
    }: {
      section: 'agent' | 'user';
      target_path: string;
    }) => {
      if (!memoryArchiver) {
        return { success: false, error: 'Memory archiver not initialized' };
      }

      try {
        await memoryArchiver.archive(section, target_path);
        return {
          success: true,
          message: `Archived ${section} memory to ${target_path}. Memory section cleared.`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  },
};
