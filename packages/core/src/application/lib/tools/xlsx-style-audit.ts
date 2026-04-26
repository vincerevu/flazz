import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: false,
  trimValues: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

type CountMismatchIssue = {
  type: 'count_mismatch';
  element: 'numFmts' | 'fonts' | 'fills' | 'cellXfs';
  declared: number;
  actual: number;
};

type MissingFillsIssue = {
  type: 'missing_required_fills' | 'fills_0_corrupted' | 'fills_1_corrupted';
  detail: string;
};

type StyleIndexIssue = {
  type: 'style_index_out_of_range';
  sheet: string;
  cell: string;
  styleIndex: number;
  styleCount: number;
};

type PercentIssue = {
  type: 'percentage_value_gt_1';
  sheet: string;
  cell: string;
  value: number;
};

type YearFormatIssue = {
  type: 'year_format_violation';
  sheet: string;
  cell: string;
  value: number;
  numFmtId: number;
};

export type XlsxStyleIssue = CountMismatchIssue | MissingFillsIssue | StyleIndexIssue | PercentIssue | YearFormatIssue;

export type XlsxStyleAuditResult = {
  issueCount: number;
  issues: XlsxStyleIssue[];
  summary: {
    numFmtCount: number;
    fontCount: number;
    fillCount: number;
    styleCount: number;
  };
};

type SheetRef = {
  name: string;
  target: string;
};

function getTextContent(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    const text = (value as { ['#text']?: unknown })['#text'];
    return typeof text === 'string' ? text : null;
  }
  return null;
}

async function readXml(zip: JSZip, filePath: string): Promise<Record<string, unknown>> {
  const file = zip.file(filePath);
  if (!file) {
    throw new Error(`Missing workbook entry: ${filePath}`);
  }
  return parser.parse(await file.async('string')) as Record<string, unknown>;
}

async function getSheetRefs(zip: JSZip): Promise<SheetRef[]> {
  const workbookXml = await readXml(zip, 'xl/workbook.xml') as {
    workbook?: {
      sheets?: { sheet?: Array<{ ['@_name']?: string; ['@_r:id']?: string }> | { ['@_name']?: string; ['@_r:id']?: string } };
    };
  };
  const relsXml = await readXml(zip, 'xl/_rels/workbook.xml.rels') as {
    Relationships?: { Relationship?: Array<{ ['@_Id']?: string; ['@_Target']?: string }> | { ['@_Id']?: string; ['@_Target']?: string } };
  };

  const relMap = new Map<string, string>();
  for (const rel of asArray(relsXml.Relationships?.Relationship)) {
    if (rel['@_Id'] && rel['@_Target']) {
      relMap.set(rel['@_Id'], `xl/${rel['@_Target'].replace(/^\/+/, '')}`);
    }
  }

  return asArray(workbookXml.workbook?.sheets?.sheet)
    .map((sheet) => {
      const name = sheet['@_name'];
      const rid = sheet['@_r:id'];
      const target = rid ? relMap.get(rid) : null;
      if (!name || !target) return null;
      return { name, target };
    })
    .filter((sheet): sheet is SheetRef => sheet !== null);
}

function isPercentFormat(numFmtId: number, code: string | undefined): boolean {
  if (numFmtId === 9 || numFmtId === 10) return true;
  return typeof code === 'string' && code.includes('%');
}

function isCommaYearFormat(numFmtId: number, code: string | undefined): boolean {
  if (numFmtId === 3 || numFmtId === 4) return true;
  return typeof code === 'string' && code.includes('#,##');
}

export async function auditWorkbookStyles(input: Buffer): Promise<XlsxStyleAuditResult> {
  const zip = await JSZip.loadAsync(input);
  const stylesXml = await readXml(zip, 'xl/styles.xml') as {
    styleSheet?: {
      numFmts?: { ['@_count']?: string; numFmt?: Array<{ ['@_numFmtId']?: string; ['@_formatCode']?: string }> | { ['@_numFmtId']?: string; ['@_formatCode']?: string } };
      fonts?: { ['@_count']?: string; font?: unknown[] | unknown };
      fills?: { ['@_count']?: string; fill?: Array<{ patternFill?: { ['@_patternType']?: string } }> | { patternFill?: { ['@_patternType']?: string } } };
      cellXfs?: { ['@_count']?: string; xf?: Array<{ ['@_numFmtId']?: string }> | { ['@_numFmtId']?: string } };
    };
  };

  const styleSheet = stylesXml.styleSheet ?? {};
  const numFmts = asArray(styleSheet.numFmts?.numFmt);
  const fonts = asArray(styleSheet.fonts?.font);
  const fills = asArray(styleSheet.fills?.fill);
  const cellXfs = asArray(styleSheet.cellXfs?.xf);

  const numFmtMap = new Map<number, string>();
  for (const numFmt of numFmts) {
    const id = Number(numFmt['@_numFmtId'] ?? 0);
    if (Number.isFinite(id)) {
      numFmtMap.set(id, String(numFmt['@_formatCode'] ?? ''));
    }
  }

  const issues: XlsxStyleIssue[] = [];
  const counts = [
    ['numFmts', Number(styleSheet.numFmts?.['@_count'] ?? 0), numFmts.length],
    ['fonts', Number(styleSheet.fonts?.['@_count'] ?? 0), fonts.length],
    ['fills', Number(styleSheet.fills?.['@_count'] ?? 0), fills.length],
    ['cellXfs', Number(styleSheet.cellXfs?.['@_count'] ?? 0), cellXfs.length],
  ] as const;

  for (const [element, declared, actual] of counts) {
    if (declared !== actual) {
      issues.push({ type: 'count_mismatch', element, declared, actual });
    }
  }

  if (fills.length < 2) {
    issues.push({
      type: 'missing_required_fills',
      detail: 'fills[0] (none) and fills[1] (gray125) are required by OOXML.',
    });
  } else {
    const firstPattern = fills[0]?.patternFill?.['@_patternType'] ?? '';
    const secondPattern = fills[1]?.patternFill?.['@_patternType'] ?? '';
    if (firstPattern !== 'none') {
      issues.push({ type: 'fills_0_corrupted', detail: `fills[0] patternType='${firstPattern}'` });
    }
    if (secondPattern !== 'gray125') {
      issues.push({ type: 'fills_1_corrupted', detail: `fills[1] patternType='${secondPattern}'` });
    }
  }

  const sheets = await getSheetRefs(zip);
  for (const sheet of sheets) {
    const worksheetXml = await readXml(zip, sheet.target) as {
      worksheet?: {
        sheetData?: {
          row?: Array<{ c?: Array<{ ['@_r']?: string; ['@_s']?: string; v?: unknown }> | { ['@_r']?: string; ['@_s']?: string; v?: unknown } }> | { c?: Array<{ ['@_r']?: string; ['@_s']?: string; v?: unknown }> | { ['@_r']?: string; ['@_s']?: string; v?: unknown } };
        };
      };
    };

    const rows = asArray(worksheetXml.worksheet?.sheetData?.row);
    for (const row of rows) {
      for (const cell of asArray(row.c)) {
        const address = String(cell['@_r'] ?? '');
        const styleIndex = Number(cell['@_s'] ?? 0);
        if (!address) continue;
        if (styleIndex >= cellXfs.length) {
          issues.push({
            type: 'style_index_out_of_range',
            sheet: sheet.name,
            cell: address,
            styleIndex,
            styleCount: cellXfs.length,
          });
          continue;
        }

        const numFmtId = Number(cellXfs[styleIndex]?.['@_numFmtId'] ?? 0);
        const value = Number(getTextContent(cell.v));
        if (Number.isFinite(value)) {
          if (isPercentFormat(numFmtId, numFmtMap.get(numFmtId)) && value > 1) {
            issues.push({
              type: 'percentage_value_gt_1',
              sheet: sheet.name,
              cell: address,
              value,
            });
          }

          if (value >= 1900 && value <= 2200 && Number.isInteger(value) && isCommaYearFormat(numFmtId, numFmtMap.get(numFmtId))) {
            issues.push({
              type: 'year_format_violation',
              sheet: sheet.name,
              cell: address,
              value,
              numFmtId,
            });
          }
        }
      }
    }
  }

  return {
    issueCount: issues.length,
    issues,
    summary: {
      numFmtCount: numFmts.length,
      fontCount: fonts.length,
      fillCount: fills.length,
      styleCount: cellXfs.length,
    },
  };
}
