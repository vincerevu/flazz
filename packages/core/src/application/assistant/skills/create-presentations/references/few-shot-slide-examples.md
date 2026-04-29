# Few-Shot Slide Patterns

These are compact design examples for native PPTX generation. They are not
templates to copy literally; use them to choose structure before writing slide
modules.

## Executive Metric Wall

Use when the story is numbers-first.

- `layoutFamily`: `stats`
- `visualPattern`: `STATS`
- `sectionLayout`: `vertical` or `left`
- Helper: `addMetricWall()`
- Content: 3-6 metrics, one lead metric, short labels
- Look: one dominant metric, smaller supporting metrics, strong contrast

Avoid converting this into paragraphs. If the metric needs explanation, put it
in `detail`, not a separate bullet list.

## Editorial Quote

Use when one insight, customer quote, thesis, or warning should dominate.

- `layoutFamily`: `text-visual`
- `visualPattern`: `QUOTE` or `CALLOUT`
- `sectionLayout`: `left`, `right`, or `background`
- Helper: `addEditorialQuote()`
- Content: quote, optional attribution, optional kicker
- Look: large quote, one accent bar, restrained supporting label

Use this instead of a bullet slide when the slide has one primary idea.

## Evidence Media

Use when a screenshot, document excerpt, diagram, artifact, product image, or
photo is the evidence.

- `layoutFamily`: `media`
- `visualPattern`: `MEDIA`
- `sectionLayout`: `background` or `right`
- Helper: `addEvidenceMedia()` or `addHeroImageOverlay()`
- Content: imagePath, title, caption, optional annotation
- Look: image takes most of the frame; text explains why it matters

Do not make the image tiny beside a large text block.

## Diagonal Before/After

Use when comparing old vs new, problem vs solution, before vs after, or risk vs
control.

- `layoutFamily`: `comparison`
- `visualPattern`: `BEFORE-AFTER` or `COMPARE`
- `sectionLayout`: `vertical`
- Helper: `addDiagonalCompare()`
- Content: exactly two columns with title, body, optional label
- Look: two strong panels with asymmetric position and color contrast

Use this over a standard two-column list when contrast is the message.

## Layered System Stack

Use when the message is architecture, maturity, dependency, or foundation.

- `layoutFamily`: `hierarchy`
- `visualPattern`: `PYRAMID`, `BOXES`, or `ICONS`
- `sectionLayout`: `right` or `vertical`
- Helper: `addLayeredStack()`
- Content: 2-5 layers, each with title and optional detail/tag
- Look: stacked horizontal layers, slight inset, clear top/bottom hierarchy

Use this over generic cards when levels imply dependency.

## Example Rhythm For A 12-Slide Deck

```text
01 cover / background
02 contents / vertical
03 stats / STATS / left
04 media / MEDIA / background
05 hierarchy / PYRAMID / right
06 comparison / BEFORE-AFTER / vertical
07 roadmap / ARROWS / left
08 relation / CYCLE / right
09 data / CHART / vertical
10 quote / QUOTE / left
11 boxes / ICONS / vertical
12 summary / background
```

The rhythm intentionally rotates layout family, visual pattern, and section
layout. Do not use this exact sequence for every deck; adapt it to content.
