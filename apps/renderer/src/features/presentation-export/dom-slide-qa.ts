export type PresentationDomQaSeverity = 'error' | 'warning';

export type PresentationDomQaIssue = {
  severity: PresentationDomQaSeverity;
  slideId: string;
  code: 'slide-not-measurable' | 'element-out-of-bounds' | 'element-overlap' | 'bottom-safe-zone-risk' | 'page-badge-risk';
  message: string;
  elementId?: string;
  otherElementId?: string;
};

export type PresentationDomQaReport = {
  ok: boolean;
  issues: PresentationDomQaIssue[];
};

export type AuditRenderedDomSlidesOptions = {
  slideSelector?: string;
  includeWarnings?: boolean;
  overlapAreaThresholdPx?: number;
};

type MeasuredElement = {
  id: string;
  kind: string;
  rect: DOMRect;
};

const DEFAULT_SLIDE_SELECTOR = '[data-flazz-slide]';
const EXPORTABLE_SELECTOR = [
  '[data-pptx-text]',
  'img[data-pptx-image]',
  '[data-pptx-root-image]',
  '[data-pptx-shape]',
  'table[data-pptx-table]',
  '[data-pptx-decor]',
].join(',');

function getSlideId(slide: HTMLElement): string {
  return slide.dataset.flazzSlide || slide.id || 'unknown-slide';
}

function getElementKind(element: Element): string {
  if (element.hasAttribute('data-pptx-text')) return 'text';
  if (element.hasAttribute('data-pptx-root-image')) return 'root-image';
  if (element.hasAttribute('data-pptx-image')) return 'image';
  if (element.hasAttribute('data-pptx-shape')) return 'shape';
  if (element.hasAttribute('data-pptx-table')) return 'table';
  if (element.hasAttribute('data-pptx-decor')) return 'decor';
  return element.tagName.toLowerCase();
}

function getElementId(element: Element, index: number): string {
  const htmlElement = element as HTMLElement;
  return htmlElement.dataset.pptxId || htmlElement.id || `${getElementKind(element)}-${index + 1}`;
}

function isBackgroundLike(element: MeasuredElement): boolean {
  return element.kind === 'decor' || element.kind === 'root-image';
}

function intersectionArea(a: DOMRect, b: DOMRect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function isOutOfBounds(rect: DOMRect, container: DOMRect): boolean {
  const tolerance = 1;
  return (
    rect.left < container.left - tolerance ||
    rect.top < container.top - tolerance ||
    rect.right > container.right + tolerance ||
    rect.bottom > container.bottom + tolerance
  );
}

function measureElements(slide: HTMLElement): MeasuredElement[] {
  return Array.from(slide.querySelectorAll<HTMLElement>(EXPORTABLE_SELECTOR))
    .map((element, index) => ({
      id: getElementId(element, index),
      kind: getElementKind(element),
      rect: element.getBoundingClientRect(),
    }))
    .filter((element) => element.rect.width > 0 && element.rect.height > 0);
}

function auditSlide(
  slide: HTMLElement,
  issues: PresentationDomQaIssue[],
  options: Required<Pick<AuditRenderedDomSlidesOptions, 'includeWarnings' | 'overlapAreaThresholdPx'>>,
): void {
  const slideId = getSlideId(slide);
  const slideRect = slide.getBoundingClientRect();

  if (slideRect.width <= 0 || slideRect.height <= 0) {
    issues.push({
      severity: 'error',
      slideId,
      code: 'slide-not-measurable',
      message: 'Slide has no measurable DOM size.',
    });
    return;
  }

  const elements = measureElements(slide);
  for (const element of elements) {
    if (isOutOfBounds(element.rect, slideRect)) {
      issues.push({
        severity: 'error',
        slideId,
        code: 'element-out-of-bounds',
        elementId: element.id,
        message: `${element.id} extends outside the slide bounds.`,
      });
    }
  }

  for (let i = 0; i < elements.length; i++) {
    const current = elements[i];
    if (!current || isBackgroundLike(current)) continue;

    for (let j = i + 1; j < elements.length; j++) {
      const next = elements[j];
      if (!next || isBackgroundLike(next)) continue;

      const area = intersectionArea(current.rect, next.rect);
      if (area > options.overlapAreaThresholdPx) {
        issues.push({
          severity: 'error',
          slideId,
          code: 'element-overlap',
          elementId: current.id,
          otherElementId: next.id,
          message: `${current.id} overlaps ${next.id}.`,
        });
      }
    }
  }

  if (!options.includeWarnings) return;

  const bottomSafeZoneTop = slideRect.top + slideRect.height * 0.88;
  const pageBadgeZone = {
    left: slideRect.left + slideRect.width * 0.9,
    top: slideRect.top + slideRect.height * 0.88,
    right: slideRect.right,
    bottom: slideRect.bottom,
  };

  for (const element of elements) {
    if (isBackgroundLike(element)) continue;

    if (element.rect.bottom > bottomSafeZoneTop) {
      issues.push({
        severity: 'warning',
        slideId,
        code: 'bottom-safe-zone-risk',
        elementId: element.id,
        message: `${element.id} enters the bottom safe zone.`,
      });
    }

    const badgeOverlap = intersectionArea(element.rect, pageBadgeZone as DOMRect);
    if (badgeOverlap > 16) {
      issues.push({
        severity: 'warning',
        slideId,
        code: 'page-badge-risk',
        elementId: element.id,
        message: `${element.id} may collide with the page badge zone.`,
      });
    }
  }
}

export function auditRenderedDomSlides(options: AuditRenderedDomSlidesOptions = {}): PresentationDomQaReport {
  const slides = Array.from(document.querySelectorAll<HTMLElement>(options.slideSelector ?? DEFAULT_SLIDE_SELECTOR));
  const issues: PresentationDomQaIssue[] = [];
  const auditOptions = {
    includeWarnings: options.includeWarnings ?? true,
    overlapAreaThresholdPx: options.overlapAreaThresholdPx ?? 24,
  };

  for (const slide of slides) {
    auditSlide(slide, issues, auditOptions);
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}
