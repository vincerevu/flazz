import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Run as RunSchema } from '@flazz/shared';
import { z } from 'zod';
import { LearningStateRepo } from '../learning-state-repo.js';
import { SkillManager } from '../skill-manager.js';
import { SkillRepo } from '../skill-repo.js';
import {
  buildRunSignature,
  deriveRunLearningSignals,
  getLoadedSkills,
  normalizeLearningDecision,
  parseLearningDecisionPayload,
  runHasFailureSignal,
  scoreRunForLearning,
  shouldConsiderRun,
} from '../run-learning-service.js';

type Run = z.infer<typeof RunSchema>;

function createRunFixture(options?: {
  toolNames?: string[];
  withError?: boolean;
  withStop?: boolean;
  loadSkillResult?: { name: string; source: 'workspace' | 'builtin' | 'unknown' };
}): Run {
  const toolNames = options?.toolNames ?? ['workspace-readFile', 'workspace-grep', 'loadSkill', 'workspace-writeFile', 'skill_view'];
  const log: Run['log'] = [
    {
      runId: 'run-1',
      type: 'message' as const,
      messageId: 'm1',
      subflow: [],
      message: {
        role: 'user' as const,
        content: 'Please prepare a reusable deployment workflow and remember it for next time.',
      },
    },
    ...toolNames.map((toolName, index): Run['log'][number] => ({
      runId: 'run-1',
      type: 'tool-invocation',
      toolCallId: `t${index + 1}`,
      toolName,
      input: '{}',
      subflow: [],
    })),
    {
      runId: 'run-1',
      type: 'message' as const,
      messageId: 'm2',
      subflow: [],
      message: {
        role: 'assistant' as const,
        content: 'Done. I created the deployment workflow and documented the steps.',
      },
    },
  ];

  if (options?.loadSkillResult) {
    log.push({
      runId: 'run-1',
      type: 'tool-result',
      toolCallId: 'loaded-1',
      toolName: 'loadSkill',
      result: {
        success: true,
        skillName: options.loadSkillResult.name,
        source: options.loadSkillResult.source,
        content: 'skill content',
      },
      subflow: [],
    });
  }

  if (options?.withError) {
    log.push({
      runId: 'run-1',
      type: 'error',
      error: 'boom',
      subflow: [],
    });
  }

  if (options?.withStop) {
    log.push({
      runId: 'run-1',
      type: 'run-stopped',
      reason: 'user-requested',
      subflow: [],
    });
  }

  return {
    id: 'run-1',
    createdAt: new Date().toISOString(),
    agentId: 'copilot',
    runType: 'chat',
    log,
  };
}

test('shouldConsiderRun accepts successful complex runs', () => {
  const run = createRunFixture();
  assert.deepEqual(shouldConsiderRun(run), { ok: true });
});

test('shouldConsiderRun still accepts shorter valid workflows', () => {
  const run = createRunFixture({
    toolNames: ['workspace-readFile', 'workspace-writeFile', 'workspace-search'],
  });

  assert.deepEqual(shouldConsiderRun(run), { ok: true });
});

test('shouldConsiderRun rejects failed runs and reports the reason', () => {
  const run = createRunFixture({ withError: true });
  assert.deepEqual(shouldConsiderRun(run), {
    ok: false,
    reason: 'run ended with error or stop',
  });
});

test('buildRunSignature is stable across duplicate tool noise while preserving ordered workflow shape', () => {
  const a = createRunFixture({ toolNames: ['loadSkill', 'workspace-readFile', 'workspace-writeFile', 'workspace-readFile', 'workspace-grep'] });
  const b = createRunFixture({ toolNames: ['loadSkill', 'workspace-readFile', 'workspace-writeFile', 'workspace-grep'] });
  const c = createRunFixture({ toolNames: ['workspace-grep', 'workspace-writeFile', 'loadSkill', 'workspace-readFile'] });

  assert.equal(buildRunSignature(a), buildRunSignature(b));
  assert.notEqual(buildRunSignature(a), buildRunSignature(c));
});

test('getLoadedSkills extracts successful loadSkill tool results', () => {
  const run = createRunFixture({
    loadSkillResult: {
      name: 'deploy-workflow',
      source: 'workspace',
    },
  });

  assert.deepEqual(getLoadedSkills(run), [
    { name: 'deploy-workflow', source: 'workspace' },
  ]);
});

test('runHasFailureSignal detects both error and stop events', () => {
  assert.equal(runHasFailureSignal(createRunFixture({ withError: true })), true);
  assert.equal(runHasFailureSignal(createRunFixture({ withStop: true })), true);
  assert.equal(runHasFailureSignal(createRunFixture()), false);
});

test('deriveRunLearningSignals captures reuse cues and output shape', () => {
  const run = createRunFixture({
    toolNames: ['workspace-readFile', 'workspace-search', 'workspace-writeFile'],
  });

  const signals = deriveRunLearningSignals(run);
  assert.equal(signals.explicitUserReuseSignal, true);
  assert.equal(signals.outputShape, 'narrative');
  assert.ok(signals.complexityScore > 0.3);
  assert.equal(signals.orderedToolNames.join(','), 'workspace-readFile,workspace-search,workspace-writeFile');
});

test('scoreRunForLearning rewards recurrence and explicit reuse signals', () => {
  const signals = deriveRunLearningSignals(createRunFixture());
  const score = scoreRunForLearning({
    signals,
    recurrenceScore: 0.44,
    relatedSkillScore: 0.5,
  });

  assert.ok(score >= 0.6);
});

test('normalizeLearningDecision converts create into update for a strong related skill match', () => {
  const normalized = normalizeLearningDecision({
    decision: {
      action: 'create',
      name: 'deploy-workflow-v2',
      description: 'Improved deploy workflow',
      content: '---\nname: deploy-workflow\ndescription: Improved deploy workflow\n---\n## Steps\n- Do it',
    },
    relatedWorkspaceSkill: {
      name: 'deploy-workflow',
      score: 0.82,
    },
    recurrenceScore: 0.48,
  });

  assert.equal(normalized.action, 'update');
  if (normalized.action === 'update') {
    assert.equal(normalized.targetSkill, 'deploy-workflow');
  }
});

test('parseLearningDecisionPayload tolerates think tags and fenced json', () => {
  const payload = parseLearningDecisionPayload([
    '<think>internal reasoning</think>',
    '```json',
    '{',
    '  "action": "none",',
    '  "rationale": "not reusable"',
    '}',
    '```',
  ].join('\n'));

  assert.deepEqual(payload, {
    action: 'none',
    rationale: 'not reusable',
  });
});

test('LearningStateRepo tracks candidate promotion and failure stats', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'flazz-skill-learning-'));
  const repo = new LearningStateRepo(tempDir);
  try {
    const candidate = await repo.bumpCandidate('sig-1', 'run-1', 'deploy-workflow');
    assert.equal(candidate.occurrences, 1);

    await repo.updateCandidateDraft('sig-1', {
      proposedCategory: 'devops',
      proposedDescription: 'Deploy app changes safely',
      draftContent: '---\nname: deploy-workflow\ndescription: Deploy app changes safely\n---\n## Steps\n- Do it',
    });
    await repo.recordSkillFailure('deploy-workflow');
    await repo.recordSkillUpdated('deploy-workflow');
    await repo.markCandidatePromoted('sig-1', 'deploy-workflow');

    const state = await repo.getState();
    assert.equal(state.candidates['sig-1']?.status, 'promoted');
    assert.equal(state.skills['deploy-workflow']?.failureCount, 1);
    assert.ok(state.skills['deploy-workflow']?.lastUpdatedAt);
    assert.ok((state.candidates['sig-1']?.confidence ?? 0) > 0.5);
  } finally {
    await repo.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('rejected candidates return to pending and gain confidence only after recurrence', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'flazz-skill-learning-'));
  const repo = new LearningStateRepo(tempDir);
  try {
    await repo.bumpCandidate('sig-2', 'run-1', 'triage-workflow', {
      intentFingerprint: 'triage-issues',
      toolSequenceFingerprint: 'workspace-search-workspace-readFile',
      explicitUserReuseSignal: true,
      complexityScore: 0.6,
      recurrenceScore: 0.22,
    });
    await repo.rejectCandidate('sig-2');
    const retried = await repo.bumpCandidate('sig-2', 'run-2', 'triage-workflow', {
      intentFingerprint: 'triage-issues',
      toolSequenceFingerprint: 'workspace-search-workspace-readFile',
      explicitUserReuseSignal: true,
      complexityScore: 0.6,
      recurrenceScore: 0.44,
    });

    assert.equal(retried.status, 'pending');
    assert.equal(retried.occurrences, 2);
    assert.ok(retried.confidence >= 0.5);
  } finally {
    await repo.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('LearningStateRepo can find related candidates by recurrence fingerprints', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'flazz-skill-learning-'));
  const repo = new LearningStateRepo(tempDir);
  try {
    await repo.bumpCandidate('sig-a', 'run-1', 'deploy-workflow', {
      intentFingerprint: 'deploy-workflow',
      toolSequenceFingerprint: 'workspace-readFile-workspace-writeFile',
      relatedSkillName: 'deploy-workflow',
      complexityScore: 0.7,
      recurrenceScore: 0.2,
    });
    await repo.bumpCandidate('sig-b', 'run-2', 'deploy-checklist', {
      intentFingerprint: 'deploy-workflow',
      toolSequenceFingerprint: 'workspace-readFile-workspace-writeFile',
      relatedSkillName: 'deploy-workflow',
      complexityScore: 0.75,
      recurrenceScore: 0.44,
    });

    const related = await repo.findRelatedCandidates({
      intentFingerprint: 'deploy-workflow',
      toolSequenceFingerprint: 'workspace-readFile-workspace-writeFile',
      relatedSkillName: 'deploy-workflow',
    });

    assert.equal(related.length, 2);
  } finally {
    await repo.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('SkillRepo persists revisions for create and update flows', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'flazz-skill-revisions-'));
  try {
    const repo = new SkillRepo(tempDir);
    const initial = [
      '---',
      'name: deploy-workflow',
      'description: Deploy safely',
      '---',
      '## Steps',
      '- Build',
    ].join('\n');
    const updated = [
      '---',
      'name: deploy-workflow',
      'description: Deploy safely',
      '---',
      '## Steps',
      '- Build',
      '- Roll out',
    ].join('\n');

    await repo.create('deploy-workflow', initial);
    await repo.update('deploy-workflow', updated);

    const revisions = await repo.listRevisions('deploy-workflow');
    assert.equal(revisions.length, 2);
    assert.equal(revisions[0]?.reason, 'update');
    assert.equal(revisions[1]?.reason, 'create');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('SkillManager rejects non-English skill content', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'flazz-skill-language-'));
  try {
    const manager = new SkillManager(new SkillRepo(tempDir));
    const result = await manager.create(
      'daily-check',
      [
        '---',
        'name: daily-check',
        'description: Kiểm tra công việc hằng ngày',
        '---',
        '## Steps',
        '- Kiểm tra email mới',
      ].join('\n'),
    );

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /English only/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
