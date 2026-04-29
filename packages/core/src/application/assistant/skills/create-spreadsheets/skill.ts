const skill = String.raw`
# Spreadsheet Creation And Editing Skill

Use this skill when the user asks to read, analyze, create, edit, validate, repair, or format spreadsheet files such as .xlsx, .xlsm, .csv, or .tsv. The final deliverable should be the requested spreadsheet file when the user asks for file output.

Only create spreadsheet artifacts when the user explicitly asks for a workbook, spreadsheet, table export, tracker file, or a concrete spreadsheet extension such as \`.xlsx\`, \`.csv\`, or \`.tsv\`. If the user asks to research, explain, summarize, compare, or look into data, answer in chat unless they explicitly request a file. When the user requests one format, deliver only that format and do not create companion documents, PDFs, markdown files, or other sidecars unless requested.

For new spreadsheet artifacts and straightforward generated workbooks, default to Flazz's built-in Node path via \`renderWorkbookXlsx\`, then validate with \`validateWorkbookXlsx\`. For existing-workbook inspection, style auditing, shifting rows, inserting rows, or adding formula columns, use Flazz's built-in Node spreadsheet tools first. Do not fall back to Python helpers for normal spreadsheet work.

## Capabilities

- Read and analyze workbook structure and tabular data with the built-in \`inspectWorkbookXlsx\` tool.
- Create new .xlsx files with the built-in \`renderWorkbookXlsx\` tool.
- Validate new .xlsx files with the built-in \`validateWorkbookXlsx\` tool.
- Audit workbook style integrity with the built-in \`auditWorkbookStylesXlsx\` tool.
- Edit existing .xlsx/.xlsm files without lossy openpyxl round-trips.
- Add formula columns, shift rows, and insert rows in existing workbooks with the built-in \`addWorkbookColumnXlsx\`, \`shiftWorkbookRowsXlsx\`, and \`insertWorkbookRowXlsx\` tools.
- Add rows, columns, formulas, styles, borders, and financial formatting.
- Validate formulas and workbook integrity before delivery.

## Bundled Resources

- references/read-analyze.md: read-only discovery and analysis workflow.
- references/create.md: create new workbooks from the minimal XML template.
- references/edit.md: edit existing workbooks through unpack/edit/pack.
- references/fix.md: repair broken formulas.
- references/format.md: formatting standards and style XML.
- references/validate.md: formula and recalculation validation.
- scripts/xlsx_reader.py, scripts/style_audit.py, scripts/xlsx_unpack.py, scripts/xlsx_pack.py, scripts/xlsx_add_column.py, scripts/xlsx_insert_row.py, scripts/xlsx_shift_rows.py, scripts/formula_check.py: legacy references that informed the built-in Node spreadsheet path.
- templates/minimal_xlsx/: legacy OOXML reference template.

## Routing

## Dependency Preflight

Use the built-in Node spreadsheet path. Use \`inspectWorkbookXlsx\` to analyze, \`renderWorkbookXlsx\` to create, \`validateWorkbookXlsx\` to verify formulas, \`auditWorkbookStylesXlsx\` to check style integrity, and the built-in XML-safe edit tools for workbook updates:

    inspectWorkbookXlsx(...)
    addWorkbookColumnXlsx(...)
    shiftWorkbookRowsXlsx(...)
    insertWorkbookRowXlsx(...)

Do not use Python, \`pip install\`, \`winget install\`, LibreOffice, or ad hoc spreadsheet generators for built-in spreadsheet work. If the requested edit would require preserving unsupported workbook internals beyond the built-in Node tools, stop and explain that limitation instead of improvising a new runtime.

### Create a new spreadsheet

For new generated workbooks, use \`renderWorkbookXlsx\` first. Build a structured workbook spec with ordered sheets, rows, formulas, widths, and filters, then call:

    renderWorkbookXlsx({
      outputPath: "output/sheets/report.xlsx",
      sheets: [
        {
          name: "Summary",
          rows: [
            ["Metric", "Value"],
            ["Revenue", 120000],
            ["Tax", { formula: "B2*0.1", numberFormat: "0.0%" }]
          ],
          columnWidths: [18, 14],
          frozenRows: 1,
          autoFilter: { from: "A1", to: "B3" }
        }
      ]
    })

Use this built-in path for fresh spreadsheet artifacts, tabular exports, KPI tables, and generated reports that do not need to preserve advanced workbook internals from an existing file.

Do not route new workbook creation through Python XML scripts if \`renderWorkbookXlsx\` can satisfy the task.

After writing a fresh workbook, validate it with:

    validateWorkbookXlsx({
      workbookPath: "output/sheets/report.xlsx"
    })

### Read or analyze an existing spreadsheet

Read references/read-analyze.md first. Use:

    inspectWorkbookXlsx({
      workbookPath: "input.xlsx"
    })

Never modify the source file for analysis tasks.

### Edit an existing spreadsheet

Read references/edit.md first. Never create a new Workbook() for edit tasks. Preserve all original sheets and only change requested cells.

For common edits such as adding a formula column or inserting a new row, use the built-in Node XML-safe tools first:

    addWorkbookColumnXlsx({
      workbookPath: "input.xlsx",
      outputPath: "output/sheets/updated.xlsx",
      sheetName: "Budget",
      column: "G",
      header: "% of Total",
      formula: "F{row}/$F$10",
      formulaRows: { start: 2, end: 9 },
      totalRow: 10,
      totalFormula: "SUM(G2:G9)"
    })

    insertWorkbookRowXlsx({
      workbookPath: "input.xlsx",
      outputPath: "output/sheets/updated.xlsx",
      sheetName: "Budget",
      rowNumber: 6,
      copyStyleFrom: 5,
      cells: [
        { column: "A", value: "Utilities", kind: "text" },
        { column: "B", value: 3000, kind: "number" },
        { column: "F", value: "SUM(B{row}:E{row})", kind: "formula" }
      ]
    })

For workbook-wide row shifts, use:

    shiftWorkbookRowsXlsx({
      workbookPath: "input.xlsx",
      outputPath: "output/sheets/updated.xlsx",
      atRow: 6,
      delta: 1
    })

Do not use openpyxl round-trip for existing files because it can damage macros, pivots, sparklines, charts, and unsupported XML parts. Do not improvise alternate runtimes from this built-in skill.

### Add a column or row

Prefer bundled helpers over ad hoc XML changes:

    addWorkbookColumnXlsx(...)
    insertWorkbookRowXlsx(...)
    shiftWorkbookRowsXlsx(...)

When the user gives a row label, find the actual row by searching worksheet XML or sharedStrings. Do not trust the prompt's row number blindly.

### Fix formulas

Read references/fix.md and references/validate.md. Repair formulas through the built-in Node XML-safe path, then validate with \`validateWorkbookXlsx\`.

## Validation

Validation is mandatory before final delivery:

For fresh Node-rendered workbooks, run:

    validateWorkbookXlsx({
      workbookPath: "output/sheets/report.xlsx"
    })

For structural and formatting checks, also run:

    auditWorkbookStylesXlsx({
      workbookPath: "output/sheets/report.xlsx"
    })

For edits, verify the output still contains the original sheet names and sample original data. If verification fails, the output file is wrong.

## Financial Formatting Standard

- Hard-coded inputs and assumptions: blue font, 0000FF.
- Formula results: black font, 000000.
- Cross-sheet formula references: green font, 00B050.

## Non-Negotiable Rules

1. Always produce the requested output file.
2. Existing workbook edits must use the built-in XML-safe Node edit tools, not new Workbook() for round-trip edits.
3. Preserve every sheet and unrelated workbook part.
4. Calculated values must be formulas.
5. Validate formulas and inspect output before final response.
6. Keep support files in scratch/work directories; only final spreadsheet path is user-facing.
7. Do not install Python, lxml, pandas, openpyxl, LibreOffice, or any other dependency from the built-in spreadsheet workflow.
8. For spreadsheet inspection, creation, validation, and common edits, prefer the built-in Node spreadsheet tools.
`;

export default skill;
