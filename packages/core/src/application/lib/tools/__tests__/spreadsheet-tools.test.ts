import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { __spreadsheetPrivate__, spreadsheetTools } from '../spreadsheet-tools.js';
import { WorkDir } from '../../../../config/runtime-defaults.js';

test('normalizeXlsxOutputPath appends missing extension', () => {
  assert.equal(__spreadsheetPrivate__.normalizeXlsxOutputPath('output/sheets/report'), 'output/sheets/report.xlsx');
  assert.equal(__spreadsheetPrivate__.normalizeXlsxOutputPath('output/sheets/report.xlsx'), 'output/sheets/report.xlsx');
});

test('renderWorkbookXlsx blocks memory artifacts', async () => {
  const result = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'memory/report.xlsx',
    sheets: [{ name: 'Sheet1', rows: [['A']] }],
  });

  assert.equal(result.success, false);
  assert.match(String(result.error), /Do not write spreadsheet artifacts into memory/i);
});

test('renderWorkbookXlsx writes workbook with formulas', async () => {
  const result = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-tool-check',
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Item', 'Value'],
          ['Revenue', 120],
          ['Tax', { formula: 'B2*0.1', numberFormat: '0.0%' }],
        ],
        columnWidths: [18, 14],
        frozenRows: 1,
        autoFilter: { from: 'A1', to: 'B3' },
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.path, 'output/test/spreadsheet-tool-check.xlsx');

  const workbookBuffer = await fs.readFile(path.join(WorkDir, result.path));
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets.Summary!;
  assert.equal(sheet.B2?.v, 120);
  assert.equal(sheet.B3?.f, 'B2*0.1');
});

test('validateWorkbookXlsx reports no issues for a valid workbook', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-valid',
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Revenue', 120],
          ['Tax', { formula: 'B1*0.1', numberFormat: '0.0%' }],
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const workbookPath = created.path;
  assert.ok(workbookPath);

  const validation = await spreadsheetTools.validateWorkbookXlsx.execute({
    workbookPath,
  });

  assert.equal(validation.success, true);
  assert.equal(validation.issueCount, 0);
  assert.equal(validation.formulaCount, 1);
  assert.deepEqual(validation.sheetNames, ['Summary']);
});

test('validateWorkbookXlsx catches broken sheet references', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-broken-ref',
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Revenue', 120],
          ['Linked', { formula: 'MissingSheet!A1' }],
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const workbookPath = created.path;
  assert.ok(workbookPath);

  const validation = await spreadsheetTools.validateWorkbookXlsx.execute({
    workbookPath,
  });

  assert.equal(validation.success, true);
  assert.equal(validation.issueCount, 1);
  assert.equal(validation.issues[0]?.type, 'broken_sheet_ref');
  assert.equal(validation.issues[0]?.sheet, 'Summary');
  assert.equal(validation.issues[0]?.cell, 'B2');
});

test('validateWorkbookXlsx catches broken named ranges', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-broken-name',
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Revenue', 120],
          ['Linked', { formula: 'MissingRange+1' }],
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const validation = await spreadsheetTools.validateWorkbookXlsx.execute({
    workbookPath: created.path!,
  });

  assert.equal(validation.success, true);
  assert.ok(validation.issues.some((issue: { type?: string; missingName?: string }) => issue.type === 'broken_named_range' && issue.missingName === 'MissingRange'));
});

test('validateWorkbookXlsx catches broken shared formula groups', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-broken-shared-formula',
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Value'],
          [120],
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const workbookPath = path.join(WorkDir, created.path!);
  const zip = await JSZip.loadAsync(await fs.readFile(workbookPath));
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
    </row>
    <row r="2">
      <c r="A2"><v>120</v></c>
    </row>
    <row r="3">
      <c r="B3"><f t="shared" si="7"/><v>0</v></c>
    </row>
  </sheetData>
</worksheet>`,
  );
  await fs.writeFile(workbookPath, Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })));

  const validation = await spreadsheetTools.validateWorkbookXlsx.execute({
    workbookPath: created.path!,
  });

  assert.equal(validation.success, true);
  assert.ok(validation.issues.some((issue: { type?: string; sharedIndex?: string }) => issue.type === 'shared_formula_missing_primary' && issue.sharedIndex === '7'));
});

test('inspectWorkbookXlsx reports structure, stats, and quality findings', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-inspect-source',
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Year', 'Revenue', 'Notes'],
          [2024, 120, 'ok'],
          [2025, 180, null],
          [2025, 180, null],
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const inspection = await spreadsheetTools.inspectWorkbookXlsx.execute({
    workbookPath: created.path!,
  });

  assert.equal(inspection.success, true);
  assert.deepEqual(inspection.sheetNames, ['Summary']);
  assert.equal(inspection.sheets[0]?.shape.rows, 3);
  assert.equal(inspection.sheets[0]?.stats.Revenue?.sum, 480);
  assert.ok(inspection.sheets[0]?.quality.some((issue: { type?: string }) => issue.type === 'duplicate_rows'));
  assert.ok(inspection.sheets[0]?.quality.some((issue: { type?: string; column?: string }) => issue.type === 'null_values' && issue.column === 'Notes'));
});

test('auditWorkbookStylesXlsx reports no integrity issues for a generated workbook', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-style-audit',
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Metric', 'Value'],
          ['Growth', { value: 0.18, numberFormat: '0.0%' }],
        ],
      },
    ],
  });

  assert.equal(created.success, true);
  const audit = await spreadsheetTools.auditWorkbookStylesXlsx.execute({
    workbookPath: created.path!,
  });

  assert.equal(audit.success, true);
  assert.equal(audit.issueCount, 0);
  assert.ok(audit.summary.styleCount >= 1);
});

test('addWorkbookColumnXlsx adds header and formulas to an existing workbook', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-base-add-column',
    sheets: [
      {
        name: 'Budget',
        rows: [
          ['Item', 'Amount'],
          ['Revenue', 120],
          ['Cost', 60],
        ],
      },
    ],
  });

  const edited = await spreadsheetTools.addWorkbookColumnXlsx.execute({
    workbookPath: created.path!,
    outputPath: 'output/test/spreadsheet-add-column-result',
    sheetName: 'Budget',
    column: 'C',
    header: 'Tax',
    formula: 'B{row}*0.1',
    formulaRows: { start: 2, end: 3 },
    totalRow: 4,
    totalFormula: 'SUM(C2:C3)',
    numberFormat: '0.0%',
  });

  assert.equal(edited.success, true);
  assert.ok(edited.validation);
  assert.equal(edited.validation.issueCount, 0);
  const editedPath = edited.path;
  assert.ok(editedPath);

  const workbookBuffer = await fs.readFile(path.join(WorkDir, editedPath));
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets.Budget!;
  assert.equal(sheet.C1?.v, 'Tax');
  assert.equal(sheet.C2?.f, 'B2*0.1');
  assert.equal(sheet.C3?.f, 'B3*0.1');
  assert.equal(sheet.C4?.f, 'SUM(C2:C3)');
});

test('insertWorkbookRowXlsx inserts row and shifts downstream formulas', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-base-insert-row',
    sheets: [
      {
        name: 'Budget',
        rows: [
          ['Item', 'Amount'],
          ['Revenue', 120],
          ['Cost', 60],
          ['Total', { formula: 'SUM(B2:B3)' }],
        ],
      },
    ],
  });

  const edited = await spreadsheetTools.insertWorkbookRowXlsx.execute({
    workbookPath: created.path!,
    outputPath: 'output/test/spreadsheet-insert-row-result',
    sheetName: 'Budget',
    rowNumber: 3,
    copyStyleFrom: 2,
    cells: [
      { column: 'A', value: 'Tax', kind: 'text' },
      { column: 'B', value: 12, kind: 'number' },
    ],
  });

  assert.equal(edited.success, true);
  assert.ok(edited.validation);
  assert.equal(edited.validation.issueCount, 0);
  const editedPath = edited.path;
  assert.ok(editedPath);

  const workbookBuffer = await fs.readFile(path.join(WorkDir, editedPath));
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets.Budget!;
  assert.equal(sheet.A3?.v, 'Tax');
  assert.equal(sheet.B3?.v, 12);
  assert.equal(sheet.A4?.v, 'Cost');
  assert.equal(sheet.B5?.f, 'SUM(B2:B4)');
});

test('shiftWorkbookRowsXlsx shifts downstream formulas across the workbook', async () => {
  const created = await spreadsheetTools.renderWorkbookXlsx.execute({
    outputPath: 'output/test/spreadsheet-base-shift-rows',
    sheets: [
      {
        name: 'Budget',
        rows: [
          ['Item', 'Amount'],
          ['Revenue', 120],
          ['Cost', 60],
          ['Total', { formula: 'SUM(B2:B3)' }],
        ],
      },
    ],
  });

  const shifted = await spreadsheetTools.shiftWorkbookRowsXlsx.execute({
    workbookPath: created.path!,
    outputPath: 'output/test/spreadsheet-shift-rows-result',
    atRow: 3,
    delta: 1,
  });

  assert.equal(shifted.success, true);
  assert.ok(shifted.validation);
  assert.equal(shifted.validation.issueCount, 0);

  const workbookBuffer = await fs.readFile(path.join(WorkDir, shifted.path!));
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets.Budget!;
  assert.equal(sheet.A4?.v, 'Cost');
  assert.equal(sheet.B5?.f, 'SUM(B2:B4)');
});
