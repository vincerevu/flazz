# Scenario B: Edit Or Fill Existing DOCX With Python

Use this when the user provides an input `.docx` and asks to replace text, fill placeholders, update tables, or add content.

## Workflow

1. Copy the original file to a safe output path. Do not edit the only copy in place.
2. Analyze the input before editing.
3. Use `docx_replace.py` for simple text or placeholder replacement.
4. For structural edits, unpack the DOCX and edit specific `word/*.xml` parts with Python `zipfile` and `lxml`.
5. Validate and analyze the output.

## Analyze

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" input.docx --json
```

## Replace Text

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_replace.py" --input input.docx --output output.docx --find "{{DATE}}" --replace "April 23, 2026"
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_validate.py" output.docx
```

## Structural Edits

Use direct XML edits for:

- tables with merged cells,
- section properties,
- headers and footers,
- comments,
- tracked changes,
- fields and TOC,
- numbering.

Before direct XML edits, read `openxml_element_order.md` and `openxml_namespaces.md`. Preserve unrelated package parts and relationships.
