import path from 'node:path';
import { SkillSource, SkillRecord } from '../../../skills/registry.js';
import { builtInSkillEntries, resolveSkill } from './index.js';

export class SourceSkillSource implements SkillSource {
  async list(): Promise<SkillRecord[]> {
    return builtInSkillEntries.map((entry) => ({
      name: entry.id,
      description: entry.summary,
      path: entry.catalogPath,
      content: entry.content,
      source: 'builtin',
    }));
  }

  async get(identifier: string): Promise<SkillRecord | null> {
    const resolved = resolveSkill(identifier);
    if (!resolved) {
      return null;
    }

    const entry = builtInSkillEntries.find((skill) => skill.id === resolved.id);
    if (!entry) {
      return null;
    }

    return {
      name: entry.id,
      description: entry.summary,
      path: path.normalize(resolved.catalogPath),
      content: resolved.content,
      source: 'builtin',
    };
  }
}
