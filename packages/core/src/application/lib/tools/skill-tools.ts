import { z } from 'zod';
import type { SkillManager } from '../../../skills/skill-manager.js';
import type { RunLearningService } from '../../../skills/run-learning-service.js';

let skillManager: SkillManager | null = null;
let runLearningService: RunLearningService | null = null;

export function setSkillManager(manager: SkillManager): void {
  skillManager = manager;
}

export function setRunLearningService(service: RunLearningService): void {
  runLearningService = service;
}

export const skillTools = {
  skill_manage: {
    description:
      'Manage skills (create, update, delete). Skills are your procedural ' +
      'memory — reusable approaches for recurring task types. ' +
      'New skills go to ~/Flazz/memory/Skills/; existing workspace skills can be modified in place.\n\n' +
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

  skill_revision_review: {
    description:
      'Review revision history for workspace skills. Use this to list revisions, inspect a specific revision, and compare current skill content with prior versions when autonomous learning updates a skill.',
    inputSchema: z.object({
      action: z.enum(['list_revisions', 'view_revision', 'rollback_revision']).describe('Revision review action.'),
      name: z.string().describe('Skill name to inspect.'),
      revision_id: z.string().optional().describe('Revision id. Required for view_revision.'),
    }),
    execute: async ({
      action,
      name,
      revision_id,
    }: {
      action: 'list_revisions' | 'view_revision' | 'rollback_revision';
      name: string;
      revision_id?: string;
    }) => {
      if (!skillManager) {
        return { success: false, error: 'Skill system not initialized' };
      }

      if (action === 'list_revisions') {
        const revisions = await skillManager.listRevisions(name);
        return {
          success: true,
          revisions: revisions.map((revision) => ({
            id: revision.id,
            createdAt: revision.createdAt,
            reason: revision.reason,
            actor: revision.actor,
            summary: revision.summary,
          })),
          count: revisions.length,
        };
      }

      if (!revision_id) {
        return {
          success: false,
          error: 'revision_id is required for this action.',
        };
      }

      if (action === 'rollback_revision') {
        return await skillManager.rollbackToRevision(name, revision_id);
      }

      const revision = await skillManager.getRevision(name, revision_id);
      if (!revision) {
        return {
          success: false,
          error: `Revision '${revision_id}' not found for skill '${name}'.`,
        };
      }

      return {
        success: true,
        revision,
      };
    },
  },

  skill_learning_review: {
    description:
      'Review autonomous skill-learning candidates and their promotion state. ' +
      'Use this to inspect pending candidates, manually promote a candidate into a real skill, reject a bad candidate, or inspect learning stats.',
    inputSchema: z.object({
      action: z
        .enum(['list_candidates', 'promote_candidate', 'reject_candidate', 'stats'])
        .describe('Review action to perform.'),
      signature: z
        .string()
        .optional()
        .describe('Candidate signature. Required for promote_candidate and reject_candidate.'),
    }),
    execute: async ({
      action,
      signature,
    }: {
      action: 'list_candidates' | 'promote_candidate' | 'reject_candidate' | 'stats';
      signature?: string;
    }) => {
      if (!runLearningService) {
        return { success: false, error: 'Skill learning service is not initialized' };
      }

      if (action === 'list_candidates') {
        const candidates = runLearningService.listCandidates();
        return {
          success: true,
          candidates,
          count: candidates.length,
        };
      }

      if (action === 'stats') {
        return {
          success: true,
          stats: runLearningService.getLearningStats(),
        };
      }

      if (!signature) {
        return {
          success: false,
          error: 'signature is required for this action.',
        };
      }

      if (action === 'promote_candidate') {
        return await runLearningService.promoteCandidate(signature);
      }

      if (action === 'reject_candidate') {
        return runLearningService.rejectCandidate(signature);
      }

      return {
        success: false,
        error: `Unknown action '${action}'.`,
      };
    },
  },
};
