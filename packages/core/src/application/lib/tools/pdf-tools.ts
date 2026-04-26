import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { z } from 'zod';
import { absToRelPosix, resolveWorkspacePath } from '../../../workspace/workspace.js';
import { WorkDir } from '../../../config/config.js';

export type RenderHtmlToPdfInput = {
  html: string;
  outputPath: string;
  baseDir: string;
  title?: string;
  pageSize?: 'A4' | 'Letter';
};

export type RenderHtmlToPdfResult = {
  success: boolean;
  path?: string;
  bytes?: number;
  error?: string;
};

export interface PdfExportService {
  renderHtmlToPdf(input: RenderHtmlToPdfInput): Promise<RenderHtmlToPdfResult>;
}

let pdfExportService: PdfExportService | null = null;

export function setPdfExportService(service: PdfExportService): void {
  pdfExportService = service;
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildHtmlDocument({
  markdownSource,
  title,
  language,
}: {
  markdownSource: string;
  title: string;
  language: string;
}): string {
  const body = markdown.render(markdownSource);
  const safeTitle = escapeHtml(title);
  const safeLanguage = escapeHtml(language);

  return `<!doctype html>
<html lang="${safeLanguage}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      @page {
        size: A4;
        margin: 18mm 16mm 20mm;
      }

      :root {
        color-scheme: light;
        --text: #161616;
        --muted: #5f6368;
        --border: #d7dbe0;
        --surface: #f6f7f9;
        --accent: #0b57d0;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: var(--text);
        font-family: "Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.58;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        padding: 0;
      }

      main {
        width: 100%;
      }

      h1, h2, h3, h4, h5, h6 {
        color: #111827;
        margin: 1.1em 0 0.45em;
        line-height: 1.22;
        page-break-after: avoid;
      }

      h1 {
        font-size: 21pt;
        margin-top: 0;
      }

      h2 {
        font-size: 16pt;
        border-bottom: 1px solid var(--border);
        padding-bottom: 0.18em;
      }

      h3 {
        font-size: 13pt;
      }

      p, ul, ol, table, pre, blockquote {
        margin: 0 0 0.9em;
      }

      ul, ol {
        padding-left: 1.35em;
      }

      li + li {
        margin-top: 0.22em;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      blockquote {
        border-left: 3px solid var(--border);
        margin-left: 0;
        padding: 0.1em 0 0.1em 1em;
        color: var(--muted);
      }

      code {
        font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
        font-size: 0.92em;
        background: var(--surface);
        border-radius: 4px;
        padding: 0.1em 0.35em;
      }

      pre {
        overflow-x: auto;
        background: #111827;
        color: #f9fafb;
        border-radius: 10px;
        padding: 0.95em 1.1em;
        white-space: pre-wrap;
        word-break: break-word;
      }

      pre code {
        background: transparent;
        color: inherit;
        padding: 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        page-break-inside: avoid;
      }

      th, td {
        border: 1px solid var(--border);
        padding: 0.5em 0.6em;
        vertical-align: top;
        text-align: left;
      }

      th {
        background: var(--surface);
        font-weight: 600;
      }

      img {
        max-width: 100%;
        height: auto;
      }

      hr {
        border: 0;
        border-top: 1px solid var(--border);
        margin: 1.4em 0;
      }
    </style>
  </head>
  <body>
    <main>
${body}
    </main>
  </body>
</html>`;
}

function normalizePdfOutputPath(outputPath: string): string {
  const normalized = outputPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
}

export const pdfTools = {
  renderMarkdownPdf: {
    description:
      'Render a standalone PDF document from markdown using Flazz\'s built-in Electron PDF exporter. ' +
      'Use this for reports, briefs, handbooks, and long-form PDF artifacts after you have already written the markdown source to the workspace. ' +
      'Do not use pandoc, reportlab, markitdown, pip install, or ad hoc converters when this tool can satisfy the request.',
    inputSchema: z.object({
      markdown: z.string().min(1).describe('Markdown source to render into PDF.'),
      outputPath: z.string().min(1).describe('Workspace-relative output PDF path. If no .pdf suffix is provided it will be added automatically.'),
      title: z.string().optional().describe('Document title for HTML metadata and PDF window title.'),
      language: z.string().optional().describe('Primary document language, for example "vi" or "en".'),
      baseDir: z.string().optional().describe('Workspace-relative base directory for resolving relative assets in markdown. Defaults to the PDF output directory.'),
      pageSize: z.enum(['A4', 'Letter']).optional().describe('PDF page size. Defaults to A4.'),
    }),
    execute: async ({
      markdown: markdownSource,
      outputPath,
      title,
      language = 'en',
      baseDir,
      pageSize = 'A4',
    }: {
      markdown: string;
      outputPath: string;
      title?: string;
      language?: string;
      baseDir?: string;
      pageSize?: 'A4' | 'Letter';
    }) => {
      if (!pdfExportService) {
        return {
          success: false,
          error: 'PDF export service is not initialized.',
        };
      }

      const normalizedOutputPath = normalizePdfOutputPath(outputPath);
      if (normalizedOutputPath.toLowerCase().startsWith('memory/')) {
        return {
          success: false,
          error: 'Do not write PDF artifacts into memory/. Use output/ or exports/ instead.',
        };
      }

      const resolvedOutputPath = resolveWorkspacePath(normalizedOutputPath);
      const resolvedBaseDir = resolveWorkspacePath(
        baseDir?.replace(/\\/g, '/').replace(/^\/+/, '')
          ?? path.posix.dirname(normalizedOutputPath),
      );
      const html = buildHtmlDocument({
        markdownSource,
        title: title ?? path.basename(normalizedOutputPath, '.pdf'),
        language,
      });

      const result = await pdfExportService.renderHtmlToPdf({
        html,
        outputPath: resolvedOutputPath,
        baseDir: resolvedBaseDir,
        title,
        pageSize,
      });

      if (!result.success) {
        return result;
      }

      const resolvedResultPath = result.path
        ? absToRelPosix(result.path) ?? absToRelPosix(resolvedOutputPath)
        : absToRelPosix(resolvedOutputPath);

      return {
        ...result,
        path: resolvedResultPath ?? path.relative(WorkDir, resolvedOutputPath),
      };
    },
  },
};

export const __private__ = {
  buildHtmlDocument,
  normalizePdfOutputPath,
};
