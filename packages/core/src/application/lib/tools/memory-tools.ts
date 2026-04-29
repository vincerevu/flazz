import { z } from 'zod';
import type { MemoryManager } from '../../../memory/memory-manager.js';

let memoryManager: MemoryManager | null = null;

export function setMemoryManager(manager: MemoryManager): void {
  memoryManager = manager;
}

export const memoryTools = {
  memory: {
    description:
      'Persist durable hot memory that should survive across sessions. This tool writes to one of two long-lived stores that are injected into future turns. Use it sparingly and only for compact facts that will remain useful later.\n\n' +
      'OPERATING PRINCIPLE:\n' +
      '- Prefer precision over volume.\n' +
      '- Save stable facts, not session chatter.\n' +
      '- Update existing memory when possible instead of appending near-duplicates.\n' +
      '- If the fact is not likely to matter in a future session, do not save it.\n\n' +
      'TARGET ROUTING:\n' +
      '- target="user": facts about the user as a person.\n' +
      '  Examples: identity, role, timezone, stable preferences, communication style, personal habits, dislikes, explicit "remember this about me".\n' +
      '- target="memory": facts about the working environment or operating context.\n' +
      '  Examples: project conventions, workflow defaults, repository rules, integration behavior, tool quirks, environment facts, recurring procedures, learned fixes.\n' +
      '- Default to target="memory" unless the fact is clearly about the user as a person.\n\n' +
      'WHEN TO SAVE:\n' +
      '- The user explicitly says to remember something.\n' +
      '- The user corrects you in a way that should change future behavior.\n' +
      '- You learn a stable environment or project fact that will reduce future friction.\n' +
      '- You identify a durable workflow rule or operating preference that should be followed later.\n' +
      '- You discover a recurring constraint, integration quirk, or setup detail that is expensive to rediscover.\n\n' +
      'DO NOT SAVE:\n' +
      '- Temporary task progress, TODOs, or one-off session outcomes.\n' +
      '- Raw transcripts, long explanations, or verbose summaries.\n' +
      '- Facts that are trivial, obvious, or easily rediscovered.\n' +
      '- Speculation, guesses, or low-confidence inferences.\n' +
      '- Anything better represented as a skill or a permanent markdown note.\n\n' +
      'LANGUAGE POLICY:\n' +
      '- Write durable memory entries in English by default, even when the user is currently using another language.\n' +
      '- Preserve proper nouns, product names, commands, file extensions, and code identifiers verbatim.\n' +
      '- Store an exact non-English quote only when the user explicitly asks to remember the wording itself.\n' +
      '- Keep stable operating rules clear enough for future model turns to follow without translation ambiguity.\n\n' +
      'ENTRY FORMAT:\n' +
      '- Write one compact canonical fact per entry.\n' +
      '- Use plain declarative phrasing, not meta-instructions to yourself.\n' +
      '- Avoid prefixes like "Remember that", "The user said", or "When asking".\n' +
      '- Good: "For GitHub update requests, check assigned issues and pull requests before notifications."\n' +
      '- Good: "This repo uses a pnpm workspace on Windows."\n' +
      '- Good: "For research or look-into requests, answer in chat unless the user explicitly asks for a file."\n' +
      '- Bad: "When asking GitHub updates: prioritize notifications first."\n' +
      '- Bad: "The user told me that every morning I should maybe check email."\n\n' +
      'DEDUPLICATION AND UPDATES:\n' +
      '- If a new fact overlaps an existing one, use action="replace" rather than add another variant.\n' +
      '- Use action="remove" when the old fact is no longer true.\n' +
      '- Prefer the shortest wording that preserves the operational meaning.\n\n' +
      'ACTION SELECTION:\n' +
      '- add: create a new memory entry.\n' +
      '- replace: revise an existing entry identified by old_text.\n' +
      '- remove: delete an outdated entry identified by old_text.\n\n' +
      'EXAMPLES:\n' +
      '- "The user prefers concise answers." -> target="user"\n' +
      '- "For morning GitHub updates, check assigned issues and pull requests before notifications." -> target="memory"\n' +
      '- "This repo uses a pnpm workspace on Windows." -> target="memory"\n' +
      '- "The user dislikes long bullet lists." -> target="user"\n' +
      '- "When the target is unclear, prefer memory over user." -> target="memory"\n\n' +
      'Only call this tool when the memory will improve future behavior.',
    inputSchema: z.object({
      action: z
        .enum(['add', 'replace', 'remove'])
        .describe('The action to perform.'),
      target: z
        .enum(['memory', 'user'])
        .describe(
          'Memory store to update. Use "user" only for identity/preferences/habits/communication style. Use "memory" for workflow, environment, project, integration, setup, or operational facts. When unsure, use "memory".'
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
