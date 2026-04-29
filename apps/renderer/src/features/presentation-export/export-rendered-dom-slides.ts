import type { PresentationDomExportResponse } from '@flazz/shared';
import { presentationExportIpc } from '@/services';
import { auditRenderedDomSlides, type PresentationDomQaReport } from './dom-slide-qa';
import { scanDomSlides, type ScanDomSlidesOptions } from './dom-slide-scanner';

export type ExportRenderedDomSlidesOptions = ScanDomSlidesOptions & {
  outputPath: string;
  title?: string;
  qa?: {
    enabled?: boolean;
    failOnErrors?: boolean;
    includeWarnings?: boolean;
  };
};

export async function exportRenderedDomSlidesToPptx(
  options: ExportRenderedDomSlidesOptions,
): Promise<PresentationDomExportResponse & { qa?: PresentationDomQaReport }> {
  const qa = options.qa?.enabled === false
    ? undefined
    : auditRenderedDomSlides({
      slideSelector: options.slideSelector,
      includeWarnings: options.qa?.includeWarnings ?? true,
    });

  if (qa && qa.ok === false && options.qa?.failOnErrors !== false) {
    const firstIssue = qa.issues.find((issue) => issue.severity === 'error');
    throw new Error(firstIssue?.message ?? 'Rendered presentation DOM failed export QA.');
  }

  const slides = await scanDomSlides(options);
  if (!slides.length) {
    throw new Error('No rendered presentation slides were found for DOM export.');
  }

  const response = await presentationExportIpc.exportDomPptx({
    outputPath: options.outputPath,
    title: options.title,
    slides,
  });

  return { ...response, qa };
}
