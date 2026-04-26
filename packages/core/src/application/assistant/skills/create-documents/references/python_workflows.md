# Python DOCX Workflows

Use these commands as the source of truth for Flazz DOCX work. Do not use any legacy DOCX CLI.

Use `%FLAZZ_PYTHON%` and `%FLAZZ_SKILL_ROOT%` on Windows. On POSIX, use `$FLAZZ_PYTHON` and `$FLAZZ_SKILL_ROOT`.

## Create

Create a JSON file:

```json
{
  "title": "Quarterly Report",
  "subtitle": "Q1 2026",
  "author": "Finance Team",
  "sections": [
    {
      "heading": "Executive Summary",
      "level": 1,
      "content": [
        { "type": "paragraph", "text": "Revenue grew 12% year over year." },
        {
          "type": "table",
          "headers": ["Region", "Revenue", "Growth"],
          "rows": [["North America", "$4.2M", "15%"]]
        },
        { "type": "list", "items": ["Lower churn", "Higher expansion"] }
      ]
    }
  ]
}
```

Run:

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_create.py" --content-json content.json --output output.docx
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_validate.py" output.docx
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" output.docx
```

## Analyze

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" input.docx --json
```

Use this before edits to detect headings, tables, headers, footers, comments, numbering, and text preview.

## Replace Text

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_replace.py" --input input.docx --output output.docx --find "{{DATE}}" --replace "April 23, 2026"
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_validate.py" output.docx
```

This replaces text inside document, header, and footer XML parts. It preserves unrelated package parts.

## Advanced Edits

For section properties, TOC, comments, numbering, tracked changes, or complex templates:

1. Copy the source/template DOCX to a temp work path.
2. Unzip the DOCX package.
3. Edit specific `word/*.xml` parts with Python `zipfile` and `lxml`.
4. Preserve unrelated parts and relationships.
5. Rezip to `.docx`.
6. Run `docx_validate.py` and `docx_analyze.py`.

Read `openxml_element_order.md`, `openxml_namespaces.md`, and `openxml_units.md` before editing raw XML.
