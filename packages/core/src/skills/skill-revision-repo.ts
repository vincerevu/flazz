import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const SkillRevisionEntry = z.object({
  id: z.string(),
  createdAt: z.string(),
  reason: z.string(),
  actor: z.enum(['system', 'agent', 'user']),
  runId: z.string().optional(),
  summary: z.string().optional(),
  previousContent: z.string().optional(),
  nextContent: z.string(),
});

export type SkillRevisionEntry = z.infer<typeof SkillRevisionEntry>;

export class SkillRevisionRepo {
  private readonly revisionsDirName = '.revisions';

  async appendRevision(
    skillPath: string,
    revision: Omit<SkillRevisionEntry, 'id' | 'createdAt'>,
  ): Promise<SkillRevisionEntry> {
    const fullRevision: SkillRevisionEntry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...revision,
    };

    const revisionsDir = path.join(skillPath, this.revisionsDirName);
    await fs.mkdir(revisionsDir, { recursive: true });
    const filePath = path.join(revisionsDir, `${fullRevision.createdAt.replace(/[:.]/g, '-')}-${fullRevision.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(fullRevision, null, 2), 'utf-8');
    return fullRevision;
  }

  async listRevisions(skillPath: string): Promise<SkillRevisionEntry[]> {
    const revisionsDir = path.join(skillPath, this.revisionsDirName);
    try {
      const entries = await fs.readdir(revisionsDir, { withFileTypes: true });
      const revisions = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map(async (entry) => {
            const raw = await fs.readFile(path.join(revisionsDir, entry.name), 'utf-8');
            return SkillRevisionEntry.parse(JSON.parse(raw));
          }),
      );
      return revisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  async getRevision(skillPath: string, revisionId: string): Promise<SkillRevisionEntry | null> {
    const revisions = await this.listRevisions(skillPath);
    return revisions.find((revision) => revision.id === revisionId) ?? null;
  }
}
