import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import xpath from 'xpath';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const select = xpath.useNamespaces({
  w: W_NS,
});

type XmlDocument = ReturnType<DOMParser['parseFromString']>;

export type DocxInspectionResult = {
  paragraphCount: number;
  nonEmptyParagraphCount: number;
  tableCount: number;
  headings: Array<{ style: string; text: string }>;
  hasHeaders: boolean;
  hasFooters: boolean;
  hasComments: boolean;
  hasNumbering: boolean;
  preview: string[];
};

export type DocxValidationIssue =
  | { type: 'missing_required_part'; part: string }
  | { type: 'invalid_xml'; part: string; detail: string }
  | { type: 'body_sectpr_not_last'; part: string }
  | { type: 'paragraph_properties_not_first'; part: string }
  | { type: 'run_properties_not_first'; part: string }
  | { type: 'table_cell_properties_not_first'; part: string }
  | { type: 'table_cell_missing_paragraph'; part: string };

export type DocxValidationResult = {
  issueCount: number;
  issues: DocxValidationIssue[];
};

export type DocxReplaceResult = {
  buffer: Buffer;
  replacements: number;
  changedParts: string[];
};

const REQUIRED_PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'word/document.xml',
];

function getLocalName(node: { localName?: string | null; nodeName: string }): string {
  return node.localName ?? node.nodeName.replace(/^.*:/, '');
}

function elementChildren(node: { childNodes: { length: number; item(index: number): Node | null } }): Element[] {
  const children: Element[] = [];
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index);
    if (child && child.nodeType === child.ELEMENT_NODE) {
      children.push(child as Element);
    }
  }
  return children;
}

function parseXml(xml: string): XmlDocument {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function serializeXml(document: XmlDocument): string {
  return new XMLSerializer().serializeToString(document);
}

function textContentForParagraph(paragraph: Node): string {
  const textElements = select('.//w:t', paragraph as unknown as Node) as Element[];
  return textElements.map((element) => element.textContent ?? '').join('');
}

function getDocumentParts(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((filePath) =>
    /^word\/(document|header\d+|footer\d+)\.xml$/i.test(filePath),
  );
}

async function readXml(zip: JSZip, filePath: string): Promise<XmlDocument> {
  const file = zip.file(filePath);
  if (!file) {
    throw new Error(`Missing DOCX entry: ${filePath}`);
  }
  return parseXml(await file.async('string'));
}

export async function inspectDocxBuffer(input: Buffer): Promise<DocxInspectionResult> {
  const zip = await JSZip.loadAsync(input);
  const documentXml = await readXml(zip, 'word/document.xml');
  const paragraphs = select('//w:p', documentXml as unknown as Node) as Node[];
  const nonEmptyParagraphs = paragraphs
    .map((paragraph) => textContentForParagraph(paragraph).trim())
    .filter(Boolean);
  const tableCount = (select('//w:tbl', documentXml as unknown as Node) as Node[]).length;
  const headings = (select('//w:p', documentXml as unknown as Node) as Node[])
    .map((paragraph) => {
      const style = (select('./w:pPr/w:pStyle/@w:val', paragraph) as Attr[])[0]?.value ?? '';
      const text = textContentForParagraph(paragraph).trim();
      if (!style || !text || !style.toLowerCase().startsWith('heading')) return null;
      return { style, text };
    })
    .filter((entry): entry is { style: string; text: string } => entry !== null);

  return {
    paragraphCount: paragraphs.length,
    nonEmptyParagraphCount: nonEmptyParagraphs.length,
    tableCount,
    headings,
    hasHeaders: Object.keys(zip.files).some((filePath) => /^word\/header\d+\.xml$/i.test(filePath)),
    hasFooters: Object.keys(zip.files).some((filePath) => /^word\/footer\d+\.xml$/i.test(filePath)),
    hasComments: Boolean(zip.file('word/comments.xml')),
    hasNumbering: Boolean(zip.file('word/numbering.xml')),
    preview: nonEmptyParagraphs.slice(0, 20),
  };
}

function validateElementOrder(document: XmlDocument, part: string): DocxValidationIssue[] {
  const issues: DocxValidationIssue[] = [];

  const bodies = select('//w:body', document as unknown as Node) as Node[];
  for (const body of bodies) {
    const children = elementChildren(body);
    const sectPrIndex = children.findIndex((child) => getLocalName(child) === 'sectPr');
    if (sectPrIndex >= 0 && sectPrIndex !== children.length - 1) {
      issues.push({ type: 'body_sectpr_not_last', part });
    }
  }

  for (const paragraph of select('//w:p', document as unknown as Node) as Node[]) {
    const children = elementChildren(paragraph);
    const pPrIndex = children.findIndex((child) => getLocalName(child) === 'pPr');
    if (pPrIndex > 0) {
      issues.push({ type: 'paragraph_properties_not_first', part });
      break;
    }
  }

  for (const run of select('//w:r', document as unknown as Node) as Node[]) {
    const children = elementChildren(run);
    const rPrIndex = children.findIndex((child) => getLocalName(child) === 'rPr');
    if (rPrIndex > 0) {
      issues.push({ type: 'run_properties_not_first', part });
      break;
    }
  }

  for (const cell of select('//w:tc', document as unknown as Node) as Node[]) {
    const children = elementChildren(cell);
    const tcPrIndex = children.findIndex((child) => getLocalName(child) === 'tcPr');
    if (tcPrIndex > 0) {
      issues.push({ type: 'table_cell_properties_not_first', part });
      break;
    }
    if (!children.some((child) => getLocalName(child) === 'p')) {
      issues.push({ type: 'table_cell_missing_paragraph', part });
      break;
    }
  }

  return issues;
}

export async function validateDocxBuffer(input: Buffer): Promise<DocxValidationResult> {
  const zip = await JSZip.loadAsync(input);
  const issues: DocxValidationIssue[] = [];

  const names = new Set(Object.keys(zip.files));
  for (const part of REQUIRED_PARTS) {
    if (!names.has(part)) {
      issues.push({ type: 'missing_required_part', part });
    }
  }

  for (const filePath of Object.keys(zip.files)) {
    if (!/\.(xml|rels)$/i.test(filePath)) continue;
    const file = zip.file(filePath);
    if (!file) continue;
    try {
      const document = parseXml(await file.async('string'));
      const parserErrors = document.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        issues.push({
          type: 'invalid_xml',
          part: filePath,
          detail: parserErrors[0]?.textContent?.trim() ?? 'XML parser error',
        });
        continue;
      }

      if (/^word\/(document|header\d+|footer\d+)\.xml$/i.test(filePath)) {
        issues.push(...validateElementOrder(document, filePath));
      }
    } catch (error) {
      issues.push({
        type: 'invalid_xml',
        part: filePath,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    issueCount: issues.length,
    issues,
  };
}

function countOccurrences(text: string, find: string): number {
  if (!find) return 0;
  let count = 0;
  let index = text.indexOf(find);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(find, index + find.length);
  }
  return count;
}

function replaceTextInParagraph(paragraph: Node, find: string, replace: string): number {
  const textElements = select('.//w:t', paragraph as unknown as Node) as Element[];
  if (textElements.length === 0) return 0;

  const original = textElements.map((element) => element.textContent ?? '').join('');
  const replacements = countOccurrences(original, find);
  if (replacements === 0) return 0;

  const next = original.split(find).join(replace);
  textElements[0]!.textContent = next;
  for (let index = 1; index < textElements.length; index += 1) {
    textElements[index]!.textContent = '';
  }
  return replacements;
}

export async function replaceTextInDocxBuffer(input: Buffer, find: string, replace: string): Promise<DocxReplaceResult> {
  const zip = await JSZip.loadAsync(input);
  const changedParts = new Set<string>();
  let replacements = 0;

  for (const part of getDocumentParts(zip)) {
    const document = await readXml(zip, part);
    let partChanged = 0;
    for (const paragraph of select('//w:p', document as unknown as Node) as Node[]) {
      partChanged += replaceTextInParagraph(paragraph, find, replace);
    }
    if (partChanged > 0) {
      changedParts.add(part);
      replacements += partChanged;
      zip.file(part, serializeXml(document));
    }
  }

  return {
    buffer: Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })),
    replacements,
    changedParts: [...changedParts],
  };
}
