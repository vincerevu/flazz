import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs/dist/exceljs.js';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { absToRelPosix, resolveWorkspacePath } from '../../../workspace/workspace.js';
import { WorkDir } from '../../../config/config.js';
import { validateWorkbookFormulas } from './xlsx-xml.js';
import { addColumnToWorkbook, insertRowIntoWorkbook, shiftRowsInWorkbook } from './xlsx-xml-edit.js';
import { inspectWorkbookBuffer } from './xlsx-inspect.js';
import { auditWorkbookStyles } from './xlsx-style-audit.js';

const SpreadsheetPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const SpreadsheetCell = z.union([
  SpreadsheetPrimitive,
  z.object({
    value: SpreadsheetPrimitive.optional(),
    formula: z.string().optional(),
    type: z.enum(['s', 'n', 'b', 'd']).optional(),
    numberFormat: z.string().optional(),
  }),
]);

const SpreadsheetSheetSchema = z.object({
  name: z.string().min(1).max(31),
  rows: z.array(z.array(SpreadsheetCell)),
  columnWidths: z.array(z.number().positive()).optional(),
  frozenRows: z.number().int().nonnegative().optional(),
  autoFilter: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
});

const ColumnRangeSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
}).refine((value) => value.end >= value.start, {
  message: 'end must be greater than or equal to start',
});

const InsertRowCellSchema = z.object({
  column: z.string().regex(/^[A-Za-z]+$/),
  value: SpreadsheetPrimitive,
  kind: z.enum(['text', 'number', 'formula']),
});

export type SpreadsheetCellInput = z.infer<typeof SpreadsheetCell>;
export type SpreadsheetSheetInput = z.infer<typeof SpreadsheetSheetSchema>;

function normalizeXlsxOutputPath(outputPath: string): string {
  const normalized = outputPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized.toLowerCase().endsWith('.xlsx') ? normalized : `${normalized}.xlsx`;
}

function isObjectCell(cell: SpreadsheetCellInput): cell is Exclude<SpreadsheetCellInput, string | number | boolean | null> {
  return typeof cell === 'object' && cell !== null && !Array.isArray(cell);
}

function toAoAValue(cell: SpreadsheetCellInput): string | number | boolean | Date | null {
  if (!isObjectCell(cell)) return cell;
  if (cell.type === 'd' && typeof cell.value === 'string') {
    return new Date(cell.value);
  }
  return cell.value ?? null;
}

function getCellFormula(cell: SpreadsheetCellInput): string | undefined {
  return isObjectCell(cell) && cell.formula ? (cell.formula.startsWith('=') ? cell.formula.slice(1) : cell.formula) : undefined;
}

function applyStructuredCells(
  worksheet: XLSX.WorkSheet,
  rows: SpreadsheetSheetInput['rows'],
): void {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const cell = row[colIndex]!;
      if (!isObjectCell(cell)) continue;

      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const worksheetCell = worksheet[address] ?? { t: 'z' as const };

      if (cell.formula) {
        worksheetCell.f = cell.formula.startsWith('=') ? cell.formula.slice(1) : cell.formula;
        if (!cell.type && worksheetCell.t === 'z') {
          worksheetCell.t = 'n';
        }
        if (worksheetCell.v === undefined) {
          worksheetCell.v = 0;
        }
      }

      if (cell.value !== undefined && cell.value !== null) {
        if (cell.type === 'd' && typeof cell.value === 'string') {
          worksheetCell.v = new Date(cell.value);
          worksheetCell.t = 'd';
        } else {
          worksheetCell.v = cell.value;
          if (cell.type) {
            worksheetCell.t = cell.type;
          }
        }
      }

      if (cell.numberFormat) {
        worksheetCell.z = cell.numberFormat;
      }

      worksheet[address] = worksheetCell;
    }
  }
}

function buildWorksheetForInspection(sheet: SpreadsheetSheetInput): XLSX.WorkSheet {
  const aoa = sheet.rows.map((row) => row.map((cell) => toAoAValue(cell)));
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  applyStructuredCells(worksheet, sheet.rows);

  if (sheet.columnWidths?.length) {
    worksheet['!cols'] = sheet.columnWidths.map((width) => ({ wch: width }));
  }

  if (sheet.frozenRows && sheet.frozenRows > 0) {
    worksheet['!freeze'] = { xSplit: 0, ySplit: sheet.frozenRows, topLeftCell: `A${sheet.frozenRows + 1}` };
  }

  if (sheet.autoFilter) {
    worksheet['!autofilter'] = { ref: `${sheet.autoFilter.from}:${sheet.autoFilter.to}` };
  }

  return worksheet;
}

async function buildWorkbookBufferWithExcelJs(sheets: SpreadsheetSheetInput[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Flazz';
  workbook.lastModifiedBy = 'Flazz';
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: sheet.frozenRows ? [{ state: 'frozen', ySplit: sheet.frozenRows }] : undefined,
    });

    for (const row of sheet.rows) {
      const worksheetRow = worksheet.addRow(
        row.map((cell) => {
          const formula = getCellFormula(cell);
          if (formula) {
            const objectCell = isObjectCell(cell) ? cell : null;
            return {
              formula,
              result: objectCell?.value ?? 0,
            };
          }
          return toAoAValue(cell);
        }),
      );

      row.forEach((cell, index) => {
        if (!isObjectCell(cell)) return;
        const worksheetCell = worksheetRow.getCell(index + 1);
        if (cell.numberFormat) {
          worksheetCell.numFmt = cell.numberFormat;
        }
      });
    }

    if (sheet.columnWidths?.length) {
      worksheet.columns = sheet.columnWidths.map((width) => ({ width }));
    }

    if (sheet.autoFilter) {
      worksheet.autoFilter = `${sheet.autoFilter.from}:${sheet.autoFilter.to}`;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export const spreadsheetTools = {
  renderWorkbookXlsx: {
    description:
      'Render a new .xlsx workbook from structured sheet data using Flazz\'s built-in Node spreadsheet stack. ' +
      'Use this for new spreadsheet artifacts, generated reports, exports, and tabular workbooks that do not require preserving advanced Excel features from an existing file. ' +
      'Do not use pip install or ad hoc spreadsheet generators when this tool can satisfy the request.',
    inputSchema: z.object({
      outputPath: z.string().min(1).describe('Workspace-relative output .xlsx path. If no .xlsx suffix is provided it will be added automatically.'),
      sheets: z.array(SpreadsheetSheetSchema).min(1).describe('Workbook sheet definitions in order.'),
    }),
    execute: async ({
      outputPath,
      sheets,
    }: {
      outputPath: string;
      sheets: SpreadsheetSheetInput[];
    }) => {
      const normalizedOutputPath = normalizeXlsxOutputPath(outputPath);

      if (normalizedOutputPath.toLowerCase().startsWith('memory/')) {
        return {
          success: false,
          error: 'Do not write spreadsheet artifacts into memory/. Use output/ or exports/ instead.',
        };
      }

      const resolvedOutputPath = resolveWorkspacePath(normalizedOutputPath);
      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
      const buffer = await buildWorkbookBufferWithExcelJs(sheets);
      await fs.writeFile(resolvedOutputPath, buffer);

      return {
        success: true,
        path: absToRelPosix(resolvedOutputPath) ?? path.relative(WorkDir, resolvedOutputPath),
        bytes: buffer.byteLength,
        sheetCount: sheets.length,
      };
    },
  },
  validateWorkbookXlsx: {
    description:
      'Validate an existing .xlsx workbook using Flazz\'s built-in Node OOXML validator. ' +
      'Use this to check formula-bearing workbooks for cached Excel errors and broken cross-sheet references without requiring Python or LibreOffice.',
    inputSchema: z.object({
      workbookPath: z.string().min(1).describe('Workspace-relative path to an existing .xlsx workbook.'),
    }),
    execute: async ({
      workbookPath,
    }: {
      workbookPath: string;
    }) => {
      const resolvedWorkbookPath = resolveWorkspacePath(workbookPath.replace(/\\/g, '/'));
      const workbookBuffer = await fs.readFile(resolvedWorkbookPath);
      const validation = await validateWorkbookFormulas(workbookBuffer);

      return {
        success: true,
        path: absToRelPosix(resolvedWorkbookPath) ?? path.relative(WorkDir, resolvedWorkbookPath),
        ...validation,
      };
    },
  },
  inspectWorkbookXlsx: {
    description:
      'Inspect an existing spreadsheet file using Flazz\'s built-in Node spreadsheet reader. ' +
      'Use this to discover sheet names, columns, previews, simple stats, and data-quality issues for .xlsx, .xlsm, .csv, or .tsv files without using Python.',
    inputSchema: z.object({
      workbookPath: z.string().min(1).describe('Workspace-relative path to an existing spreadsheet file.'),
    }),
    execute: async ({
      workbookPath,
    }: {
      workbookPath: string;
    }) => {
      const resolvedWorkbookPath = resolveWorkspacePath(workbookPath.replace(/\\/g, '/'));
      const workbookBuffer = await fs.readFile(resolvedWorkbookPath);
      const inspection = inspectWorkbookBuffer(workbookBuffer, resolvedWorkbookPath);

      return {
        success: true,
        path: absToRelPosix(resolvedWorkbookPath) ?? path.relative(WorkDir, resolvedWorkbookPath),
        ...inspection,
      };
    },
  },
  auditWorkbookStylesXlsx: {
    description:
      'Audit workbook style integrity using Flazz\'s built-in Node OOXML style checker. ' +
      'Use this to catch broken style counts, invalid style indices, malformed fills, and likely format mistakes in an existing .xlsx workbook.',
    inputSchema: z.object({
      workbookPath: z.string().min(1).describe('Workspace-relative path to an existing .xlsx workbook.'),
    }),
    execute: async ({
      workbookPath,
    }: {
      workbookPath: string;
    }) => {
      const resolvedWorkbookPath = resolveWorkspacePath(workbookPath.replace(/\\/g, '/'));
      const workbookBuffer = await fs.readFile(resolvedWorkbookPath);
      const audit = await auditWorkbookStyles(workbookBuffer);

      return {
        success: true,
        path: absToRelPosix(resolvedWorkbookPath) ?? path.relative(WorkDir, resolvedWorkbookPath),
        ...audit,
      };
    },
  },
  addWorkbookColumnXlsx: {
    description:
      'Add a new column to an existing .xlsx workbook using Flazz\'s XML-safe Node path. ' +
      'Use this when editing an existing workbook and you need to preserve the rest of the workbook while adding a header, formulas, totals, or number formats to one sheet.',
    inputSchema: z.object({
      workbookPath: z.string().min(1).describe('Workspace-relative path to an existing .xlsx workbook.'),
      outputPath: z.string().min(1).describe('Workspace-relative output .xlsx path. If no .xlsx suffix is provided it will be added automatically.'),
      sheetName: z.string().min(1),
      column: z.string().regex(/^[A-Za-z]+$/),
      header: z.string().optional(),
      formula: z.string().optional(),
      formulaRows: ColumnRangeSchema.optional(),
      totalRow: z.number().int().positive().optional(),
      totalFormula: z.string().optional(),
      numberFormat: z.string().optional(),
      borderRow: z.number().int().positive().optional(),
      borderStyle: z.enum(['thin', 'medium', 'thick']).optional(),
    }),
    execute: async (input: {
      workbookPath: string;
      outputPath: string;
      sheetName: string;
      column: string;
      header?: string;
      formula?: string;
      formulaRows?: { start: number; end: number };
      totalRow?: number;
      totalFormula?: string;
      numberFormat?: string;
      borderRow?: number;
      borderStyle?: 'thin' | 'medium' | 'thick';
    }) => {
      const normalizedOutputPath = normalizeXlsxOutputPath(input.outputPath);
      if (normalizedOutputPath.toLowerCase().startsWith('memory/')) {
        return {
          success: false,
          error: 'Do not write spreadsheet artifacts into memory/. Use output/ or exports/ instead.',
        };
      }

      const resolvedWorkbookPath = resolveWorkspacePath(input.workbookPath.replace(/\\/g, '/'));
      const resolvedOutputPath = resolveWorkspacePath(normalizedOutputPath);
      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

      const buffer = await fs.readFile(resolvedWorkbookPath);
      const edited = await addColumnToWorkbook(buffer, {
        sheetName: input.sheetName,
        column: input.column,
        header: input.header,
        formula: input.formula,
        formulaRows: input.formulaRows,
        totalRow: input.totalRow,
        totalFormula: input.totalFormula,
        numberFormat: input.numberFormat,
        borderRow: input.borderRow,
        borderStyle: input.borderStyle,
      });
      await fs.writeFile(resolvedOutputPath, edited);

      const validation = await validateWorkbookFormulas(edited);
      return {
        success: true,
        path: absToRelPosix(resolvedOutputPath) ?? path.relative(WorkDir, resolvedOutputPath),
        bytes: edited.byteLength,
        validation,
      };
    },
  },
  shiftWorkbookRowsXlsx: {
    description:
      'Shift worksheet row references in an existing .xlsx workbook using Flazz\'s XML-safe Node path. ' +
      'Use this when a workflow needs to open up or collapse row space while preserving formulas, ranges, tables, and related references across the workbook.',
    inputSchema: z.object({
      workbookPath: z.string().min(1).describe('Workspace-relative path to an existing .xlsx workbook.'),
      outputPath: z.string().min(1).describe('Workspace-relative output .xlsx path. If no .xlsx suffix is provided it will be added automatically.'),
      atRow: z.number().int().positive(),
      delta: z.number().int().refine((value) => value !== 0, { message: 'delta must not be 0' }),
    }),
    execute: async (input: {
      workbookPath: string;
      outputPath: string;
      atRow: number;
      delta: number;
    }) => {
      const normalizedOutputPath = normalizeXlsxOutputPath(input.outputPath);
      if (normalizedOutputPath.toLowerCase().startsWith('memory/')) {
        return {
          success: false,
          error: 'Do not write spreadsheet artifacts into memory/. Use output/ or exports/ instead.',
        };
      }

      const resolvedWorkbookPath = resolveWorkspacePath(input.workbookPath.replace(/\\/g, '/'));
      const resolvedOutputPath = resolveWorkspacePath(normalizedOutputPath);
      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

      const buffer = await fs.readFile(resolvedWorkbookPath);
      const edited = await shiftRowsInWorkbook(buffer, input.atRow, input.delta);
      await fs.writeFile(resolvedOutputPath, edited);

      const validation = await validateWorkbookFormulas(edited);
      return {
        success: true,
        path: absToRelPosix(resolvedOutputPath) ?? path.relative(WorkDir, resolvedOutputPath),
        bytes: edited.byteLength,
        validation,
      };
    },
  },
  insertWorkbookRowXlsx: {
    description:
      'Insert a new row into an existing .xlsx workbook using Flazz\'s XML-safe Node path. ' +
      'Use this when updating an existing workbook, preserving the workbook while shifting downstream references and formulas safely.',
    inputSchema: z.object({
      workbookPath: z.string().min(1).describe('Workspace-relative path to an existing .xlsx workbook.'),
      outputPath: z.string().min(1).describe('Workspace-relative output .xlsx path. If no .xlsx suffix is provided it will be added automatically.'),
      sheetName: z.string().min(1),
      rowNumber: z.number().int().positive(),
      copyStyleFrom: z.number().int().positive().optional(),
      cells: z.array(InsertRowCellSchema).min(1),
    }),
    execute: async (input: {
      workbookPath: string;
      outputPath: string;
      sheetName: string;
      rowNumber: number;
      copyStyleFrom?: number;
      cells: Array<{ column: string; value: string | number | boolean | null; kind: 'text' | 'number' | 'formula' }>;
    }) => {
      const normalizedOutputPath = normalizeXlsxOutputPath(input.outputPath);
      if (normalizedOutputPath.toLowerCase().startsWith('memory/')) {
        return {
          success: false,
          error: 'Do not write spreadsheet artifacts into memory/. Use output/ or exports/ instead.',
        };
      }

      const resolvedWorkbookPath = resolveWorkspacePath(input.workbookPath.replace(/\\/g, '/'));
      const resolvedOutputPath = resolveWorkspacePath(normalizedOutputPath);
      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

      const buffer = await fs.readFile(resolvedWorkbookPath);
      const edited = await insertRowIntoWorkbook(buffer, {
        sheetName: input.sheetName,
        rowNumber: input.rowNumber,
        copyStyleFrom: input.copyStyleFrom,
        cells: input.cells.map((cell) => ({ ...cell, column: cell.column.toUpperCase() })),
      });
      await fs.writeFile(resolvedOutputPath, edited);

      const validation = await validateWorkbookFormulas(edited);
      return {
        success: true,
        path: absToRelPosix(resolvedOutputPath) ?? path.relative(WorkDir, resolvedOutputPath),
        bytes: edited.byteLength,
        validation,
      };
    },
  },
};

export const __spreadsheetPrivate__ = {
  normalizeXlsxOutputPath,
  buildWorksheetForInspection,
  buildWorkbookBufferWithExcelJs,
};
