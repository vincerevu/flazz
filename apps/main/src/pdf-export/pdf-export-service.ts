import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { pathToFileURL } from 'node:url';
import type { PdfExportService, RenderHtmlToPdfInput, RenderHtmlToPdfResult } from '@flazz/core/dist/application/lib/tools/pdf-tools.js';

async function createHiddenPrintWindow(title?: string): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    show: false,
    title: title ?? 'Flazz PDF Export',
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  });

  window.setMenuBarVisibility(false);
  return window;
}

export class ElectronPdfExportService implements PdfExportService {
  async renderHtmlToPdf({
    html,
    outputPath,
    baseDir,
    title,
    pageSize = 'A4',
  }: RenderHtmlToPdfInput): Promise<RenderHtmlToPdfResult> {
    let window: BrowserWindow | null = null;

    try {
      window = await createHiddenPrintWindow(title);
      const baseURLForDataURL = pathToFileURL(
        baseDir.endsWith(path.sep) ? baseDir : `${baseDir}${path.sep}`,
      ).toString();

      await window.webContents.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        { baseURLForDataURL },
      );

      await window.webContents.executeJavaScript(
        'document.fonts ? document.fonts.ready.then(() => true) : true',
        true,
      ).catch(() => true);

      const pdfBuffer = await window.webContents.printToPDF({
        printBackground: true,
        pageSize,
        preferCSSPageSize: true,
      });

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, pdfBuffer);

      return {
        success: true,
        path: outputPath,
        bytes: pdfBuffer.byteLength,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown PDF export error',
      };
    } finally {
      if (window && !window.isDestroyed()) {
        window.destroy();
      }
    }
  }
}
