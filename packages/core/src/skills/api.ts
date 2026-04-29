import { Skill } from "@flazz/shared";
import { skillManager, runLearningService, skillRegistry } from "../di/container.js";

export async function listSkills() {
  const skills = await skillRegistry.list();
  return {
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      path: skill.path,
      source: skill.source,
    })),
    count: skills.length,
  };
}

export async function viewSkill(name: string) {
  const workspaceSkill = await skillManager.get(name);
  if (workspaceSkill) {
    return {
      success: true,
      skill: Skill.parse(workspaceSkill),
    };
  }

  const resolved = await skillRegistry.get(name);
  if (!resolved) {
    return {
      success: false,
      error: `Skill '${name}' not found.`,
    };
  }

  return {
    success: true,
    skill: Skill.parse({
      name: resolved.name,
      path: resolved.path,
      frontmatter: {
        name: resolved.name,
        description: resolved.description,
        category: resolved.category,
        tags: resolved.tags,
        version: resolved.version,
        author: resolved.author,
      },
      content: resolved.content,
    }),
  };
}

export async function listSkillCandidates() {
  const candidates = await runLearningService.listCandidates();
  return {
    candidates,
    count: candidates.length,
  };
}

export async function promoteSkillCandidate(signature: string) {
  return runLearningService.promoteCandidate(signature);
}

export async function rejectSkillCandidate(signature: string) {
  return await runLearningService.rejectCandidate(signature);
}

export async function getSkillLearningStats() {
  return await runLearningService.getLearningStats();
}

export async function listSkillRepairCandidates() {
  const repairs = await runLearningService.listRepairCandidates();
  return {
    repairs,
    count: repairs.length,
  };
}

export async function listSkillRevisions(name: string) {
  const revisions = await skillManager.listRevisions(name);
  return {
    revisions,
    count: revisions.length,
  };
}

export async function viewSkillRevision(name: string, revisionId: string) {
  const revision = await skillManager.getRevision(name, revisionId);
  if (!revision) {
    return {
      success: false,
      error: `Revision '${revisionId}' not found for skill '${name}'.`,
    };
  }

  return {
    success: true,
    revision,
  };
}

export async function rollbackSkillToRevision(name: string, revisionId: string) {
  return skillManager.rollbackToRevision(name, revisionId);
}
