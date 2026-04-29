# DOM-Based PPTX Export Architecture

This reference documents the presentation-ai export approach as an architecture
option for Flazz. Flazz now has the first plumbing for this path: shared scan
schemas, a renderer DOM scanner, a main-process IPC route, and a core
PptxGenJS converter. It is not the default deck generation path yet.

## Summary

Presentation-ai treats the rendered slide DOM as the source of truth, then
exports that rendered result to PowerPoint.

High-level flow:

1. Generate or edit slide content as structured presentation state.
2. Render every slide in the browser using the real editor components and CSS.
3. Scan each rendered slide DOM for element bounds, styles, images, and tables.
4. Convert scanned elements into PowerPoint coordinates.
5. Use `pptxgenjs` to write a native `.pptx` file.

This differs from Flazz's current skill path, where the assistant writes
PptxGenJS coordinates directly.

## Presentation-AI Reference Files

Local source inspected:

- `.local/skill-sources/presentation-ai/src/components/presentation/buttons/ExportButton.tsx`
- `.local/skill-sources/presentation-ai/src/components/presentation/export/domSlideScanner.ts`
- `.local/skill-sources/presentation-ai/src/components/presentation/export/domToPptxConverter.ts`
- `.local/skill-sources/presentation-ai/src/components/presentation/export/types.ts`

Important dependencies in presentation-ai:

- `pptxgenjs`
- `html-to-image`
- `html2canvas-pro`
- `jszip`

## Why DOM-First Helps

The browser layout engine is better at solving:

- text wrapping
- image crop and object-fit behavior
- CSS spacing and responsive layout
- measuring real rendered bounds
- detecting overlap before export

This directly reduces issues such as:

- bottom callouts covering page badges
- long row lists extending below the slide
- relation maps entering the title zone
- visual drift between preview and exported deck

## What Gets Scanned

A DOM scanner should collect:

- slide id
- slide width and height in pixels
- background color and background image
- root image data and measured position
- text elements and text styles
- image elements and measured positions
- shape/decor elements where supported
- table elements where supported

Element positions should be stored as percentages relative to the slide frame.
The converter can then map them to a 10" x 5.625" PowerPoint canvas.

## Root Image Handling

Presentation-ai captures root images as PNG with `html-to-image` instead of
trying to reproduce CSS cropping in PptxGenJS.

This is important because CSS features such as `object-fit`, `object-position`,
border radius, and nested transforms are easy to render correctly in the DOM
but hard to recreate exactly with native PowerPoint primitives.

Recommended rule:

- For simple editable images, export as native image.
- For CSS-cropped or complex root images, capture the DOM node as PNG.

## Native Editability Trade-Off

DOM-first export can still produce a native `.pptx`, but editability depends on
the conversion strategy:

- Best editability: text, simple shapes, tables, and images become native PPTX
  objects.
- Best fidelity: complex CSS, clipped media, and decorative groups become
  captured PNGs.

Use hybrid export:

- native text for headings, body copy, labels, table cells
- native shapes for simple rectangles, circles, lines, and cards
- PNG fallback for complex CSS visuals, root-image crops, or unsupported SVG/CSS

## Flazz Migration Recommendation

Do not replace the current Node-only skill in one jump.

Recommended phases:

1. Keep the current PptxGenJS helper path as the fallback. Done.
2. Add shared scan/export contracts and a DOM-to-PPTX IPC route. Done.
3. Add a renderer DOM scanner for tagged slide elements. Done.
4. Add an internal slide preview renderer that can render generated slide specs
   into DOM.
5. Add post-render overlap QA.
6. Route rich/complex decks through DOM-first export.
7. Keep pure PptxGenJS export for simple, offline, or highly editable decks.

## Acceptance Criteria For A DOM-First Exporter

- Export button creates a valid `.pptx`.
- Slide preview and exported `.pptx` match within acceptable visual tolerance.
- Text remains native/editable unless intentionally rasterized.
- Root images preserve crop and aspect ratio.
- Bottom safe zone and page badge zone are enforced after DOM measurement.
- Export reports scan failures per slide instead of silently dropping content.
- QA catches overlap and out-of-bounds before writing the final deck.

## When To Use DOM-First

Prefer DOM-first for:

- visually rich decks
- generated educational decks with diagrams
- decks with many cards/rows/tables
- image-heavy slides
- anything where exact browser preview matters

Prefer direct PptxGenJS for:

- small utility decks
- template XML edits
- strict native editability requirements
- runtime contexts where no browser/DOM renderer is available
