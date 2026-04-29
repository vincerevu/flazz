import type {
  PresentationDomExportElement,
  PresentationDomRootImage,
  PresentationDomScanResult,
  PresentationDomTableCell,
} from '@flazz/shared';
import { colorToHex, extractBackgroundImageUrl } from './css-variable-resolver';

type CaptureElementAsPng = (element: HTMLElement) => Promise<string>;

export type ScanDomSlidesOptions = {
  slideSelector?: string;
  captureElementAsPng?: CaptureElementAsPng;
};

const DEFAULT_SLIDE_SELECTOR = '[data-flazz-slide]';

function toPercent(value: number, total: number): number {
  return total === 0 ? 0 : (value / total) * 100;
}

function getRelativePosition(element: Element, slideRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  return {
    x: toPercent(rect.left - slideRect.left, slideRect.width),
    y: toPercent(rect.top - slideRect.top, slideRect.height),
    width: toPercent(rect.width, slideRect.width),
    height: toPercent(rect.height, slideRect.height),
  };
}

function normalizeCssColor(value: string): string | undefined {
  return colorToHex(value);
}

function cssFontSizeToPoints(value: string): number | undefined {
  const px = Number.parseFloat(value);
  if (!Number.isFinite(px) || px <= 0) return undefined;
  return Math.round(px * 0.75 * 10) / 10;
}

function mapTextAlign(value: string): 'left' | 'center' | 'right' | undefined {
  if (value === 'center' || value === 'right') return value;
  if (value === 'left' || value === 'start') return 'left';
  return undefined;
}

function scanTextElement(element: HTMLElement, slideRect: DOMRect): PresentationDomExportElement | null {
  const text = element.innerText?.trim();
  if (!text) return null;

  const style = getComputedStyle(element);
  return {
    type: 'text',
    id: element.dataset.pptxId,
    text,
    position: getRelativePosition(element, slideRect),
    style: {
      color: normalizeCssColor(style.color),
      fontFace: style.fontFamily.split(',')[0]?.replace(/["']/g, '').trim(),
      fontSize: cssFontSizeToPoints(style.fontSize),
      bold: Number.parseInt(style.fontWeight, 10) >= 600,
      italic: style.fontStyle === 'italic',
      underline: style.textDecorationLine.includes('underline'),
      align: mapTextAlign(style.textAlign),
    },
  };
}

async function scanImageElement(
  element: HTMLImageElement,
  slideRect: DOMRect,
  captureElementAsPng?: CaptureElementAsPng,
): Promise<PresentationDomExportElement | null> {
  const src = element.currentSrc || element.src;
  if (!src) return null;

  if (element.dataset.pptxCapture === 'true' && captureElementAsPng) {
    return {
      type: 'image',
      id: element.dataset.pptxId,
      src: await captureElementAsPng(element),
      alt: element.alt || undefined,
      position: getRelativePosition(element, slideRect),
    };
  }

  return {
    type: 'image',
    id: element.dataset.pptxId,
    src,
    alt: element.alt || undefined,
    position: getRelativePosition(element, slideRect),
  };
}

async function scanDecorElement(
  element: HTMLElement | SVGElement,
  slideRect: DOMRect,
  captureElementAsPng?: CaptureElementAsPng,
): Promise<PresentationDomExportElement | null> {
  if (!captureElementAsPng) return null;
  return {
    type: 'decor',
    id: (element as HTMLElement).dataset.pptxId,
    src: await captureElementAsPng(element as HTMLElement),
    decorType: (element as HTMLElement).dataset.pptxDecor,
    position: getRelativePosition(element, slideRect),
  };
}

function scanBackgroundRectElement(element: HTMLElement, slideRect: DOMRect): PresentationDomExportElement | null {
  const style = getComputedStyle(element);
  const fill = normalizeCssColor(style.backgroundColor);
  const line = normalizeCssColor(style.borderColor);
  const background = style.background && style.background !== 'none' ? style.background : undefined;

  if (!fill && !background && !line) return null;

  return {
    type: 'backgroundRect',
    id: element.dataset.pptxId,
    position: getRelativePosition(element, slideRect),
    style: {
      fill,
      line,
      lineWidth: Number.parseFloat(style.borderWidth) || undefined,
      radius: Number.parseFloat(style.borderRadius) || undefined,
      background,
    },
  };
}

function scanShapeElement(element: HTMLElement, slideRect: DOMRect): PresentationDomExportElement | null {
  const style = getComputedStyle(element);
  const fill = normalizeCssColor(style.backgroundColor);
  const line = normalizeCssColor(style.borderColor);

  if (!fill && !line) return null;

  const shape = element.dataset.pptxShape;
  return {
    type: 'shape',
    id: element.dataset.pptxId,
    shape: shape === 'ellipse' || shape === 'line' || shape === 'arrow' || shape === 'pill' || shape === 'parallelogram'
      ? shape
      : 'rect',
    position: getRelativePosition(element, slideRect),
    style: {
      fill,
      line,
      lineWidth: Number.parseFloat(style.borderWidth) || undefined,
      radius: Number.parseFloat(style.borderRadius) || undefined,
    },
  };
}

function scanTableElement(table: HTMLTableElement, slideRect: DOMRect): PresentationDomExportElement | null {
  const rows: PresentationDomTableCell[][] = [];
  for (const row of Array.from(table.rows)) {
    const cells: PresentationDomTableCell[] = [];
    for (const cell of Array.from(row.cells)) {
      const style = getComputedStyle(cell);
      cells.push({
        text: cell.innerText.trim(),
        isHeader: cell.tagName.toLowerCase() === 'th',
        colSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
        rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
        backgroundColor: normalizeCssColor(style.backgroundColor),
        style: {
          color: normalizeCssColor(style.color),
          fontFace: style.fontFamily.split(',')[0]?.replace(/["']/g, '').trim(),
          fontSize: cssFontSizeToPoints(style.fontSize),
          bold: Number.parseInt(style.fontWeight, 10) >= 600,
          italic: style.fontStyle === 'italic',
          underline: style.textDecorationLine.includes('underline'),
          align: mapTextAlign(style.textAlign),
        },
      });
    }
    if (cells.length) rows.push(cells);
  }

  if (!rows.length) return null;

  return {
    type: 'table',
    id: table.dataset.pptxId,
    position: getRelativePosition(table, slideRect),
    rows,
    headerRowCount: table.tHead?.rows.length,
  };
}

async function scanRootImage(
  slideElement: HTMLElement,
  slideRect: DOMRect,
  captureElementAsPng?: CaptureElementAsPng,
): Promise<PresentationDomRootImage | undefined> {
  const root = slideElement.querySelector<HTMLElement>('[data-pptx-root-image]');
  if (!root) return undefined;

  const img = root.matches('img') ? root as HTMLImageElement : root.querySelector('img');
  const originalSrc = img?.currentSrc || img?.src;
  const shouldCapture = root.dataset.pptxCapture === 'true' || root !== img;

  if (shouldCapture && captureElementAsPng) {
    return {
      src: await captureElementAsPng(root),
      originalSrc,
      isBase64: true,
      position: getRelativePosition(root, slideRect),
    };
  }

  if (!originalSrc) return undefined;
  return {
    src: originalSrc,
    originalSrc,
    position: getRelativePosition(root, slideRect),
  };
}

async function scanSlide(
  slideElement: HTMLElement,
  captureElementAsPng?: CaptureElementAsPng,
): Promise<PresentationDomScanResult> {
  const slideRect = slideElement.getBoundingClientRect();
  const style = getComputedStyle(slideElement);
  const elements: PresentationDomExportElement[] = [];
  const rootImage = await scanRootImage(slideElement, slideRect, captureElementAsPng);

  for (const bgElement of slideElement.querySelectorAll<HTMLElement>('[data-pptx-background-rect]')) {
    const scanned = scanBackgroundRectElement(bgElement, slideRect);
    if (scanned) elements.push(scanned);
  }

  for (const textElement of slideElement.querySelectorAll<HTMLElement>('[data-pptx-text]')) {
    const scanned = scanTextElement(textElement, slideRect);
    if (scanned) elements.push(scanned);
  }

  for (const imageElement of slideElement.querySelectorAll<HTMLImageElement>('img[data-pptx-image]')) {
    const scanned = await scanImageElement(imageElement, slideRect, captureElementAsPng);
    if (scanned) elements.push(scanned);
  }

  for (const shapeElement of slideElement.querySelectorAll<HTMLElement>('[data-pptx-shape]')) {
    const scanned = scanShapeElement(shapeElement, slideRect);
    if (scanned) elements.push(scanned);
  }

  for (const tableElement of slideElement.querySelectorAll<HTMLTableElement>('table[data-pptx-table]')) {
    const scanned = scanTableElement(tableElement, slideRect);
    if (scanned) elements.push(scanned);
  }

  for (const decorElement of slideElement.querySelectorAll<HTMLElement | SVGElement>('[data-pptx-decor], svg[data-pptx-decor]')) {
    const scanned = await scanDecorElement(decorElement, slideRect, captureElementAsPng);
    if (scanned) elements.push(scanned);
  }

  return {
    slideId: slideElement.dataset.flazzSlide ?? slideElement.id,
    width: slideRect.width,
    height: slideRect.height,
    backgroundColor: normalizeCssColor(style.backgroundColor),
    backgroundImageUrl: extractBackgroundImageUrl(slideElement),
    rootImage,
    elements,
  };
}

export async function scanDomSlides(options: ScanDomSlidesOptions = {}): Promise<PresentationDomScanResult[]> {
  const slideSelector = options.slideSelector ?? DEFAULT_SLIDE_SELECTOR;
  const slideElements = Array.from(document.querySelectorAll<HTMLElement>(slideSelector));

  const results: PresentationDomScanResult[] = [];
  for (const slideElement of slideElements) {
    results.push(await scanSlide(slideElement, options.captureElementAsPng));
  }
  return results;
}
