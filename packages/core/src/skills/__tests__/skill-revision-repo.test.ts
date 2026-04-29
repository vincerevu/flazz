import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPrismaClient } from '../../storage/prisma.js';
import { SqliteSkillRevisionRepo } from '../skill-revision-repo.js';

test('SqliteSkillRevisionRepo appends, lists, and fetches skill revisions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flazz-skill-revisions-'));
  const storage = { workDir: tempDir };
  const prisma = createPrismaClient(storage);

  try {
    const repo = new SqliteSkillRevisionRepo({ prisma, storage });
    const skillPath = path.join(tempDir, 'memory', 'Skills', 'deploy-workflow');

    const created = await repo.appendRevision(skillPath, {
      reason: 'create',
      actor: 'agent',
      nextContent: 'initial',
      summary: 'Initial skill creation',
    });
    const updated = await repo.appendRevision(skillPath, {
      reason: 'update',
      actor: 'agent',
      previousContent: 'initial',
      nextContent: 'updated',
      summary: 'Updated SKILL.md',
    });

    const revisions = await repo.listRevisions(skillPath);
    assert.equal(revisions.length, 2);
    assert.equal(revisions[0]?.id, updated.id);
    assert.equal(revisions[1]?.id, created.id);

    const fetched = await repo.getRevision(skillPath, updated.id);
    assert.equal(fetched?.previousContent, 'initial');
    assert.equal(fetched?.nextContent, 'updated');
  } finally {
    await prisma.$disconnect();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
