import { SkillManager } from './skill-manager.js';
import { SkillSource, SkillRecord } from './registry.js';

export class WorkspaceSkillSource implements SkillSource {
  constructor(private skillManager: SkillManager) {}

  async list(): Promise<SkillRecord[]> {
    const skills = await this.skillManager.list();
    return skills.map((skill) => ({
      name: skill.name,
      description: skill.frontmatter.description,
      category: skill.frontmatter.category,
      tags: skill.frontmatter.tags,
      version: skill.frontmatter.version,
      author: skill.frontmatter.author,
      path: skill.path,
      content: skill.content,
      source: 'workspace',
    }));
  }

  async get(identifier: string): Promise<SkillRecord | null> {
    const skill = await this.skillManager.get(identifier);
    if (!skill) {
      return null;
    }

    return {
      name: skill.name,
      description: skill.frontmatter.description,
      category: skill.frontmatter.category,
      tags: skill.frontmatter.tags,
      version: skill.frontmatter.version,
      author: skill.frontmatter.author,
      path: skill.path,
      content: skill.content,
      source: 'workspace',
    };
  }
}
