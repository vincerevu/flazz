export interface SkillRecord {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  path: string;
  content: string;
  source: 'builtin' | 'workspace';
}

export interface SkillSource {
  list(): Promise<SkillRecord[]>;
  get(identifier: string): Promise<SkillRecord | null>;
}

export class SkillRegistry {
  constructor(private sources: SkillSource[]) {}

  async list(): Promise<SkillRecord[]> {
    const merged = new Map<string, SkillRecord>();

    for (const source of this.sources) {
      const skills = await source.list();
      for (const skill of skills) {
        if (!merged.has(skill.name)) {
          merged.set(skill.name, skill);
        }
      }
    }

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(identifier: string): Promise<SkillRecord | null> {
    for (const source of this.sources) {
      const skill = await source.get(identifier);
      if (skill) {
        return skill;
      }
    }

    return null;
  }
}
