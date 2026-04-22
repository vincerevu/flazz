# Infographic Template Catalog

This catalog ports the useful planning ideas from `presentation-ai` into Flazz's PPTX skill. Do not import `presentation-ai` dependencies or its editor app. Use these as layout planning names, then render with Flazz helpers.

## Category Mapping

| Source category | Use in Flazz | Primary helper |
|---|---|---|
| `chart` | `data`, `stats` | `addBarChartWithTakeaways`, `addStatCardGrid` |
| `compare` | `comparison`, `quadrant` | `addComparisonCards`, `addQuadrantMatrix` |
| `hierarchy` | `hierarchy`, `pyramid` | `addHierarchyStack`, `addPyramid` |
| `list` | `boxes`, `text-visual`, `stats` | `addBoxGrid`, `addBulletList`, `addStatCardGrid` |
| `quadrant` | `quadrant` | `addQuadrantMatrix` |
| `relation` | `relation` | `addRelationMap` |
| `sequence` | `timeline`, `roadmap`, `cycle`, `staircase` | `addProcessTimeline`, `addRoadmap`, `addCycleDiagram`, `addStaircase` |

## Useful Template Families

### Chart

Use when numbers are the message.

- `chart-bar-plain-text`: ranked bars with takeaway text
- `chart-column-simple`: compact vertical bars
- `chart-line-plain-text`: trend narrative
- `chart-pie-donut-compact-card`: share-of-total story
- `chart-pie-donut-pill-badge`: share callout with premium badges

Flazz default:

- use `data` for chart plus takeaways
- use `stats` for standalone metrics

### Compare

Use when the slide has two opposing or alternative concepts.

- `compare-binary-horizontal-badge-card-vs`: strong A vs B
- `compare-binary-horizontal-compact-card-arrow`: before-to-after change
- `compare-binary-horizontal-simple-fold`: old/new or problem/solution
- `compare-swot`: four-way decision analysis

Flazz default:

- use `comparison` for two-column compare
- use `quadrant` for SWOT-like four-part frameworks

### Hierarchy

Use when one concept decomposes into levels, branches, or dependencies.

- `hierarchy-structure`: standard org/category structure
- `hierarchy-structure-mirror`: two-sided hierarchy
- `hierarchy-tree-lr-*`: left-to-right dependency tree
- `hierarchy-tree-bt-*`: bottom-to-top foundation structure
- `hierarchy-mindmap-*`: central idea with branches

Flazz default:

- use `hierarchy` for layered card stacks
- use `relation` for mindmap-like hub-and-spoke layouts
- use `pyramid` for foundation-to-peak hierarchy

### List

Use when items are peers and order is not central.

- `list-grid-compact-card`: feature or capability grid
- `list-grid-badge-card`: cards with small labels
- `list-row-horizontal-icon-arrow`: process-like list, but lower sequence emphasis
- `list-column-done-list`: checklist narrative
- `list-pyramid-*`: layered list
- `list-zigzag-*`: alternating row story

Flazz default:

- use `boxes` for card grids
- use `text-visual` for checklists
- use `pyramid` for layered list
- use `timeline` or `roadmap` if order matters

### Quadrant

Use when two axes explain the slide.

- `quadrant-quarter-simple-card`: clean four-box matrix
- `quadrant-quarter-circular`: circular four-quadrant concept
- `quadrant-simple-illus`: quadrant with supporting visual

Flazz default:

- use `quadrant` with explicit `xAxisLabel` and `yAxisLabel`

### Relation

Use when nodes affect or depend on each other.

- `relation-circle-icon-badge`: hub-and-spoke ecosystem
- `relation-circle-circular-progress`: circular relationship map
- `relation-dagre-flow-lr-*`: left-to-right dependency flow
- `relation-dagre-flow-tb-*`: top-to-bottom flow

Flazz default:

- use `relation` for hub-and-spoke
- use `timeline` or `roadmap` for directional flow until a dedicated flow helper is needed

### Sequence

Use when order or progression is the message.

- `sequence-timeline-*`: chronological timeline
- `sequence-roadmap-vertical-*`: phased roadmap
- `sequence-steps-*`: simple step process
- `sequence-circle-arrows-indexed-card`: circular repeated process
- `sequence-pyramid-simple`: progressive layered sequence
- `sequence-ascending-steps`: staircase/maturity path
- `sequence-horizontal-zigzag-*`: alternating process narrative
- `sequence-funnel-simple`: narrowing pipeline or filtering

Flazz default:

- use `timeline` for chronological order
- use `roadmap` for strategic phases
- use `cycle` for repeated loops
- use `staircase` for maturity/growth paths
- use `pyramid` for layered progression

## Selection Rules

- Pick the content structure first, then the visual family.
- Prefer `boxes` over `text-visual` when there are 4-6 peer ideas.
- Prefer `roadmap` over `timeline` when stages are strategic rather than chronological.
- Prefer `relation` over `hierarchy` when nodes connect around a shared center.
- Prefer `pyramid` over `hierarchy` when levels imply foundation, priority, or maturity.
- Prefer `staircase` over `roadmap` when each step is higher or more advanced than the previous one.
- Prefer `cycle` only when the last stage loops back to the first.

## Do Not Port

These parts of `presentation-ai` are intentionally not copied:

- Next.js editor, auth, database, and application state
- XML slide parser/runtime
- `@antv/infographic` dependency
- animation-specific templates
- generated HTML/image export pipeline

The useful part for Flazz is the planning taxonomy, not the whole app.
