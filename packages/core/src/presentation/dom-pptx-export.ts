import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  PresentationDomExportElement,
  PresentationDomExportRequest,
  PresentationDomExportResponse,
  PresentationDomPosition,
  PresentationDomScanResult,
} from '@flazz/shared';
import { writeFile } from '../workspace/workspace.js';

const SLIDE_WIDTH_INCHES = 10;
const SLIDE_HEIGHT_INCHES = 5.625;
const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs') as new () => PptxPresentation;
type PptxPresentation = {
  layout: string;
  author: string;
  subject: string;
  title: string;
  company: string;
  addSlide(): PptxSlide;
  write(options: { outputType: 'arraybuffer' }): Promise<ArrayBuffer>;
};
type PptxSlide = {
  background?: { color: string };
  addText(text: string, options: Record<string, unknown>): void;
  addText(text: Array<{ text: string; options?: Record<string, unknown> }>, options: Record<string, unknown>): void;
  addImage(options: Record<string, unknown>): void;
  addShape(shape: string, options: Record<string, unknown>): void;
  addTable(rows: unknown[][], options: Record<string, unknown>): void;
};

function assertPptxOutputPath(outputPath: string): void {
  const normalized = outputPath.replace(/\\/g, '/').toLowerCase();
  if (!normalized.endsWith('.pptx')) {
    throw new Error('DOM presentation export outputPath must end with .pptx');
  }
  if (normalized.startsWith('memory/')) {
    throw new Error('Generated presentation exports must not be written inside memory/');
  }
}

function normalizeColor(color?: string): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (!trimmed || trimmed === 'transparent') return undefined;
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.slice(1).toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();

  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(trimmed);
  if (!rgb) return undefined;

  return [rgb[1], rgb[2], rgb[3]]
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function extractGradientColor(background?: string): string | undefined {
  if (!background || !background.includes('gradient')) return undefined;

  const colorMatch = background.match(/#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/);
  if (!colorMatch?.[0]) return undefined;
  return normalizeColor(colorMatch[0]);
}

function scalePosition(position: PresentationDomPosition) {
  const scaled = {
    x: (position.x / 100) * SLIDE_WIDTH_INCHES,
    y: (position.y / 100) * SLIDE_HEIGHT_INCHES,
    w: (position.width / 100) * SLIDE_WIDTH_INCHES,
    h: (position.height / 100) * SLIDE_HEIGHT_INCHES,
  };

  const originalW = scaled.w;
  const originalH = scaled.h;

  if (position.aspectRatio && position.aspectRatio > 0) {
    if (position.aspectRatioBase === 'height') {
      scaled.w = scaled.h * position.aspectRatio;
      if (scaled.w > originalW) {
        scaled.w = originalW;
        scaled.h = scaled.w / position.aspectRatio;
      }
    } else {
      scaled.h = scaled.w / position.aspectRatio;
      if (scaled.h > originalH) {
        scaled.h = originalH;
        scaled.w = scaled.h * position.aspectRatio;
      }
    }
  }

  return scaled;
}

function addText(slide: PptxSlide, element: Extract<PresentationDomExportElement, { type: 'text' }>): void {
  const pos = scalePosition(element.position);
  const style = element.style ?? {};
  slide.addText(element.text, {
    ...pos,
    fontFace: style.fontFace,
    fontSize: style.fontSize,
    color: normalizeColor(style.color) ?? '111111',
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    align: style.align,
    valign: style.valign,
    fit: 'shrink',
    margin: 0,
    breakLine: false,
  });
}

function addImage(slide: PptxSlide, element: Extract<PresentationDomExportElement, { type: 'image' }>): void {
  const pos = scalePosition(element.position);
  if (element.src.startsWith('data:')) {
    slide.addImage({ data: element.src, ...pos });
    return;
  }
  slide.addImage({ path: element.src, ...pos });
}

function addShape(slide: PptxSlide, element: Extract<PresentationDomExportElement, { type: 'shape' }>): void {
  const pos = scalePosition(element.position);
  const style = element.style ?? {};
  const fill = normalizeColor(style.fill);
  const line = normalizeColor(style.line);
  const shapeType = element.shape === 'ellipse'
    ? 'ellipse'
    : element.shape === 'line'
      ? 'line'
      : element.shape === 'arrow'
        ? 'rightArrow'
        : element.shape === 'pill'
          ? 'roundRect'
        : element.shape === 'parallelogram'
          ? 'parallelogram'
      : 'rect';

  slide.addShape(shapeType, {
    ...pos,
    fill: fill ? { color: fill } : { color: 'FFFFFF', transparency: 100 },
    line: line ? { color: line, width: style.lineWidth ?? 1 } : { color: fill ?? 'FFFFFF', transparency: 100 },
    radius: style.radius,
  });
}

function addTable(slide: PptxSlide, element: Extract<PresentationDomExportElement, { type: 'table' }>): void {
  const pos = scalePosition(element.position);
  const rows = element.rows.map((row) => row.map((cell) => ({
    text: cell.text,
    options: {
      bold: cell.isHeader || cell.style?.bold,
      italic: cell.style?.italic,
      color: normalizeColor(cell.style?.color) ?? '111111',
      fill: cell.backgroundColor ? { color: normalizeColor(cell.backgroundColor) ?? 'FFFFFF' } : undefined,
      fontFace: cell.style?.fontFace,
      fontSize: cell.style?.fontSize ?? 10,
      align: cell.style?.align ?? 'left',
      margin: 0.04,
      colspan: cell.colSpan,
      rowspan: cell.rowSpan,
    },
  })));

  slide.addTable(rows, {
    ...pos,
    border: { type: 'solid', color: 'D9D9D9', pt: 0.5 },
    fontSize: 10,
    color: '111111',
  });
}

function addDecor(slide: PptxSlide, element: Extract<PresentationDomExportElement, { type: 'decor' }>): void {
  const pos = scalePosition(element.position);
  if (element.src.startsWith('data:')) {
    slide.addImage({ data: element.src, ...pos });
    return;
  }
  slide.addImage({ path: element.src, ...pos });
}

function addBackgroundRect(
  slide: PptxSlide,
  element: Extract<PresentationDomExportElement, { type: 'backgroundRect' }>,
): void {
  const pos = scalePosition(element.position);
  const style = element.style ?? {};
  const fill = normalizeColor(style.fill) ?? extractGradientColor(style.background) ?? normalizeColor(style.background) ?? 'FFFFFF';
  const line = normalizeColor(style.line);
  const shapeType = style.radius && style.radius > 0 ? 'roundRect' : 'rect';

  slide.addShape(shapeType, {
    ...pos,
    fill: { color: fill },
    line: line ? { color: line, width: style.lineWidth ?? 1 } : { color: fill, transparency: 100 },
    radius: style.radius,
  });
}

function addElement(slide: PptxSlide, element: PresentationDomExportElement): void {
  switch (element.type) {
    case 'text':
      addText(slide, element);
      break;
    case 'image':
      addImage(slide, element);
      break;
    case 'shape':
      addShape(slide, element);
      break;
    case 'table':
      addTable(slide, element);
      break;
    case 'decor':
      addDecor(slide, element);
      break;
    case 'backgroundRect':
      addBackgroundRect(slide, element);
      break;
  }
}

function addSlide(pres: PptxPresentation, scan: PresentationDomScanResult): void {
  const slide = pres.addSlide();
  const bg = normalizeColor(scan.backgroundColor);
  if (bg) {
    slide.background = { color: bg };
  }

  if (scan.backgroundImageUrl) {
    slide.background = { color: bg ?? 'FFFFFF' };
    slide.addImage({
      path: scan.backgroundImageUrl,
      x: 0,
      y: 0,
      w: SLIDE_WIDTH_INCHES,
      h: SLIDE_HEIGHT_INCHES,
    });
  }

  if (scan.rootImage?.src) {
    const pos = scalePosition(scan.rootImage.position);
    if (scan.rootImage.src.startsWith('data:')) {
      slide.addImage({ data: scan.rootImage.src, ...pos });
    } else {
      slide.addImage({ path: scan.rootImage.src, ...pos });
    }
  }

  for (const element of scan.elements) {
    addElement(slide, element);
  }
}

export async function exportDomPresentationToPptx(
  request: PresentationDomExportRequest,
): Promise<PresentationDomExportResponse> {
  assertPptxOutputPath(request.outputPath);

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'Flazz';
  pres.subject = request.title ?? path.basename(request.outputPath, '.pptx');
  pres.title = request.title ?? pres.subject;
  pres.company = 'Flazz';

  for (const scan of request.slides) {
    addSlide(pres, scan);
  }

  const data = await pres.write({ outputType: 'arraybuffer' });
  const base64 = Buffer.from(data as ArrayBuffer).toString('base64');
  await writeFile(request.outputPath, base64, {
    encoding: 'base64',
    atomic: true,
    mkdirp: true,
  });

  return {
    path: request.outputPath,
    slideCount: request.slides.length,
  };
}
