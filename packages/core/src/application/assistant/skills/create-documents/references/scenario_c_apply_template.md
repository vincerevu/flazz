# Scenario C: Apply Template Or Formatting With Python

Use this when the user asks to restyle an existing document, match an official template, or merge content into a provided template.

## Strategy

- Overlay: source document stays as base; copy selected style definitions from template.
- Base-replace: template stays as base; replace body content while preserving template headers, footers, sections, cover pages, and styles.

Prefer base-replace when the template has strict layout requirements.

## Workflow

1. Analyze source and template with `docx_analyze.py`.
2. Choose overlay or base-replace.
3. Unpack DOCX packages into temp directories.
4. Edit only required XML parts with Python `zipfile` and `lxml`.
5. Preserve relationships, content types, section properties, headers, and footers.
6. Repack output.
7. Run `docx_validate.py` and `docx_analyze.py`.

## Commands

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" source.docx --json
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" template.docx --json
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_validate.py" output.docx
```

## Guardrails

- Do not recreate a complex template from scratch.
- Do not drop headers, footers, comments, numbering, images, hyperlinks, or relationships.
- Strip direct formatting from copied source content unless the user explicitly wants to preserve it.
- Keep heading styles valid so Word navigation and TOC behavior remain usable.
