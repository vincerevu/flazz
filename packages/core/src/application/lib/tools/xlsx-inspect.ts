import path from 'node:path';
import * as XLSX from 'xlsx';

type Primitive = string | number | boolean | null;

type ColumnQualityIssue =
  | {
    type: 'null_values';
    column: string;
    count: number;
    pct: number;
  }
  | {
    type: 'mixed_type';
    column: string;
    types: string[];
  }
  | {
    type: 'year_as_float';
    column: string;
  };

type SheetQualityIssue =
  | ColumnQualityIssue
  | {
    type: 'duplicate_rows';
    count: number;
  };

export type SpreadsheetInspectionSheet = {
  name: string;
  shape: { rows: number; cols: number };
  columns: string[];
  dtypes: Record<string, string>;
  nullColumns: Record<string, { count: number; pct: number }>;
  preview: Array<Record<string, Primitive>>;
  stats: Record<string, { count: number; sum: number; min: number; max: number; mean: number }>;
  quality: SheetQualityIssue[];
};

export type SpreadsheetInspectionResult = {
  fileType: string;
  sheetNames: string[];
  sheets: SpreadsheetInspectionSheet[];
};

function normalizeFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsm') return 'xlsm';
  if (ext === '.csv') return 'csv';
  if (ext === '.tsv') return 'tsv';
  return 'xlsx';
}

function inferValueType(value: unknown): string {
  if (value == null || value === '') return 'empty';
  if (value instanceof Date) return 'date';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function toColumnName(value: unknown, index: number): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `Column ${index + 1}`;
}

function normalizeCellValue(value: unknown): Primitive {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function buildRowObject(columns: string[], row: unknown[]): Record<string, Primitive> {
  return Object.fromEntries(
    columns.map((column, index) => [column, normalizeCellValue(row[index])]),
  );
}

function computeNullColumns(columns: string[], rows: unknown[][]): Record<string, { count: number; pct: number }> {
  const result: Record<string, { count: number; pct: number }> = {};
  for (let index = 0; index < columns.length; index += 1) {
    const count = rows.reduce((total, row) => {
      const value = row[index];
      return total + (value == null || value === '' ? 1 : 0);
    }, 0);
    if (count > 0) {
      result[columns[index]!] = {
        count,
        pct: Number(((count / Math.max(rows.length, 1)) * 100).toFixed(1)),
      };
    }
  }
  return result;
}

function computeColumnDtypes(columns: string[], rows: unknown[][]): Record<string, string> {
  return Object.fromEntries(
    columns.map((column, index) => {
      const types = [...new Set(rows.map((row) => inferValueType(row[index])).filter((type) => type !== 'empty'))];
      if (types.length === 0) return [column, 'empty'];
      if (types.length === 1) return [column, types[0]];
      return [column, `mixed(${types.join(',')})`];
    }),
  );
}

function computeStats(columns: string[], rows: unknown[][]): Record<string, { count: number; sum: number; min: number; max: number; mean: number }> {
  const stats: Record<string, { count: number; sum: number; min: number; max: number; mean: number }> = {};
  for (let index = 0; index < columns.length; index += 1) {
    const numericValues = rows
      .map((row) => row[index])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (numericValues.length === 0) continue;
    const sum = numericValues.reduce((total, value) => total + value, 0);
    stats[columns[index]!] = {
      count: numericValues.length,
      sum,
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      mean: sum / numericValues.length,
    };
  }
  return stats;
}

function computeQuality(columns: string[], rows: unknown[][]): SheetQualityIssue[] {
  const quality: SheetQualityIssue[] = [];
  const nullColumns = computeNullColumns(columns, rows);
  for (const [column, info] of Object.entries(nullColumns)) {
    quality.push({ type: 'null_values', column, count: info.count, pct: info.pct });
  }

  const duplicateCount = rows.length - new Set(rows.map((row) => JSON.stringify(row.map((value) => normalizeCellValue(value))))).size;
  if (duplicateCount > 0) {
    quality.push({ type: 'duplicate_rows', count: duplicateCount });
  }

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index]!;
    const types = [...new Set(rows.map((row) => inferValueType(row[index])).filter((type) => type !== 'empty'))];
    if (types.length > 1) {
      quality.push({ type: 'mixed_type', column, types });
    }

    const name = column.toLowerCase();
    const numericValues = rows
      .map((row) => row[index])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if ((name.includes('year') || name.includes('yr') || name.includes('年')) &&
      numericValues.length > 0 &&
      numericValues.every((value) => value >= 1900 && value <= 2200 && !Number.isInteger(value))) {
      quality.push({ type: 'year_as_float', column });
    }
  }

  return quality;
}

function inspectSheet(name: string, worksheet: XLSX.WorkSheet): SpreadsheetInspectionSheet {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  }) as unknown[][];

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRow = rows[0] ?? [];
  const columns = Array.from({ length: width }, (_unused, index) => toColumnName(headerRow[index], index));
  const dataRows = rows.length > 1 ? rows.slice(1) : [];

  return {
    name,
    shape: { rows: dataRows.length, cols: columns.length },
    columns,
    dtypes: computeColumnDtypes(columns, dataRows),
    nullColumns: computeNullColumns(columns, dataRows),
    preview: dataRows.slice(0, 5).map((row) => buildRowObject(columns, row)),
    stats: computeStats(columns, dataRows),
    quality: computeQuality(columns, dataRows),
  };
}

export function inspectWorkbookBuffer(input: Buffer, workbookPath: string): SpreadsheetInspectionResult {
  const workbook = XLSX.read(input, {
    type: 'buffer',
    cellDates: true,
    raw: true,
  });

  const sheets = workbook.SheetNames.map((sheetName) => inspectSheet(sheetName, workbook.Sheets[sheetName]!));
  return {
    fileType: normalizeFileType(workbookPath),
    sheetNames: workbook.SheetNames,
    sheets,
  };
}
