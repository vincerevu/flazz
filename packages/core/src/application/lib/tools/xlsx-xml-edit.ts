import JSZip from 'jszip';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: false,
  trimValues: false,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: false,
  format: true,
  suppressEmptyNode: false,
});

type XmlDocument = Record<string, unknown>;

type SheetRef = {
  name: string;
  target: string;
};

type AddColumnOptions = {
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
};

type InsertRowCellValue = {
  column: string;
  value: string | number | boolean | null;
  kind: 'text' | 'number' | 'formula';
};

type InsertRowOptions = {
  sheetName: string;
  rowNumber: number;
  copyStyleFrom?: number;
  cells: InsertRowCellValue[];
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function buildXml(document: XmlDocument): string {
  const xml = builder.build(document);
  return xml.startsWith('<?xml') ? `${xml}\n` : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}\n`;
}

async function parseXmlFromZip(zip: JSZip, filePath: string): Promise<XmlDocument> {
  const file = zip.file(filePath);
  if (!file) {
    throw new Error(`Missing workbook entry: ${filePath}`);
  }
  return parser.parse(await file.async('string')) as XmlDocument;
}

async function getSheetRefs(zip: JSZip): Promise<SheetRef[]> {
  const workbookXml = await parseXmlFromZip(zip, 'xl/workbook.xml') as {
    workbook?: {
      sheets?: { sheet?: Array<{ ['@_name']?: string; ['@_r:id']?: string }> | { ['@_name']?: string; ['@_r:id']?: string } };
    };
  };
  const relsXml = await parseXmlFromZip(zip, 'xl/_rels/workbook.xml.rels') as {
    Relationships?: {
      Relationship?: Array<{ ['@_Id']?: string; ['@_Target']?: string }> | { ['@_Id']?: string; ['@_Target']?: string };
    };
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

function columnToNumber(column: string): number {
  let value = 0;
  for (const char of column.toUpperCase()) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value;
}

function numberToColumn(value: number): string {
  let result = '';
  let current = value;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function normalizeFormula(formula: string): string {
  return formula.startsWith('=') ? formula.slice(1) : formula;
}

function splitCellRef(ref: string): { column: string; row: number } {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!match) {
    throw new Error(`Invalid cell reference: ${ref}`);
  }
  return { column: match[1]!.toUpperCase(), row: Number(match[2]) };
}

function shiftRefsInSegment(segment: string, atRow: number, delta: number): string {
  return segment.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, dollarCol: string, col: string, dollarRow: string, rowText: string) => {
    const row = Number(rowText);
    const nextRow = row >= atRow ? Math.max(1, row + delta) : row;
    return `${dollarCol}${col}${dollarRow}${nextRow}`;
  });
}

function shiftFormulaRows(formula: string, atRow: number, delta: number): string {
  const segments = formula.split(/('[^']*(?:''[^']*)*')/g);
  return segments.map((segment, index) => (index % 2 === 1 ? segment : shiftRefsInSegment(segment, atRow, delta))).join('');
}

function shiftSqref(sqref: string, atRow: number, delta: number): string {
  return sqref
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (!part.includes(':')) return shiftFormulaRows(part, atRow, delta);
      const [left, right] = part.split(':', 2);
      return `${shiftFormulaRows(left!, atRow, delta)}:${shiftFormulaRows(right!, atRow, delta)}`;
    })
    .join(' ');
}

function getWorksheetRows(document: XmlDocument): Array<Record<string, unknown>> {
  const worksheet = (document.worksheet ?? {}) as {
    sheetData?: { row?: Array<Record<string, unknown>> | Record<string, unknown> };
  };
  const sheetData = worksheet.sheetData ?? {};
  return asArray(sheetData.row);
}

function setWorksheetRows(document: XmlDocument, rows: Array<Record<string, unknown>>): void {
  const worksheet = (document.worksheet ?? {}) as {
    sheetData?: { row?: Array<Record<string, unknown>> | Record<string, unknown> };
  };
  if (!worksheet.sheetData) worksheet.sheetData = {};
  worksheet.sheetData.row = rows;
  document.worksheet = worksheet;
}

function getCellStyleIndex(document: XmlDocument, column: string, rowNumber: number): number {
  for (const row of getWorksheetRows(document)) {
    if (Number(row['@_r']) !== rowNumber) continue;
    for (const cell of asArray(row.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined)) {
      if (cell['@_r'] === `${column}${rowNumber}`) {
        return Number(cell['@_s'] ?? 0);
      }
    }
  }
  return 0;
}

function ensureCellXfsArray(stylesDoc: XmlDocument): Array<Record<string, unknown>> {
  const styleSheet = (stylesDoc.styleSheet ?? {}) as {
    cellXfs?: { xf?: Array<Record<string, unknown>> | Record<string, unknown>; ['@_count']?: string };
    numFmts?: { numFmt?: Array<Record<string, unknown>> | Record<string, unknown>; ['@_count']?: string };
    borders?: { border?: Array<Record<string, unknown>> | Record<string, unknown>; ['@_count']?: string };
  };

  if (!styleSheet.cellXfs) {
    styleSheet.cellXfs = { '@_count': '0', xf: [] };
  }
  styleSheet.cellXfs.xf = asArray(styleSheet.cellXfs.xf);
  stylesDoc.styleSheet = styleSheet;
  return styleSheet.cellXfs.xf as Array<Record<string, unknown>>;
}

function ensureNumFmtStyle(stylesDoc: XmlDocument, referenceStyleIndex: number, numberFormat: string): number {
  const styleSheet = (stylesDoc.styleSheet ?? {}) as {
    numFmts?: { numFmt?: Array<Record<string, unknown>> | Record<string, unknown>; ['@_count']?: string };
  };
  if (!styleSheet.numFmts) {
    styleSheet.numFmts = { '@_count': '0', numFmt: [] };
  }
  styleSheet.numFmts.numFmt = asArray(styleSheet.numFmts.numFmt);

  const numFmts = styleSheet.numFmts.numFmt as Array<Record<string, unknown>>;
  const existing = numFmts.find((entry) => entry['@_formatCode'] === numberFormat);
  let numFmtId: number;
  if (existing) {
    numFmtId = Number(existing['@_numFmtId']);
  } else {
    numFmtId = Math.max(163, ...numFmts.map((entry) => Number(entry['@_numFmtId'] ?? 0))) + 1;
    numFmts.push({ '@_numFmtId': String(numFmtId), '@_formatCode': numberFormat });
    styleSheet.numFmts['@_count'] = String(numFmts.length);
  }

  const cellXfs = ensureCellXfsArray(stylesDoc);
  const reference = { ...cellXfs[Math.min(referenceStyleIndex, Math.max(0, cellXfs.length - 1))] };
  const existingStyleIndex = cellXfs.findIndex((xf) =>
    Number(xf['@_numFmtId'] ?? 0) === numFmtId &&
    String(xf['@_fontId'] ?? '0') === String(reference['@_fontId'] ?? '0') &&
    String(xf['@_fillId'] ?? '0') === String(reference['@_fillId'] ?? '0') &&
    String(xf['@_borderId'] ?? '0') === String(reference['@_borderId'] ?? '0'),
  );

  if (existingStyleIndex >= 0) {
    stylesDoc.styleSheet = styleSheet;
    return existingStyleIndex;
  }

  reference['@_numFmtId'] = String(numFmtId);
  reference['@_applyNumberFormat'] = '1';
  cellXfs.push(reference);
  ((stylesDoc.styleSheet as { cellXfs?: { ['@_count']?: string } }).cellXfs ??= {})['@_count'] = String(cellXfs.length);
  stylesDoc.styleSheet = styleSheet;
  return cellXfs.length - 1;
}

function ensureBorderStyle(stylesDoc: XmlDocument, borderStyle: 'thin' | 'medium' | 'thick', styleIndices: number[]): Map<number, number> {
  const styleSheet = (stylesDoc.styleSheet ?? {}) as {
    borders?: { border?: Array<Record<string, unknown>> | Record<string, unknown>; ['@_count']?: string };
  };
  if (!styleSheet.borders) {
    styleSheet.borders = { '@_count': '0', border: [] };
  }
  styleSheet.borders.border = asArray(styleSheet.borders.border);
  const borders = styleSheet.borders.border as Array<Record<string, unknown>>;
  borders.push({
    left: '',
    right: '',
    top: { '@_style': borderStyle },
    bottom: '',
    diagonal: '',
  });
  styleSheet.borders['@_count'] = String(borders.length);
  const borderId = borders.length - 1;

  const styleMap = new Map<number, number>();
  const cellXfs = ensureCellXfsArray(stylesDoc);
  for (const styleIndex of styleIndices) {
    const reference = { ...cellXfs[Math.min(styleIndex, Math.max(0, cellXfs.length - 1))] };
    reference['@_borderId'] = String(borderId);
    reference['@_applyBorder'] = '1';
    cellXfs.push(reference);
    styleMap.set(styleIndex, cellXfs.length - 1);
  }
  ((stylesDoc.styleSheet as { cellXfs?: { ['@_count']?: string } }).cellXfs ??= {})['@_count'] = String(cellXfs.length);
  stylesDoc.styleSheet = styleSheet;
  return styleMap;
}

function updateWorksheetDimension(document: XmlDocument, targetColumn: string, targetRow: number): void {
  const worksheet = (document.worksheet ?? {}) as { dimension?: { ['@_ref']?: string } };
  const rows = getWorksheetRows(document);
  const lastRow = Math.max(targetRow, ...rows.map((row) => Number(row['@_r'] ?? 0)));
  let lastColNumber = columnToNumber(targetColumn);
  for (const row of rows) {
    for (const cell of asArray(row.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined)) {
      const ref = String(cell['@_r'] ?? '');
      if (!ref) continue;
      const { column } = splitCellRef(ref);
      lastColNumber = Math.max(lastColNumber, columnToNumber(column));
    }
  }
  worksheet.dimension = { '@_ref': `A1:${numberToColumn(lastColNumber)}${Math.max(1, lastRow)}` };
  document.worksheet = worksheet;
}

function sortRowCells(row: Record<string, unknown>): void {
  const cells = asArray(row.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
  cells.sort((left, right) => columnToNumber(splitCellRef(String(left['@_r'])).column) - columnToNumber(splitCellRef(String(right['@_r'])).column));
  row.c = cells;
  if (cells.length === 0) {
    delete row['@_spans'];
    return;
  }
  const firstColumn = columnToNumber(splitCellRef(String(cells[0]?.['@_r'] ?? 'A1')).column);
  const lastColumn = columnToNumber(splitCellRef(String(cells[cells.length - 1]?.['@_r'] ?? 'A1')).column);
  row['@_spans'] = `${firstColumn}:${lastColumn}`;
}

function createCell(ref: string, value: string | number | boolean | null, kind: 'text' | 'number' | 'formula', styleIndex?: number): Record<string, unknown> {
  const cell: Record<string, unknown> = { '@_r': ref };
  if (styleIndex !== undefined) {
    cell['@_s'] = String(styleIndex);
  }

  if (kind === 'formula') {
    cell.f = normalizeFormula(String(value ?? ''));
    cell.v = '0';
    return cell;
  }

  if (kind === 'text') {
    cell['@_t'] = 'str';
    cell.v = value == null ? '' : String(value);
    return cell;
  }

  if (typeof value === 'boolean') {
    cell['@_t'] = 'b';
    cell.v = value ? 1 : 0;
    return cell;
  }

  if (value !== null) {
    cell.v = value;
  }
  return cell;
}

async function updateZipEntry(zip: JSZip, filePath: string, updater: (xml: XmlDocument) => void): Promise<void> {
  const document = await parseXmlFromZip(zip, filePath);
  updater(document);
  zip.file(filePath, buildXml(document));
}

function applyShiftToWorksheet(document: XmlDocument, atRow: number, delta: number): void {
  const worksheet = (document.worksheet ?? {}) as Record<string, unknown>;
  const rows = getWorksheetRows(document).map((row) => ({ ...row }));

  for (const row of rows) {
    const currentRow = Number(row['@_r'] ?? 0);
    if (currentRow >= atRow) {
      row['@_r'] = String(Math.max(1, currentRow + delta));
    }
    const cells = asArray(row.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((cell) => ({ ...cell }));
    for (const cell of cells) {
      if (cell['@_r']) {
        cell['@_r'] = shiftFormulaRows(String(cell['@_r']), atRow, delta);
      }
      if (typeof cell.f === 'string') {
        cell.f = shiftFormulaRows(cell.f, atRow, delta);
      }
    }
    row.c = cells;
    sortRowCells(row);
  }

  rows.sort((left, right) => Number(left['@_r'] ?? 0) - Number(right['@_r'] ?? 0));
  setWorksheetRows(document, rows);

  if (worksheet.dimension && typeof (worksheet.dimension as { ['@_ref']?: unknown })['@_ref'] === 'string') {
    (worksheet.dimension as { ['@_ref']?: string })['@_ref'] = shiftSqref((worksheet.dimension as { ['@_ref']: string })['@_ref'], atRow, delta);
  }

  for (const mergeCell of asArray(((worksheet.mergeCells as { mergeCell?: Record<string, unknown> | Array<Record<string, unknown>> } | undefined)?.mergeCell))) {
    if (typeof mergeCell['@_ref'] === 'string') mergeCell['@_ref'] = shiftSqref(mergeCell['@_ref'], atRow, delta);
  }
  for (const conditionalFormatting of asArray(worksheet.conditionalFormatting as Record<string, unknown> | Array<Record<string, unknown>> | undefined)) {
    if (typeof conditionalFormatting['@_sqref'] === 'string') conditionalFormatting['@_sqref'] = shiftSqref(conditionalFormatting['@_sqref'], atRow, delta);
  }
  for (const dataValidation of asArray(((worksheet.dataValidations as { dataValidation?: Record<string, unknown> | Array<Record<string, unknown>> } | undefined)?.dataValidation))) {
    if (typeof dataValidation['@_sqref'] === 'string') dataValidation['@_sqref'] = shiftSqref(dataValidation['@_sqref'], atRow, delta);
  }
  if (worksheet.autoFilter && typeof (worksheet.autoFilter as { ['@_ref']?: unknown })['@_ref'] === 'string') {
    (worksheet.autoFilter as { ['@_ref']?: string })['@_ref'] = shiftSqref((worksheet.autoFilter as { ['@_ref']: string })['@_ref'], atRow, delta);
  }

  document.worksheet = worksheet;
}

async function shiftWorkbookRows(zip: JSZip, atRow: number, delta: number): Promise<void> {
  for (const filePath of Object.keys(zip.files)) {
    if (filePath.startsWith('xl/worksheets/') && filePath.endsWith('.xml')) {
      await updateZipEntry(zip, filePath, (document) => applyShiftToWorksheet(document, atRow, delta));
    } else if (filePath.startsWith('xl/tables/') && filePath.endsWith('.xml')) {
      await updateZipEntry(zip, filePath, (document) => {
        const table = (document.table ?? {}) as { ['@_ref']?: string };
        if (table['@_ref']) table['@_ref'] = shiftSqref(table['@_ref'], atRow, delta);
        document.table = table;
      });
    } else if (filePath.startsWith('xl/pivotCaches/') && filePath.endsWith('.xml')) {
      await updateZipEntry(zip, filePath, (document) => {
        const root = Object.values(document).find((value) => value && typeof value === 'object') as Record<string, unknown> | undefined;
        if (!root) return;
        const cacheSource = root.cacheSource as Record<string, unknown> | undefined;
        const worksheetSource = cacheSource?.worksheetSource as Record<string, unknown> | undefined;
        if (worksheetSource?.['@_ref']) {
          worksheetSource['@_ref'] = shiftSqref(String(worksheetSource['@_ref']), atRow, delta);
        }
      });
    } else if (filePath.startsWith('xl/charts/') && filePath.endsWith('.xml')) {
      const file = zip.file(filePath);
      if (!file) continue;
      const content = await file.async('string');
      const next = content.replace(/(<(?:[a-z]+:)?f>)([^<]+)(<\/(?:[a-z]+:)?f>)/g, (_match, open, formulaBody, close) => `${open}${shiftFormulaRows(formulaBody, atRow, delta)}${close}`);
      if (next !== content) {
        zip.file(filePath, next);
      }
    }
  }
}

export async function shiftRowsInWorkbook(input: Buffer, atRow: number, delta: number): Promise<Buffer> {
  const zip = await JSZip.loadAsync(input);
  await shiftWorkbookRows(zip, atRow, delta);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

export async function addColumnToWorkbook(input: Buffer, options: AddColumnOptions): Promise<Buffer> {
  const zip = await JSZip.loadAsync(input);
  const sheetRefs = await getSheetRefs(zip);
  const targetSheet = sheetRefs.find((sheet) => sheet.name === options.sheetName);
  if (!targetSheet) {
    throw new Error(`Sheet not found: ${options.sheetName}`);
  }

  const stylesDoc = await parseXmlFromZip(zip, 'xl/styles.xml');
  await updateZipEntry(zip, targetSheet.target, (document) => {
    const column = options.column.toUpperCase();
    const previousColumn = numberToColumn(Math.max(1, columnToNumber(column) - 1));
    const rows = getWorksheetRows(document).map((row) => ({ ...row }));
    const rowMap = new Map<number, Record<string, unknown>>(rows.map((row) => [Number(row['@_r'] ?? 0), row]));

    const headerStyle = options.header ? getCellStyleIndex(document, previousColumn, 1) : undefined;
    const dataStyleBase = options.formulaRows ? getCellStyleIndex(document, previousColumn, options.formulaRows.start) : 0;
    const totalStyleBase = options.totalRow ? getCellStyleIndex(document, previousColumn, options.totalRow) : dataStyleBase;
    const dataStyle = options.numberFormat ? ensureNumFmtStyle(stylesDoc, dataStyleBase, options.numberFormat) : dataStyleBase;
    const totalStyle = options.numberFormat ? ensureNumFmtStyle(stylesDoc, totalStyleBase, options.numberFormat) : totalStyleBase;

    if (options.header) {
      const headerRow = rowMap.get(1) ?? { '@_r': '1', c: [] };
      const headerCells = asArray(headerRow.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
      headerCells.push(createCell(`${column}1`, options.header, 'text', headerStyle));
      headerRow.c = headerCells;
      sortRowCells(headerRow);
      rowMap.set(1, headerRow);
    }

    if (options.formula && options.formulaRows) {
      for (let rowNumber = options.formulaRows.start; rowNumber <= options.formulaRows.end; rowNumber += 1) {
        const row = rowMap.get(rowNumber) ?? { '@_r': String(rowNumber), c: [] };
        const cells = asArray(row.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
        cells.push(createCell(`${column}${rowNumber}`, options.formula.replaceAll('{row}', String(rowNumber)), 'formula', dataStyle));
        row.c = cells;
        sortRowCells(row);
        rowMap.set(rowNumber, row);
      }
    }

    if (options.totalRow && options.totalFormula) {
      const totalRow = rowMap.get(options.totalRow) ?? { '@_r': String(options.totalRow), c: [] };
      const totalCells = asArray(totalRow.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
      totalCells.push(createCell(`${column}${options.totalRow}`, options.totalFormula.replaceAll('{row}', String(options.totalRow)), 'formula', totalStyle));
      totalRow.c = totalCells;
      sortRowCells(totalRow);
      rowMap.set(options.totalRow, totalRow);
    }

    const nextRows = [...rowMap.values()].sort((left, right) => Number(left['@_r'] ?? 0) - Number(right['@_r'] ?? 0));
    setWorksheetRows(document, nextRows);

    const worksheet = (document.worksheet ?? {}) as Record<string, unknown>;
    if (worksheet.cols) {
      const colsContainer = worksheet.cols as ({ col?: Record<string, unknown> | Array<Record<string, unknown>> } | Array<Record<string, unknown>>);
      const cols = Array.isArray(colsContainer) ? colsContainer : asArray(colsContainer.col);
      const newColumnNumber = columnToNumber(column);
      const covered = cols.some((entry) => newColumnNumber >= Number(entry['@_min'] ?? 0) && newColumnNumber <= Number(entry['@_max'] ?? 0));
      if (!covered) {
        const prevColumnNumber = columnToNumber(previousColumn);
        const template = cols.find((entry) => prevColumnNumber >= Number(entry['@_min'] ?? 0) && prevColumnNumber <= Number(entry['@_max'] ?? 0));
        if (template) {
          cols.push({
            ...template,
            '@_min': String(newColumnNumber),
            '@_max': String(newColumnNumber),
          });
        }
        if (Array.isArray(colsContainer)) {
          worksheet.cols = cols;
        } else {
          colsContainer.col = cols;
          worksheet.cols = colsContainer;
        }
      }
    }

    if (options.borderRow) {
      const row = rowMap.get(options.borderRow);
      if (row) {
        const uniqueStyles = [...new Set(asArray(row.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((cell) => Number(cell['@_s'] ?? 0)))];
        const remapped = ensureBorderStyle(stylesDoc, options.borderStyle ?? 'medium', uniqueStyles);
        for (const cell of asArray(row.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined)) {
          const currentStyle = Number(cell['@_s'] ?? 0);
          if (remapped.has(currentStyle)) {
            cell['@_s'] = String(remapped.get(currentStyle)!);
          }
        }
      }
    }

    updateWorksheetDimension(document, column, Math.max(options.totalRow ?? 1, options.formulaRows?.end ?? 1));
    document.worksheet = worksheet;
  });

  zip.file('xl/styles.xml', buildXml(stylesDoc));
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

export async function insertRowIntoWorkbook(input: Buffer, options: InsertRowOptions): Promise<Buffer> {
  const zip = await JSZip.loadAsync(input);
  await shiftWorkbookRows(zip, options.rowNumber, 1);

  const sheetRefs = await getSheetRefs(zip);
  const targetSheet = sheetRefs.find((sheet) => sheet.name === options.sheetName);
  if (!targetSheet) {
    throw new Error(`Sheet not found: ${options.sheetName}`);
  }

  await updateZipEntry(zip, targetSheet.target, (document) => {
    const rows = getWorksheetRows(document).map((row) => ({ ...row }));
    const rowMap = new Map<number, Record<string, unknown>>(rows.map((row) => [Number(row['@_r'] ?? 0), row]));
    const referenceStyles = options.copyStyleFrom
      ? new Map<string, number>(
        asArray((rowMap.get(options.copyStyleFrom)?.c as Record<string, unknown> | Array<Record<string, unknown>> | undefined)).map((cell) => {
          const { column } = splitCellRef(String(cell['@_r']));
          return [column, Number(cell['@_s'] ?? 0)] as const;
        }),
      )
      : new Map<string, number>();

    const newRow: Record<string, unknown> = { '@_r': String(options.rowNumber), c: [] };
    const newCells = options.cells
      .slice()
      .sort((left, right) => columnToNumber(left.column) - columnToNumber(right.column))
      .map((cell) => createCell(`${cell.column.toUpperCase()}${options.rowNumber}`, cell.value, cell.kind, referenceStyles.get(cell.column.toUpperCase())));
    newRow.c = newCells;
    rowMap.set(options.rowNumber, newRow);

    const nextRows = [...rowMap.values()].sort((left, right) => Number(left['@_r'] ?? 0) - Number(right['@_r'] ?? 0));
    setWorksheetRows(document, nextRows);
    updateWorksheetDimension(document, options.cells.reduce((max, cell) => columnToNumber(cell.column) > columnToNumber(max) ? cell.column : max, 'A'), options.rowNumber);
  });

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
