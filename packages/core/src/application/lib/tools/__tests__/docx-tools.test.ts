import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { __docxPrivate__, docxTools } from '../docx-tools.js';
import { WorkDir } from '../../../../config/runtime-defaults.js';

function assertSuccessful<T extends { success: boolean; error?: string }>(
  result: T,
): asserts result is T & { success: true } {
  if (!result.success) {
    assert.fail(`expected success but got error: ${result.error ?? 'unknown error'}`);
  }
}

type ValidationSuccess = {
  success: true
  issueCount: number
}

type InspectionSuccess = {
  success: true
  nonEmptyParagraphCount: number
  tableCount: number
  hasHeaders: boolean
  hasFooters: boolean
  headings: Array<{ text?: string }>
  preview: string[]
}

test('normalizeDocxOutputPath appends missing extension', () => {
  assert.equal(__docxPrivate__.normalizeDocxOutputPath('output/doc/report'), 'output/doc/report.docx');
  assert.equal(__docxPrivate__.normalizeDocxOutputPath('output/doc/report.docx'), 'output/doc/report.docx');
});

test('renderDocumentDocx blocks memory artifacts', async () => {
  const result = await docxTools.renderDocumentDocx.execute({
    outputPath: 'memory/report.docx',
    title: 'Blocked',
  });

  assert.equal(result.success, false);
  assert.match(String(result.error), /Do not write document artifacts into memory/i);
});

test('renderDocumentDocx normalizes missing sections/content without crashing', async () => {
  const created = await docxTools.renderDocumentDocx.execute({
    outputPath: 'output/doc/docx-minimal',
    title: 'Minimal',
    sections: undefined,
    content: undefined,
  });

  assert.equal(created.success, true);
  assert.ok(created.path);
});

test('renderDocumentDocx rejects invalid section content shape with a schema error instead of crashing', async () => {
  const result = await docxTools.renderDocumentDocx.execute({
    outputPath: 'output/doc/docx-invalid-shape',
    sections: [{ heading: 'Broken', content: { type: 'paragraph', text: 'oops' } }],
  } as never);

  assert.equal(result.success, false);
  assert.match(String(result.error), /expected array/i);
});

test('renderDocumentDocx creates a valid document and inspectDocumentDocx reports structure', async () => {
  const created = await docxTools.renderDocumentDocx.execute({
    outputPath: 'output/doc/docx-tool-check',
    title: 'Harness Engineering',
    subtitle: 'Draft',
    author: 'Flazz',
    headerText: 'Internal',
    footerText: 'Page footer',
    sections: [
      {
        heading: 'Overview',
        content: [
          { type: 'paragraph', text: 'Harness engineering improves reliability.' },
          { type: 'list', ordered: false, items: ['Repeatability', 'Observability'] },
          { type: 'table', headers: ['Metric', 'Value'], rows: [['Coverage', '92%']] },
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const createdPath = created.path;
  assert.ok(createdPath);

  const validation = await docxTools.validateDocumentDocx.execute({ documentPath: createdPath });
  assertSuccessful(validation);
  const validated = validation as ValidationSuccess;
  assert.equal(validated.issueCount, 0);

  const inspection = await docxTools.inspectDocumentDocx.execute({ documentPath: createdPath });
  assertSuccessful(inspection);
  const inspected = inspection as InspectionSuccess;
  assert.ok(inspected.nonEmptyParagraphCount >= 4);
  assert.equal(inspected.tableCount, 1);
  assert.ok(inspected.hasHeaders);
  assert.ok(inspected.hasFooters);
  assert.ok(inspected.headings.some((entry: { text?: string }) => entry.text === 'Overview'));
  assert.ok(inspected.preview.some((line: string) => line.includes('Harness engineering')));
});

test('renderDocumentDocx can render directly from markdownPath and preserves Vietnamese headings', async () => {
  const markdownPath = path.join(WorkDir, 'output/doc/docx-markdown-source.md');
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(
    markdownPath,
    [
      '# Báo Cáo',
      '',
      '## Google (Gemini)',
      '',
      '#### Thông Số Kỹ Thuật',
      '',
      '| Thông số | Giá trị |',
      '|----------|---------|',
      '| Models | Gemini 3.1 Pro |',
    ].join('\n'),
    'utf8',
  );

  const created = await docxTools.renderDocumentDocx.execute({
    outputPath: 'output/doc/docx-from-markdown',
    title: 'Báo Cáo',
    markdownPath: 'output/doc/docx-markdown-source.md',
  });

  assert.equal(created.success, true);
  const inspection = await docxTools.inspectDocumentDocx.execute({ documentPath: created.path! });
  assertSuccessful(inspection);
  const inspected = inspection as InspectionSuccess;
  assert.ok(inspected.headings.some((entry: { text?: string }) => entry.text === 'Google (Gemini)'));
  assert.ok(inspected.headings.some((entry: { text?: string }) => entry.text === 'Thông Số Kỹ Thuật'));
  assert.ok(inspected.preview.some((line: string) => line.includes('Thông Số Kỹ Thuật')));
});

test('replaceTextDocumentDocx updates body and preserves a valid package', async () => {
  const created = await docxTools.renderDocumentDocx.execute({
    outputPath: 'output/doc/docx-replace-source',
    title: 'Initial Title',
    sections: [
      {
        heading: 'Summary',
        content: [
          { type: 'paragraph', text: 'Replace OLD token in this paragraph.' },
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const replaced = await docxTools.replaceTextDocumentDocx.execute({
    documentPath: created.path!,
    outputPath: 'output/doc/docx-replace-result',
    find: 'OLD',
    replace: 'NEW',
  });

  assert.equal(replaced.success, true);
  const replacements = replaced.replacements;
  const changedParts = replaced.changedParts;
  const validation = replaced.validation;
  assert.ok(replacements !== undefined && replacements >= 1);
  assert.ok(changedParts?.includes('word/document.xml'));
  assert.equal(validation?.issueCount, 0);

  const inspection = await docxTools.inspectDocumentDocx.execute({ documentPath: replaced.path! });
  assertSuccessful(inspection);
  const inspected = inspection as InspectionSuccess;
  assert.ok(inspected.preview.some((line: string) => line.includes('NEW token')));
});

test('validateDocumentDocx catches broken packages', async () => {
  const brokenPath = path.join(WorkDir, `output/doc/docx-broken-${Date.now()}.docx`);
  await fs.mkdir(path.dirname(brokenPath), { recursive: true });
  await fs.writeFile(brokenPath, Buffer.from('not-a-docx'));

  const validation = await docxTools.validateDocumentDocx.execute({
    documentPath: path.relative(WorkDir, brokenPath).replace(/\\/g, '/'),
  }).catch((error) => ({ success: false, error }));

  assert.equal(validation.success, false);
});
