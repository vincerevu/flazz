import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPrismaClient } from '../../storage/prisma.js';
import { SqliteLabelingStateRepo } from '../labeling-state.js';

test('SqliteLabelingStateRepo saves, loads, and resets email labeling state', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flazz-labeling-state-'));
  const storage = { workDir: tempDir };
  const prisma = createPrismaClient(storage);

  try {
    const repo = new SqliteLabelingStateRepo({ prisma, storage });
    await repo.save({
      lastRunTime: '2026-04-18T12:00:00.000Z',
      processedFiles: {
        'D:\\Flazz\\gmail_sync\\a.md': { labeledAt: '2026-04-18T12:01:00.000Z' },
        'D:\\Flazz\\gmail_sync\\b.md': { labeledAt: '2026-04-18T12:02:00.000Z' },
      },
    });

    const state = await repo.load();
    assert.equal(state.lastRunTime, '2026-04-18T12:00:00.000Z');
    assert.equal(Object.keys(state.processedFiles).length, 2);
    assert.equal(state.processedFiles['D:\\Flazz\\gmail_sync\\a.md']?.labeledAt, '2026-04-18T12:01:00.000Z');

    await repo.reset();
    const reset = await repo.load();
    assert.equal(Object.keys(reset.processedFiles).length, 0);
    assert.notEqual(reset.lastRunTime, new Date(0).toISOString());
  } finally {
    await prisma.$disconnect();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
