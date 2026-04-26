import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: false,
  trimValues: false,
});

const EXCEL_ERROR_VALUES = new Set(['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#NULL!', '#NUM!', '#N/A']);

export type XlsxFormulaIssue =
  | {
    type: 'error_value';
    sheet: string;
    cell: string;
    formula: string | null;
    error: string;
  }
  | {
    type: 'broken_sheet_ref';
    sheet: string;
    cell: string;
    formula: string;
    missingSheet: string;
    validSheets: string[];
  }
  | {
    type: 'malformed_error_cell';
    sheet: string;
    cell: string;
    formula: string | null;
  }
  | {
    type: 'broken_named_range';
    sheet: string;
    cell: string;
    formula: string;
    missingName: string;
    validNames: string[];
  }
  | {
    type: 'shared_formula_missing_primary';
    sheet: string;
    cell: string;
    sharedIndex: string;
  };

export type XlsxFormulaValidationResult = {
  sheetNames: string[];
  formulaCount: number;
  issueCount: number;
  issues: XlsxFormulaIssue[];
};

type WorkbookArchive = {
  zip: JSZip;
  readText(path: string): Promise<string>;
};

type WorkbookSheetRef = {
  name: string;
  target: string;
};

type ParsedCell = {
  address: string;
  type?: string;
  formula: string | null;
  value: string | null;
  formulaType?: string;
  formulaSharedIndex?: string;
  formulaRef?: string;
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getTextContent(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && '#text' in value && typeof (value as { ['#text']?: unknown })['#text'] === 'string') {
    return (value as { ['#text']: string })['#text'];
  }
  return null;
}

function extractReferencedSheets(formula: string): string[] {
  const refs = new Set<string>();
  const quoted = /'((?:[^']|'')+)'!/g;
  const plain = /\b([A-Za-z0-9_.]+)!/g;

  for (const match of formula.matchAll(quoted)) {
    refs.add(match[1]!.replace(/''/g, "'"));
  }
  for (const match of formula.matchAll(plain)) {
    const name = match[1]!;
    if (!/^[A-Z]{1,3}\d+$/i.test(name)) {
      refs.add(name);
    }
  }

  return [...refs];
}

const BUILTIN_FUNCTIONS = new Set([
  'ABS', 'AND', 'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS', 'CEILING', 'CHOOSE', 'COUNTA', 'COUNTIF', 'COUNTIFS', 'COUNT',
  'DATE', 'EDATE', 'EOMONTH', 'FALSE', 'FILTER', 'FIND', 'FLOOR', 'IF', 'IFERROR', 'IFNA', 'IFS', 'INDEX', 'INDIRECT',
  'INT', 'IRR', 'ISBLANK', 'ISERROR', 'ISNA', 'ISNUMBER', 'LARGE', 'LEFT', 'LEN', 'LOOKUP', 'LOWER', 'MATCH', 'MAX',
  'MID', 'MIN', 'MOD', 'MONTH', 'NETWORKDAYS', 'NOT', 'NOW', 'NPV', 'OFFSET', 'OR', 'PMT', 'PV', 'RAND', 'RANK',
  'RIGHT', 'ROUND', 'ROUNDDOWN', 'ROUNDUP', 'ROW', 'ROWS', 'SEARCH', 'SMALL', 'SORT', 'SQRT', 'SUBSTITUTE', 'SUM',
  'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'TEXT', 'TODAY', 'TRANSPOSE', 'TRIM', 'TRUE', 'UNIQUE', 'UPPER', 'VALUE', 'VLOOKUP',
  'HLOOKUP', 'XLOOKUP', 'XMATCH', 'XNPV', 'XIRR', 'YEAR', 'YEARFRAC',
]);

function extractReferencedNames(formula: string): string[] {
  const refs = new Set<string>();
  const formulaWithoutSheetRefs = formula
    .replace(/'[^']*(?:''[^']*)*'![A-Z$0-9:]+/gi, '')
    .replace(/\b[A-Za-z_][A-Za-z0-9_.]*![A-Z$0-9:]+/gi, '');

  for (const match of formulaWithoutSheetRefs.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{2,})\b(?!\s*\()/g)) {
    const name = match[1]!;
    if (/^[A-Z]{1,3}\d+$/i.test(name)) continue;
    if (BUILTIN_FUNCTIONS.has(name.toUpperCase())) continue;
    refs.add(name);
  }
  return [...refs];
}

async function openWorkbookArchive(input: Buffer): Promise<WorkbookArchive> {
  const zip = await JSZip.loadAsync(input);
  return {
    zip,
    async readText(filePath: string) {
      const file = zip.file(filePath);
      if (!file) {
        throw new Error(`Missing workbook entry: ${filePath}`);
      }
      return file.async('string');
    },
  };
}

async function getWorkbookSheetRefs(archive: WorkbookArchive): Promise<WorkbookSheetRef[]> {
  const workbookXml = parser.parse(await archive.readText('xl/workbook.xml')) as {
    workbook?: {
      sheets?: {
        sheet?: Array<{ ['@_name']?: string; ['@_r:id']?: string }> | { ['@_name']?: string; ['@_r:id']?: string };
      };
    };
  };
  const relsXml = parser.parse(await archive.readText('xl/_rels/workbook.xml.rels')) as {
    Relationships?: {
      Relationship?: Array<{ ['@_Id']?: string; ['@_Target']?: string }> | { ['@_Id']?: string; ['@_Target']?: string };
    };
  };

  const relMap = new Map<string, string>();
  for (const rel of asArray(relsXml.Relationships?.Relationship)) {
    if (rel['@_Id'] && rel['@_Target']) {
      relMap.set(rel['@_Id'], rel['@_Target']);
    }
  }

  return asArray(workbookXml.workbook?.sheets?.sheet)
    .map((sheet) => {
      const name = sheet['@_name'];
      const rid = sheet['@_r:id'];
      const target = rid ? relMap.get(rid) : null;
      if (!name || !target) return null;
      return {
        name,
        target: `xl/${target.replace(/^\/+/, '')}`,
      };
    })
    .filter((sheet): sheet is WorkbookSheetRef => sheet !== null);
}

async function getWorkbookDefinedNames(archive: WorkbookArchive): Promise<string[]> {
  const workbookXml = parser.parse(await archive.readText('xl/workbook.xml')) as {
    workbook?: {
      definedNames?: {
        definedName?: Array<{ ['@_name']?: string }> | { ['@_name']?: string };
      };
    };
  };

  return asArray(workbookXml.workbook?.definedNames?.definedName)
    .map((entry) => entry['@_name'])
    .filter((name): name is string => Boolean(name));
}

async function getWorksheetCells(archive: WorkbookArchive, targetPath: string): Promise<ParsedCell[]> {
  const worksheetXml = parser.parse(await archive.readText(targetPath)) as {
    worksheet?: {
      sheetData?: {
        row?: Array<{
          c?: Array<{
            ['@_r']?: string;
            ['@_t']?: string;
            f?: unknown;
            v?: unknown;
          }> | {
            ['@_r']?: string;
            ['@_t']?: string;
            f?: unknown;
            v?: unknown;
          };
        }> | {
          c?: Array<{
            ['@_r']?: string;
            ['@_t']?: string;
            f?: unknown;
            v?: unknown;
          }> | {
            ['@_r']?: string;
            ['@_t']?: string;
            f?: unknown;
            v?: unknown;
          };
        };
      };
    };
  };

  const rows = asArray(worksheetXml.worksheet?.sheetData?.row);
  return rows.flatMap((row) =>
    asArray(row.c).map((cell) => {
      const formulaNode = cell.f && typeof cell.f === 'object' && !Array.isArray(cell.f)
        ? cell.f as { ['@_t']?: string; ['@_si']?: string; ['@_ref']?: string; ['#text']?: string }
        : null;

      return {
        address: cell['@_r'] ?? '',
        type: cell['@_t'],
        formula: getTextContent(cell.f),
        value: getTextContent(cell.v),
        formulaType: formulaNode?.['@_t'],
        formulaSharedIndex: formulaNode?.['@_si'],
        formulaRef: formulaNode?.['@_ref'],
      };
    }),
  );
}

export async function validateWorkbookFormulas(input: Buffer): Promise<XlsxFormulaValidationResult> {
  const archive = await openWorkbookArchive(input);
  const sheets = await getWorkbookSheetRefs(archive);
  const sheetNames = sheets.map((sheet) => sheet.name);
  const definedNames = await getWorkbookDefinedNames(archive);
  const issues: XlsxFormulaIssue[] = [];
  let formulaCount = 0;

  for (const sheet of sheets) {
    const cells = await getWorksheetCells(archive, sheet.target);
    const sharedPrimary = new Map<string, string>();

    for (const cell of cells) {
      if (cell.formulaType === 'shared' && cell.formulaSharedIndex && cell.formulaRef && cell.formula) {
        sharedPrimary.set(cell.formulaSharedIndex, cell.address);
      }
    }

    for (const cell of cells) {
      if (!cell.address) continue;

      if (cell.formula) {
        if (!(cell.formulaType === 'shared' && !cell.formulaRef)) {
          formulaCount += 1;
        }
        for (const refSheet of extractReferencedSheets(cell.formula)) {
          if (!sheetNames.includes(refSheet)) {
            issues.push({
              type: 'broken_sheet_ref',
              sheet: sheet.name,
              cell: cell.address,
              formula: cell.formula,
              missingSheet: refSheet,
              validSheets: sheetNames,
            });
          }
        }

        for (const refName of extractReferencedNames(cell.formula)) {
          if (!definedNames.includes(refName)) {
            issues.push({
              type: 'broken_named_range',
              sheet: sheet.name,
              cell: cell.address,
              formula: cell.formula,
              missingName: refName,
              validNames: definedNames,
            });
          }
        }
      }

      if (cell.formulaType === 'shared' && cell.formulaSharedIndex && !cell.formula && !sharedPrimary.has(cell.formulaSharedIndex)) {
        issues.push({
          type: 'shared_formula_missing_primary',
          sheet: sheet.name,
          cell: cell.address,
          sharedIndex: cell.formulaSharedIndex,
        });
      }

      if (cell.type === 'e') {
        if (!cell.value) {
          issues.push({
            type: 'malformed_error_cell',
            sheet: sheet.name,
            cell: cell.address,
            formula: cell.formula,
          });
          continue;
        }

        if (EXCEL_ERROR_VALUES.has(cell.value)) {
          issues.push({
            type: 'error_value',
            sheet: sheet.name,
            cell: cell.address,
            formula: cell.formula,
            error: cell.value,
          });
        }
      }
    }
  }

  return {
    sheetNames,
    formulaCount,
    issueCount: issues.length,
    issues,
  };
}

export const __xlsxXmlPrivate__ = {
  extractReferencedSheets,
  extractReferencedNames,
  getTextContent,
};
