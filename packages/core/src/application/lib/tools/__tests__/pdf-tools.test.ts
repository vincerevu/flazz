import test from 'node:test';
import assert from 'node:assert/strict';
import { __private__, pdfTools, setPdfExportService } from '../pdf-tools.js';

test('normalizePdfOutputPath appends missing extension', () => {
  assert.equal(__private__.normalizePdfOutputPath('output/doc/report'), 'output/doc/report.pdf');
  assert.equal(__private__.normalizePdfOutputPath('output/doc/report.pdf'), 'output/doc/report.pdf');
});

test('renderMarkdownPdf blocks memory artifacts', async () => {
  setPdfExportService({
    async renderHtmlToPdf() {
      return { success: true, path: 'memory/report.pdf', bytes: 1 };
    },
  });

  const result = await pdfTools.renderMarkdownPdf.execute({
    markdown: '# Title',
    outputPath: 'memory/report.pdf',
  });

  assert.equal(result.success, false);
  assert.match(String(result.error), /Do not write PDF artifacts into memory/i);
});

test('renderMarkdownPdf renders markdown through injected service', async () => {
  let captured: { html: string; outputPath: string; baseDir: string; pageSize?: 'A4' | 'Letter' } | null = null;

  setPdfExportService({
    async renderHtmlToPdf(input) {
      captured = input;
      return { success: true, path: input.outputPath, bytes: 42 };
    },
  });

  const result = await pdfTools.renderMarkdownPdf.execute({
    markdown: '# Harness Engineering\n\n- Mục 1',
    outputPath: 'output/doc/harness-engineering',
    title: 'Harness Engineering',
    language: 'vi',
  });

  assert.equal(result.success, true);
  assert.equal(result.path, 'output/doc/harness-engineering.pdf');
  assert.ok(captured);
  const rendered = captured as { html: string; outputPath: string };
  assert.match(rendered.html, /<h1>Harness Engineering<\/h1>/);
  assert.match(rendered.html, /<li>Mục 1<\/li>/);
  assert.match(rendered.html, /lang="vi"/);
  assert.match(rendered.outputPath.replace(/\\/g, '/'), /output\/doc\/harness-engineering\.pdf$/);
});
