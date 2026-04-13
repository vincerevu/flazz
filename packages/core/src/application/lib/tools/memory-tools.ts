import { z } from 'zod';
import type { MemoryManager } from '../../../memory/memory-manager.js';

let memoryManager: MemoryManager | null = null;

export function setMemoryManager(manager: MemoryManager): void {
  memoryManager = manager;
}

export const memoryTools = {
  memory: {
    description:
      'Save durable information to persistent memory that survives across sessions. ' +
      'Memory is injected into future turns, so keep it compact and focused on facts ' +
      'that will still matter later.\n\n' +
      'WHEN TO SAVE (do this proactively, don\'t wait to be asked):\n' +
      '- User corrects you or says "remember this" / "don\'t do that again"\n' +
      '- User shares a preference, habit, or personal detail (name, role, timezone, coding style)\n' +
      '- You discover something about the environment (OS, installed tools, project structure)\n' +
      '- You learn a convention, API quirk, or workflow specific to this user\'s setup\n' +
      '- You identify a stable fact that will be useful again in future sessions\n\n' +
      'PRIORITY: User preferences and corrections > environment facts > procedural knowledge. ' +
      'The most valuable memory prevents the user from having to repeat themselves.\n\n' +
      'Do NOT save task progress, session outcomes, completed-work logs, or temporary TODO ' +
      'state to memory.\n\n' +
      'TWO TARGETS:\n' +
      '- "user": who the user is -- name, role, preferences, communication style, pet peeves\n' +
      '- "memory": your notes -- environment facts, project conventions, tool quirks, lessons learned\n\n' +
      'ACTIONS: add (new entry), replace (update existing -- old_text identifies it), ' +
      'remove (delete -- old_text identifies it).\n\n' +
      'SKIP: trivial/obvious info, things easily re-discovered, raw data dumps, and temporary task state.',
    inputSchema: z.object({
      action: z
        .enum(['add', 'replace', 'remove'])
        .describe('The action to perform.'),
      target: z
        .enum(['memory', 'user'])
        .describe(
          'Which memory store: "memory" for personal notes, "user" for user profile.'
        ),
      content: z
        .string()
        .optional()
        .describe('The entry content. Required for "add" and "replace".'),
      old_text: z
        .string()
        .optional()
        .describe(
          'Short unique substring identifying the entry to replace or remove.'
        ),
    }),
    execute: async ({
      action,
      target,
      content,
      old_text,
    }: {
      action: 'add' | 'replace' | 'remove';
      target: 'memory' | 'user';
      content?: string;
      old_text?: string;
    }) => {
      if (!memoryManager) {
        return { success: false, error: 'Memory system not initialized' };
      }

      // Map 'memory' target to 'agent' section
      const section = target === 'memory' ? 'agent' : 'user';

      if (action === 'add') {
        if (!content) {
          return {
            success: false,
            error: 'Content is required for "add" action.',
          };
        }
        return await memoryManager.add(section, content);
      }

      if (action === 'replace') {
        if (!old_text) {
          return {
            success: false,
            error: 'old_text is required for "replace" action.',
          };
        }
        if (!content) {
          return {
            success: false,
            error: 'content is required for "replace" action.',
          };
        }
        return await memoryManager.replace(section, old_text, content);
      }

      if (action === 'remove') {
        if (!old_text) {
          return {
            success: false,
            error: 'old_text is required for "remove" action.',
          };
        }
        return await memoryManager.remove(section, old_text);
      }

      return {
        success: false,
        error: `Unknown action '${action}'. Use: add, replace, remove`,
      };
    },
  },
};
