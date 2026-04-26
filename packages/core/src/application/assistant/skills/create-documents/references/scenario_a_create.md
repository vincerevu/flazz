# Scenario A: Create A New DOCX With Python

Use this when the user has no existing `.docx` and asks to create a report, memo, proposal, contract, letter, or printable document.

## Workflow

1. Infer document type: report, memo, letter, academic, or custom.
2. Build `content.json` with title, subtitle, author, sections, paragraphs, lists, tables, images, and page breaks.
3. Run `docx_create.py`.
4. Run `docx_validate.py`.
5. Run `docx_analyze.py` and inspect the preview.

## Command

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_create.py" --content-json content.json --output output.docx
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_validate.py" output.docx
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" output.docx
```

## JSON Shape

```json
{
  "title": "Quarterly Revenue Analysis",
  "subtitle": "Q1 2026",
  "author": "Finance Team",
  "sections": [
    {
      "heading": "Executive Summary",
      "level": 1,
      "content": [
        { "type": "paragraph", "text": "Revenue grew 12% year over year." },
        { "type": "list", "items": ["North America led growth", "Margins improved"] },
        {
          "type": "table",
          "headers": ["Region", "Revenue", "Growth"],
          "rows": [["North America", "$4.2M", "15%"]]
        }
      ]
    }
  ]
}
```

Supported content types: `paragraph`, `heading`, `list`, `table`, `image`, `pageBreak`.

## Document Defaults

- Report: Calibri 11pt, clear H1/H2 hierarchy, A4 or Letter.
- Memo: concise headings, To/From/Date/Subject block if provided.
- Academic: Times New Roman 12pt when requested.
- CJK: read `cjk_typography.md` and use appropriate East Asian fonts.
