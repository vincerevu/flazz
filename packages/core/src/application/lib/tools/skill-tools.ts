import { z } from 'zod';
import type { SkillManager } from '../../../skills/skill-manager.js';

let skillManager: SkillManager | null = null;

export function setSkillManager(manager: SkillManager): void {
  skillManager = manager;
}

export const skillTools = {
  skill_manage: {
    description:
      'Manage skills (create, update, delete). Skills are your procedural ' +
      'memory — reusable approaches for recurring task types. ' +
      'New skills go to ~/Flazz/skills/; existing skills can be modified wherever they live.\n\n' +
      'Actions: create (full SKILL.md + optional category), ' +
      'patch (old_string/new_string — preferred for fixes), ' +
      'edit (full SKILL.md rewrite — major overhauls only), ' +
      'delete, write_file, remove_file.\n\n' +
      'Create when: complex task succeeded (5+ calls), errors overcome, ' +
      'user-corrected approach worked, non-trivial workflow discovered, ' +
      'or user asks you to remember a procedure.\n' +
      'Update when: instructions stale/wrong, OS-specific failures, ' +
      'missing steps or pitfalls found during use. ' +
      'If you used a skill and hit issues not covered by it, patch it immediately.\n\n' +
      'After difficult/iterative tasks, offer to save as a skill. ' +
      'Skip for simple one-offs. Confirm with user before creating/deleting.\n\n' +
      'Good skills: trigger conditions, numbered steps with exact commands, ' +
      'pitfalls section, verification steps.',
    inputSchema: z.object({
      action: z
        .enum(['create', 'patch', 'edit', 'delete', 'write_file', 'remove_file'])
        .describe('The action to perform.'),
      name: z
        .string()
        .describe(
          'Skill name (lowercase, hyphens/underscores, max 64 chars). ' +
            'Must match an existing skill for patch/edit/delete/write_file/remove_file.'
        ),
      content: z
        .string()
        .optional()
        .describe(
          'Full SKILL.md content (YAML frontmatter + markdown body). ' +
            'Required for "create" and "edit".'
        ),
      old_string: z
        .string()
        .optional()
        .describe(
          'Text to find in the file (required for "patch"). Must be unique ' +
            'unless replace_all=true.'
        ),
      new_string: z
        .string()
        .optional()
        .describe(
          'Replacement text (required for "patch"). Can be empty string to delete.'
        ),
      replace_all: z
        .boolean()
        .optional()
        .describe(
          'For "patch": replace all occurrences instead of requiring a unique match (default: false).'
        ),
      category: z
        .string()
        .optional()
        .describe(
          'Optional category/domain for organizing the skill (e.g., "devops", "data-science"). ' +
            'Only used with "create".'
        ),
      file_path: z
        .string()
        .optional()
        .describe(
          'Path to a supporting file within the skill directory. ' +
            'For "write_file"/"remove_file": required, must be under references/, templates/, scripts/, or assets/. ' +
            'For "patch": optional, defaults to SKILL.md if omitted.'
        ),
      file_content: z
        .string()
        .optional()
        .describe('Content for the file. Required for "write_file".'),
    }),
    execute: async ({
      action,
      name,
      content,
      old_string,
      new_string,
      replace_all,
      category,
      file_path,
      file_content,
    }: {
      action: 'create' | 'patch' | 'edit' | 'delete' | 'write_file' | 'remove_file';
      name: string;
      content?: string;
      old_string?: string;
      new_string?: string;
      replace_all?: boolean;
      category?: string;
      file_path?: string;
      file_content?: string;
    }) => {
      if (!skillManager) {
        return { success: false, error: 'Skill system not initialized' };
      }

      if (action === 'create') {
        if (!content) {
          return {
            success: false,
            error: 'content is required for "create". Provide the full SKILL.md text.',
          };
        }
        return await skillManager.create(name, content, category);
      }

      if (action === 'edit') {
        if (!content) {
          return {
            success: false,
            error: 'content is required for "edit". Provide the full updated SKILL.md text.',
          };
        }
        return await skillManager.update(name, content);
      }

      if (action === 'patch') {
        if (!old_string) {
          return {
            success: false,
            error: 'old_string is required for "patch".',
          };
        }
        if (new_string === undefined) {
          return {
            success: false,
            error: 'new_string is required for "patch". Use empty string to delete.',
          };
        }
        return await skillManager.patch(
          name,
          old_string,
          new_string,
          file_path,
          replace_all || false
        );
      }

      if (action === 'delete') {
        return await skillManager.delete(name);
      }

      if (action === 'write_file') {
        if (!file_path) {
          return {
            success: false,
            error: 'file_path is required for "write_file".',
          };
        }
        if (file_content === undefined) {
          return {
            success: false,
            error: 'file_content is required for "write_file".',
          };
        }
        return await skillManager.writeFile(name, file_path, file_content);
      }

      if (action === 'remove_file') {
        if (!file_path) {
          return {
            success: false,
            error: 'file_path is required for "remove_file".',
          };
        }
        return await skillManager.removeFile(name, file_path);
      }

      return {
        success: false,
        error: `Unknown action '${action}'.`,
      };
    },
  },

  skill_list: {
    description: 'List all available skills with their names and descriptions.',
    inputSchema: z.object({}),
    execute: async () => {
      if (!skillManager) {
        return { success: false, error: 'Skill system not initialized' };
      }

      const skills = await skillManager.list();
      return {
        success: true,
        skills: skills.map((s) => ({
          name: s.name,
          description: s.frontmatter.description,
          category: s.frontmatter.category,
          path: s.path,
        })),
        count: skills.length,
      };
    },
  },

  skill_view: {
    description: 'View the full content of a skill including SKILL.md and supporting files.',
    inputSchema: z.object({
      name: z.string().describe('Skill name to view'),
    }),
    execute: async ({ name }: { name: string }) => {
      if (!skillManager) {
        return { success: false, error: 'Skill system not initialized' };
      }

      const skill = await skillManager.get(name);
      if (!skill) {
        return { success: false, error: `Skill '${name}' not found.` };
      }

      return {
        success: true,
        skill: {
          name: skill.name,
          path: skill.path,
          frontmatter: skill.frontmatter,
          content: skill.content,
          supportingFiles: skill.supportingFiles,
        },
      };
    },
  },
};
