# Layout Taxonomy

Use this taxonomy before writing any content slide code. The goal is to select a constrained layout family first, then render with the matching helper. This prevents generic title-plus-bullets slides and avoids fragile hand-positioned layouts.

## Required Content Slide Spec

Every content slide must define a `slideSpec` object before `createSlide()`:

```javascript
const slideSpec = {
  type: "content",
  index: 4,
  title: "Slide title",
  layoutFamily: "comparison",
  layoutVariant: "two-card-compare",
  density: "medium",
};
```

Allowed `layoutFamily` values:

- `text-visual`
- `comparison`
- `timeline`
- `roadmap`
- `hierarchy`
- `quadrant`
- `relation`
- `cycle`
- `pyramid`
- `staircase`
- `boxes`
- `data`
- `stats`
- `media`

Allowed `density` values:

- `light`: 1-3 content units, large visual emphasis
- `medium`: 3-5 content units, balanced visual/text ratio
- `dense`: 5-8 content units, compact card/grid structure

Do not use `dense` as permission to write paragraphs. Dense slides still need structured units.

## Family Selection

### Text Visual

Use for short explanation slides where the core content is 3-5 atomic points.

Render with:

- `addBulletList()` for plain bullet sections
- icon-plus-text rows for more visual lists

Avoid when the slide has phases, categories, metrics, or opposing concepts. Pick a more specific family instead.

### Comparison

Use for A/B, pros/cons, before/after, old/new, option tradeoffs.

Render with:

- `addComparisonCards()`

Rules:

- exactly two columns for standard compare slides
- each side needs a short title
- each item should be one idea

### Timeline

Use for chronological events, historical progressions, phases over time, or process sequences with a clear order.

Render with:

- `addProcessTimeline()` for simple horizontal sequences

Rules:

- 3-5 steps is ideal
- labels are short nouns or verbs
- captions explain, not repeat the label

### Roadmap

Use when the slide needs phases, future plan, maturity path, rollout, or multi-stage strategy.

Render with:

- `addRoadmap()` from `scripts/pptx-roadmap-helpers.cjs`

Rules:

- 3-5 stages
- each stage has `label` and `caption`
- optional `tag` is for phase labels such as `Now`, `Next`, `Later`

### Hierarchy

Use for trees, layered systems, categories, organizational logic, cause/effect stacks, or topic breakdowns.

Render with:

- `addHierarchyStack()` from `scripts/pptx-hierarchy-helpers.cjs`

Rules:

- 3-6 nodes
- each node has `title` and optional `detail`
- do not fake hierarchy with a paragraph

### Quadrant

Use for 2x2 frameworks, prioritization matrices, risk/opportunity maps, impact/effort, or market positioning.

Render with:

- `addQuadrantMatrix()` from `scripts/pptx-quadrant-helpers.cjs`

Rules:

- exactly four quadrants
- each quadrant has a short `title`
- `body` or `items` should be compact

### Relation

Use for ecosystems, dependency maps, hub-and-spoke relationships, feedback loops, or connected concepts.

Render with:

- `addRelationMap()` from `scripts/pptx-infographic-helpers.cjs`

Rules:

- use `{ center: { title, detail? }, nodes: { title, detail? }[] }`
- 3-6 outer nodes is ideal
- relation slides should show connections, not a normal list

### Cycle

Use for feedback loops, repeating systems, lifecycle stages, circular processes, or flywheel explanations.

Render with:

- `addCycleDiagram()` from `scripts/pptx-infographic-helpers.cjs`

Rules:

- 3-6 stages
- each stage has `title` and optional `detail`
- use cycle only when the last stage leads back to the first

### Pyramid

Use for layered priority, maturity levels, Maslow-style hierarchy, foundation-to-peak framing, or funnel-like concept stacks.

Render with:

- `addPyramid()` from `scripts/pptx-infographic-helpers.cjs`

Rules:

- 3-5 levels
- order top-to-bottom in the array
- each level has a short `title` and optional `detail`

### Staircase

Use for progressive improvement, stepwise maturity, capability growth, or increasing complexity.

Render with:

- `addStaircase()` from `scripts/pptx-infographic-helpers.cjs`

Rules:

- 3-5 steps
- order left-to-right from earliest/lowest to latest/highest
- each step has a short `title` and optional `detail`

### Boxes

Use for general card grids, feature lists, capability groups, or grouped ideas that do not imply order.

Render with:

- `addBoxGrid()` from `scripts/pptx-infographic-helpers.cjs`

Rules:

- 2-6 boxes
- each box has `title` and optional `detail`
- use this instead of hand-drawing repeated card grids

### Data

Use for numbers, distributions, rankings, survey data, or trend summaries.

Render with:

- `addBarChartWithTakeaways()`

Rules:

- data slides must include `source`
- takeaways must explain what the data means
- labels stay short

### Stats

Use for standalone metrics or fact snapshots.

Render with:

- `addStatCardGrid()`

Rules:

- 2-6 cards
- compact metric value
- short label, optional detail

### Media

Use for image-led slides, diagrams, screenshots, visual examples, or photo plus explanation.

Render with:

- `addMixedMediaPanel()`

Rules:

- image path must be explicit
- supporting bullets max four
- caption when image source or context matters

## Layout Planning Rules

- Do not repeat the same `layoutFamily` more than twice in a row.
- Prefer visual families over `text-visual` when the content contains categories, phases, comparisons, or metrics.
- Choose layout from content structure, not visual preference.
- Map broad infographic categories this way:
- chart -> `data` or `stats`
- compare -> `comparison`
- hierarchy -> `hierarchy` or `pyramid`
- list -> `boxes`, `text-visual`, or `stats`
- quadrant -> `quadrant`
- relation -> `relation`
- sequence -> `timeline`, `roadmap`, `cycle`, or `staircase`
- If the source paragraph contains multiple ideas, split it into the structured data model before rendering.
- If no helper exists for the chosen layout, either choose the closest existing helper or build a small local helper before hand-positioning many elements.

## Example Planning Output

```text
Slide 01: cover
Slide 02: content / stats / 2x2 metric grid
Slide 03: content / hierarchy / layered concept stack
Slide 04: content / roadmap / three-stage rollout
Slide 05: content / comparison / two-card compare
Slide 06: summary / recap rows
```

Use this plan before creating slide files.
