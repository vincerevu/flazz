import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { imageSize } from 'image-size';
import MarkdownIt from 'markdown-it';
import { z } from 'zod';
import { absToRelPosix, resolveWorkspacePath } from '../../../workspace/workspace.js';
import { WorkDir } from '../../../config/config.js';
import { inspectDocxBuffer, replaceTextInDocxBuffer, validateDocxBuffer } from './docx-ooxml.js';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

const DocumentContentItemSchema: z.ZodType<{
  type?: 'paragraph' | 'heading' | 'list' | 'table' | 'image' | 'pageBreak';
  text?: string;
  level?: number;
  ordered?: boolean;
  items?: string[];
  headers?: string[];
  rows?: string[][];
  style?: string;
  path?: string;
  widthInches?: number;
}> = z.object({
  type: z.enum(['paragraph', 'heading', 'list', 'table', 'image', 'pageBreak']).optional(),
  text: z.string().optional(),
  level: z.number().int().min(1).max(6).optional(),
  ordered: z.boolean().optional(),
  items: z.array(z.string()).optional(),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
  style: z.string().optional(),
  path: z.string().optional(),
  widthInches: z.number().positive().optional(),
});

const DocumentSectionSchema = z.object({
  heading: z.string().optional(),
  level: z.number().int().min(1).max(6).optional(),
  content: z.array(DocumentContentItemSchema).default([]),
});

const RenderDocumentDocxInputSchema = z.object({
  outputPath: z.string().min(1),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  font: z.string().optional(),
  fontSize: z.number().positive().optional(),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
  sections: z.array(DocumentSectionSchema).default([]),
  content: z.array(DocumentContentItemSchema).default([]),
  markdown: z.string().optional(),
  markdownPath: z.string().optional(),
});

const InspectDocumentDocxInputSchema = z.object({
  documentPath: z.string().min(1),
});

const ReplaceTextDocumentDocxInputSchema = z.object({
  documentPath: z.string().min(1),
  outputPath: z.string().min(1),
  find: z.string().min(1),
  replace: z.string(),
});

type DocumentContentItem = z.infer<typeof DocumentContentItemSchema>;
type DocumentSection = z.infer<typeof DocumentSectionSchema>;

function normalizeInlineText(token: { content?: string } | undefined): string {
  return String(token?.content ?? '').replace(/\s+/g, ' ').trim();
}

function tokensToContentItems(tokens: Array<{ type: string; content?: string }>): DocumentContentItem[] {
  const items: DocumentContentItem[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'paragraph_open') {
      const inline = tokens[index + 1];
      const text = normalizeInlineText(inline);
      if (text) items.push({ type: 'paragraph', text });
      continue;
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const listItems: string[] = [];
      const ordered = token.type === 'ordered_list_open';
      let depth = 1;

      for (index += 1; index < tokens.length; index += 1) {
        const next = tokens[index];
        if (next.type === token.type) depth += 1;
        if (next.type === (ordered ? 'ordered_list_close' : 'bullet_list_close')) {
          depth -= 1;
          if (depth === 0) break;
        }
        if (next.type === 'inline') {
          const text = normalizeInlineText(next);
          if (text) listItems.push(text);
        }
      }

      if (listItems.length > 0) {
        items.push({ type: 'list', ordered, items: listItems });
      }
      continue;
    }

    if (token.type === 'table_open') {
      const rows: string[][] = [];
      let currentRow: string[] | null = null;

      for (index += 1; index < tokens.length; index += 1) {
        const next = tokens[index];
        if (next.type === 'tr_open') currentRow = [];
        if ((next.type === 'th_close' || next.type === 'td_close') && currentRow) {
          // no-op, content is already appended on inline tokens
        }
        if (next.type === 'inline' && currentRow) {
          currentRow.push(normalizeInlineText(next));
        }
        if (next.type === 'tr_close' && currentRow) {
          rows.push(currentRow);
          currentRow = null;
        }
        if (next.type === 'table_close') break;
      }

      if (rows.length > 0) {
        const [headers, ...bodyRows] = rows;
        items.push({
          type: 'table',
          headers,
          rows: bodyRows,
        });
      }
      continue;
    }
  }

  return items;
}

function markdownToSections(markdownSource: string): DocumentSection[] {
  const tokens = markdown.parse(markdownSource, {});
  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;
  let preface: DocumentContentItem[] = [];

  const flushPreface = () => {
    if (preface.length > 0 && sections.length === 0) {
      sections.push({ content: preface });
      preface = [];
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const inline = tokens[index + 1];
      const heading = normalizeInlineText(inline);
      const level = Number.parseInt(token.tag.replace('h', ''), 10) || 1;
      const nextHeadingIndex = tokens.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.type === 'heading_open');
      const sliceEnd = nextHeadingIndex === -1 ? tokens.length : nextHeadingIndex;
      const bodyTokens = tokens.slice(index + 3, sliceEnd);

      flushPreface();
      currentSection = {
        heading,
        level,
        content: tokensToContentItems(bodyTokens),
      };
      sections.push(currentSection);
      index = sliceEnd - 1;
      continue;
    }
  }

  if (sections.length === 0) {
    return [{ content: tokensToContentItems(tokens) }];
  }

  return sections;
}

function normalizeDocxOutputPath(outputPath: string): string {
  const normalized = outputPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized.toLowerCase().endsWith('.docx') ? normalized : `${normalized}.docx`;
}

function headingLevel(level: number | undefined) {
  switch (level) {
    case 1: return HeadingLevel.HEADING_1;
    case 2: return HeadingLevel.HEADING_2;
    case 3: return HeadingLevel.HEADING_3;
    case 4: return HeadingLevel.HEADING_4;
    case 5: return HeadingLevel.HEADING_5;
    case 6: return HeadingLevel.HEADING_6;
    default: return HeadingLevel.HEADING_1;
  }
}

async function createImageRun(item: DocumentContentItem): Promise<ImageRun | null> {
  if (!item.path) return null;
  const imagePath = resolveWorkspacePath(item.path.replace(/\\/g, '/'));
  const data = await fs.readFile(imagePath);
  const dimensions = imageSize(data);
  const width = item.widthInches ? Math.round(item.widthInches * 96) : Math.min(dimensions.width ?? 480, 480);
  const height = dimensions.width && dimensions.height
    ? Math.round((width / dimensions.width) * dimensions.height)
    : width;
  const ext = path.extname(imagePath).toLowerCase();
  const type =
    ext === '.png' ? 'png'
      : ext === '.jpg' || ext === '.jpeg' ? 'jpg'
        : ext === '.gif' ? 'gif'
          : ext === '.bmp' ? 'bmp'
            : undefined;
  if (!type) return null;

  return new ImageRun({
    type,
    data,
    transformation: { width, height },
  });
}

async function contentItemToBlocks(item: DocumentContentItem): Promise<Array<Paragraph | Table>> {
  const kind = item.type ?? 'paragraph';
  if (kind === 'heading') {
    return [new Paragraph({
      heading: headingLevel(item.level),
      children: [new TextRun(String(item.text ?? ''))],
    })];
  }

  if (kind === 'list') {
    const items = item.items ?? [];
    if (item.ordered) {
      return items.map((text) => new Paragraph({
        numbering: { reference: 'flazz-ordered', level: 0 },
        children: [new TextRun(text)],
      }));
    }
    return items.map((text) => new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun(text)],
    }));
  }

  if (kind === 'table') {
    const headers = item.headers ?? [];
    const bodyRows = item.rows ?? [];
    const rows: TableRow[] = [];
    if (headers.length > 0) {
      rows.push(new TableRow({
        children: headers.map((header) => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })],
        })),
      }));
    }
    for (const row of bodyRows) {
      rows.push(new TableRow({
        children: row.map((cell) => new TableCell({
          children: [new Paragraph(String(cell))],
        })),
      }));
    }
    return [new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    })];
  }

  if (kind === 'image') {
    const image = await createImageRun(item);
    return image ? [new Paragraph({ children: [image] })] : [];
  }

  if (kind === 'pageBreak') {
    return [new Paragraph({ children: [new PageBreak()] })];
  }

  return [new Paragraph(String(item.text ?? ''))];
}

async function contentToBlocks(items: DocumentContentItem[] | undefined | null): Promise<Array<Paragraph | Table>> {
  const blocks: Array<Paragraph | Table> = [];
  for (const item of Array.isArray(items) ? items : []) {
    blocks.push(...await contentItemToBlocks(item));
  }
  return blocks;
}

async function buildDocumentBuffer(config: {
  title?: string;
  subtitle?: string;
  author?: string;
  font?: string;
  fontSize?: number;
  headerText?: string;
  footerText?: string;
  sections?: DocumentSection[];
  content?: DocumentContentItem[];
  markdown?: string;
}): Promise<Buffer> {
  let sections = config.sections ?? [];
  const content = config.content ?? [];
  if ((sections.length === 0 && content.length === 0) && config.markdown) {
    sections = markdownToSections(config.markdown);
  }

  const children: Array<Paragraph | Table> = [];

  if (config.title) {
    children.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: config.title, bold: true })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun(config.subtitle)],
    }));
  }
  if (config.author) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun(config.author)],
    }));
  }

  for (const section of sections) {
    if (section.heading) {
      children.push(new Paragraph({
        heading: headingLevel(section.level),
        children: [new TextRun(section.heading)],
      }));
    }
    children.push(...await contentToBlocks(section.content));
  }

  children.push(...await contentToBlocks(content));

  const document = new Document({
    creator: 'Flazz',
    title: config.title,
    styles: {
      default: {
        document: {
          run: {
            font: config.font ?? 'Calibri',
            size: Math.round((config.fontSize ?? 11) * 2),
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'flazz-ordered',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        headers: config.headerText
          ? { default: new Header({ children: [new Paragraph(config.headerText)] }) }
          : undefined,
        footers: config.footerText
          ? { default: new Footer({ children: [new Paragraph(config.footerText)] }) }
          : undefined,
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

export const docxTools = {
  renderDocumentDocx: {
    description:
      'Render a new .docx document from structured content using Flazz\'s built-in Node DOCX stack. ' +
      'Use this for reports, proposals, briefs, memos, and other formal Word artifacts without relying on Python or .NET. ' +
      'If you already have a markdown source file, prefer markdownPath or markdown so the DOCX is rendered directly from the source of truth.',
    inputSchema: RenderDocumentDocxInputSchema,
    execute: async (rawInput: unknown) => {
      const parsed = RenderDocumentDocxInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          code: 'invalid_input',
          error: z.prettifyError(parsed.error),
          issues: parsed.error.issues,
        };
      }
      const input = parsed.data;
      let markdownSource = input.markdown;
      if (!markdownSource && input.markdownPath) {
        const resolvedMarkdownPath = resolveWorkspacePath(input.markdownPath.replace(/\\/g, '/'));
        markdownSource = await fs.readFile(resolvedMarkdownPath, 'utf8');
      }
      const normalizedOutputPath = normalizeDocxOutputPath(input.outputPath);
      if (normalizedOutputPath.toLowerCase().startsWith('memory/')) {
        return {
          success: false,
          error: 'Do not write document artifacts into memory/. Use output/ or exports/ instead.',
        };
      }

      const resolvedOutputPath = resolveWorkspacePath(normalizedOutputPath);
      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
      const buffer = await buildDocumentBuffer({
        ...input,
        markdown: markdownSource,
      });
      await fs.writeFile(resolvedOutputPath, buffer);

      return {
        success: true,
        path: absToRelPosix(resolvedOutputPath) ?? path.relative(WorkDir, resolvedOutputPath),
        bytes: buffer.byteLength,
      };
    },
  },
  inspectDocumentDocx: {
    description:
      'Inspect an existing .docx package using Flazz\'s built-in Node OOXML analyzer. ' +
      'Use this to preview headings, tables, headers, footers, and document text before editing.',
    inputSchema: InspectDocumentDocxInputSchema,
    execute: async (rawInput: unknown) => {
      const parsed = InspectDocumentDocxInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          code: 'invalid_input',
          error: z.prettifyError(parsed.error),
          issues: parsed.error.issues,
        };
      }
      const { documentPath } = parsed.data;
      const resolvedDocumentPath = resolveWorkspacePath(documentPath.replace(/\\/g, '/'));
      const buffer = await fs.readFile(resolvedDocumentPath);
      const inspection = await inspectDocxBuffer(buffer);
      return {
        success: true,
        path: absToRelPosix(resolvedDocumentPath) ?? path.relative(WorkDir, resolvedDocumentPath),
        ...inspection,
      };
    },
  },
  validateDocumentDocx: {
    description:
      'Validate a .docx package using Flazz\'s built-in Node OOXML validator. ' +
      'Use this after writing or editing a document to catch missing parts, invalid XML, and common OpenXML ordering problems.',
    inputSchema: InspectDocumentDocxInputSchema,
    execute: async (rawInput: unknown) => {
      const parsed = InspectDocumentDocxInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          code: 'invalid_input',
          error: z.prettifyError(parsed.error),
          issues: parsed.error.issues,
        };
      }
      const { documentPath } = parsed.data;
      const resolvedDocumentPath = resolveWorkspacePath(documentPath.replace(/\\/g, '/'));
      const buffer = await fs.readFile(resolvedDocumentPath);
      const validation = await validateDocxBuffer(buffer);
      return {
        success: true,
        path: absToRelPosix(resolvedDocumentPath) ?? path.relative(WorkDir, resolvedDocumentPath),
        ...validation,
      };
    },
  },
  replaceTextDocumentDocx: {
    description:
      'Replace text inside an existing .docx package using Flazz\'s built-in Node OOXML edit path. ' +
      'Use this for straightforward body/header/footer text updates without round-tripping through Python or .NET.',
    inputSchema: ReplaceTextDocumentDocxInputSchema,
    execute: async (rawInput: unknown) => {
      const parsed = ReplaceTextDocumentDocxInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          code: 'invalid_input',
          error: z.prettifyError(parsed.error),
          issues: parsed.error.issues,
        };
      }
      const { documentPath, outputPath, find, replace } = parsed.data;
      const normalizedOutputPath = normalizeDocxOutputPath(outputPath);
      if (normalizedOutputPath.toLowerCase().startsWith('memory/')) {
        return {
          success: false,
          error: 'Do not write document artifacts into memory/. Use output/ or exports/ instead.',
        };
      }

      const resolvedDocumentPath = resolveWorkspacePath(documentPath.replace(/\\/g, '/'));
      const resolvedOutputPath = resolveWorkspacePath(normalizedOutputPath);
      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

      const buffer = await fs.readFile(resolvedDocumentPath);
      const result = await replaceTextInDocxBuffer(buffer, find, replace);
      await fs.writeFile(resolvedOutputPath, result.buffer);

      const validation = await validateDocxBuffer(result.buffer);
      return {
        success: true,
        path: absToRelPosix(resolvedOutputPath) ?? path.relative(WorkDir, resolvedOutputPath),
        bytes: result.buffer.byteLength,
        replacements: result.replacements,
        changedParts: result.changedParts,
        validation,
      };
    },
  },
};

export const __docxPrivate__ = {
  normalizeDocxOutputPath,
  buildDocumentBuffer,
};
