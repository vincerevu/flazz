const skill = String.raw`
# Document Creation And Editing Skill

Use this skill when the user asks to create, write, edit, fill, reformat, validate, or apply templates to Word documents. Use it for formal printable documents even when the user says "report", "proposal", "contract", "memo", or "document" without explicitly saying .docx. Use it for document-style PDF requests as well; do not route those through presentation workflows.

The reliable final deliverable for this skill is either:
- a valid .docx file generated or edited through Flazz's built-in Node DOCX path, or
- a markdown source file plus a final .pdf rendered through Flazz's sanctioned PDF exporter for PDF-first document workflows.

For PDF requests, default to: write markdown -> save the markdown source in the workspace -> call the built-in \`renderMarkdownPdf\` tool. Do not switch to slides, and do not improvise legacy converters.

Do not write \`.docx\` or exported \`.pdf\` artifacts into \`memory/\`. Keep long-lived markdown knowledge in \`memory/\`, and place generated document artifacts in a non-memory folder such as \`output/doc/\` or \`exports/\`.

Do not improvise legacy PDF conversion paths for document generation. If the user explicitly requires PDF output, use Flazz's sanctioned markdown-to-PDF path via \`renderMarkdownPdf\`. Do not use \`pandoc\`, \`reportlab\`, \`markitdown\`, \`pip install\`, or ad hoc shell converters for built-in PDF generation. Preserve UTF-8 and choose fonts with full coverage for the document language, especially for Vietnamese and CJK text.

## Capabilities

- Create new .docx documents from scratch with the built-in \`renderDocumentDocx\` tool.
- Inspect existing .docx packages with the built-in \`inspectDocumentDocx\` tool.
- Edit or fill existing .docx files with the built-in \`replaceTextDocumentDocx\` tool for straightforward text updates.
- Preserve document package parts, sections, headers, footers, tables, comments, fields, and styles where possible.
- Validate OpenXML package structure before delivery with the built-in \`validateDocumentDocx\` tool.
- Create standalone PDF reports from markdown using the built-in \`renderMarkdownPdf\` tool.

## Bundled Resources

- references/scenario_a_create.md: create from scratch.
- references/scenario_b_edit_content.md: edit or fill existing content.
- references/scenario_c_apply_template.md: apply template/style formatting.
- references/python_workflows.md: legacy reference material from the older Python-based DOCX path.
- references/openxml_element_order.md: strict element ordering rules.
- references/openxml_units.md: DXA, EMU, half-point conversions.
- references/typography_guide.md and references/design_principles.md: document aesthetics.
- references/cjk_typography.md: CJK typography and fonts.
- references/troubleshooting.md: symptom-driven fixes.
- scripts/docx_create.py, scripts/docx_analyze.py, scripts/docx_replace.py, scripts/docx_validate.py: legacy reference scripts that informed the built-in Node DOCX tools.
- assets/xsd and assets/styles: validation and style assets.

## Routing

## Dependency Preflight

Use Flazz's built-in Node DOCX path. The sanctioned built-in tools are:

    renderDocumentDocx(...)
    inspectDocumentDocx(...)
    validateDocumentDocx(...)
    replaceTextDocumentDocx(...)
    renderMarkdownPdf(...)

Do not use Python, .NET, \`pip install\`, \`winget install\`, LibreOffice, \`pandoc\`, or ad hoc shell converters for built-in DOCX work. If the requested edit exceeds the current built-in DOCX feature set, stop and explain the limitation instead of improvising a new runtime.

### PDF-first document workflow

Use this when the user explicitly wants a PDF report, PDF brief, PDF paper, or another final PDF artifact in document form.

1. Write the markdown source into a non-memory workspace path such as \`output/doc/report.md\`.
2. Keep the markdown as the source of truth.
3. Call \`renderMarkdownPdf\` with that markdown content and a target path such as \`output/doc/report.pdf\`.
4. Do not use \`pandoc\`, \`reportlab\`, \`markitdown\`, browser automation packages, or any ad hoc converter.
5. Do not route the request through \`create-presentations\` just because the final artifact is PDF.

### Pipeline A: Create new document

Use when the user has no input .docx and asks to draft, write, generate, or create a report/proposal/memo/contract.

Read references/typography_guide.md and references/design_principles.md. For CJK documents, also read references/cjk_typography.md. Use scenario_a_create.md only for conceptual document structure guidance, not commands.

Create the document with:

    renderDocumentDocx({
      outputPath: "output/doc/report.docx",
      title: "Title",
      subtitle: "Subtitle",
      author: "Author",
      sections: [
        {
          heading: "Overview",
          content: [
            { type: "paragraph", text: "Intro paragraph." },
            { type: "list", ordered: false, items: ["Point A", "Point B"] }
          ]
        }
      ]
    })

If you already wrote a markdown source file for the same document, do not manually retype that content into \`sections\`. Instead, render DOCX directly from the markdown source of truth:

    renderDocumentDocx({
      outputPath: "output/doc/report.docx",
      title: "Title",
      markdownPath: "output/doc/report.md"
    })

Important shape rules for \`renderDocumentDocx\`:
- \`sections\` must be an array of section objects, never a string.
- Each section's \`content\` must be an array, never a single object or string.
- Plain body text belongs in \`content: [{ type: "paragraph", text: "..." }]\`, not directly in \`sections\`.
- If you only have one section, still wrap it in \`sections: [ ... ]\`.
- When both PDF and DOCX are requested, prefer a shared markdown source file and use that same markdown for both \`renderMarkdownPdf\` and \`renderDocumentDocx\` to avoid content drift or Unicode corruption.

Then validate with:

    validateDocumentDocx({
      documentPath: "output/doc/report.docx"
    })

### Pipeline B: Edit or fill existing document

Use when the user provides an input .docx and asks to replace text, fill placeholders, update sections, modify tables, or add content.

Read scenario_b_edit_content.md only for edit strategy guidance, not commands. Analyze before editing:

    inspectDocumentDocx({
      documentPath: "input.docx"
    })

For straightforward text replacement in body/header/footer parts:

    replaceTextDocumentDocx({
      documentPath: "input.docx",
      outputPath: "output/doc/updated.docx",
      find: "OLD",
      replace: "NEW"
    })

Then validate with:

    validateDocumentDocx({
      documentPath: "output/doc/updated.docx"
    })

For more complex structural DOCX edits, preserve the package and edit the OOXML parts through Flazz's built-in Node path. Do not switch to Python or .NET from this skill.

### Pipeline C: Apply template or formatting

Use when the user asks to reformat, restyle, match a template, apply an official format, or merge content with a template.

Use scenario_c_apply_template.md only for template strategy guidance, not commands. Analyze source and template, then choose:

- Overlay: template only supplies styles.
- Base-replace: template has structure, cover pages, TOC, sections, or header/footer rules.

For complex templates, preserve the template as the output base and replace content. Do not recreate headers, footers, sections, or title pages from scratch. If the requested template merge is beyond the current built-in Node DOCX feature set, stop and explain that the advanced template operation is not yet supported in the sanctioned path.

## Critical OpenXML Rules

OpenXML element order is strict:

- w:p: pPr before runs.
- w:r: rPr before text, break, tab, drawing, or field nodes.
- w:tbl: tblPr, tblGrid, then rows.
- w:tr: trPr before cells.
- w:tc: tcPr before paragraphs, with at least one paragraph.
- w:body: block content first, sectPr last.

Direct formatting contamination breaks template application. When copying source content into a template, strip inline rPr and pPr unless explicitly preserving a direct format is required.

Heading styles must include OutlineLevel or Word will not treat them as navigable headings.

## Validation

Run after every write operation:

    validateDocumentDocx({
      documentPath: "output/doc/report.docx"
    })
    inspectDocumentDocx({
      documentPath: "output/doc/report.docx"
    })

For template work, gate-check is mandatory:

    validateDocumentDocx({
      documentPath: "output/doc/report.docx"
    })

If validation fails, inspect the changed XML part, fix element order or relationships, then rerun validation and analysis.

## Non-Negotiable Rules

1. Always produce the requested output .docx.
2. Choose the pipeline before editing.
3. Preview/analyze input documents before modification.
4. Preserve unrelated content, styles, sections, headers, footers, and tables.
5. Use Flazz's built-in Node OOXML path for advanced document edits.
6. Validate output before final delivery.
7. Keep support files internal; final response should point to the final .docx only.
8. Do not install Python, python-docx, lxml, .NET, pandoc, reportlab, markitdown, or any other dependency from the built-in document workflow.
`;

export default skill;
