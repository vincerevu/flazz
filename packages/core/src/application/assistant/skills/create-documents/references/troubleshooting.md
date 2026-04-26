# DOCX Troubleshooting

Use Python-only diagnostics.

## File Will Not Open

Run:

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_validate.py" output.docx
```

If validation fails, unzip the DOCX and inspect the XML part named in the error.

## Content Missing

Run:

```powershell
"%FLAZZ_PYTHON%" "%FLAZZ_SKILL_ROOT%\create-documents\scripts\docx_analyze.py" output.docx --json
```

Check `preview`, `headings`, `table_count`, `has_headers`, and `has_footers`.

## Replacement Did Not Happen

`docx_replace.py` replaces exact text inside individual `w:t` text nodes. If Word split the placeholder across runs, inspect `word/document.xml` and either:

- replace the split run sequence manually with lxml, or
- regenerate the source/template with unsplit placeholders.

## Layout Changed After Template Work

Use the template as the output base. Preserve these parts unless deliberately changing them:

- `word/styles.xml`
- `word/numbering.xml`
- `word/settings.xml`
- `word/header*.xml`
- `word/footer*.xml`
- `word/_rels/document.xml.rels`
- section properties in `word/document.xml`

## Tables Break

Read `openxml_element_order.md`. In table XML, keep this order:

1. `w:tblPr`
2. `w:tblGrid`
3. `w:tr`

In table cells, keep `w:tcPr` before paragraphs and ensure each cell contains at least one paragraph.

## Headings Not Detected

Headings need paragraph styles such as `Heading1`, `Heading2`, or a custom style with outline level. If only bold text is used, Word navigation and TOC logic may not treat it as a heading.
