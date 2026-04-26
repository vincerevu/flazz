export const skill = String.raw`
# PowerPoint (PPTX) Creation And Editing Skill

Use this skill when the user wants a native PowerPoint deck: create a new \`.pptx\`, revise an existing presentation, adapt a template, or inspect presentation content. The output must be an editable PowerPoint file, not a PDF export.

## What This Skill Covers

- Read and analyze \`.pptx\` content with \`audit-pptx\`
- Create a deck from scratch with PptxGenJS
- Edit an existing \`.pptx\` template via XML-safe workflows
- Choose palette, font pairing, and style recipe before slide generation
- Generate slide-specific JS modules and compile them into a final deck
- Run a QA loop that checks content and catches leftover placeholders

## Files In This Skill

### References

- \`references/slide-types.md\`
  Slide taxonomy, layout options, and subtype rules
- \`references/layout-taxonomy.md\`
  Structured content-slide layout families, slideSpec rules, and helper mapping
- \`references/infographic-template-catalog.md\`
  Presentation-ai-inspired infographic template families mapped to Flazz helpers
- \`references/design-system.md\`
  Color palettes, font pairings, style recipes, typography, spacing, and palette constraints
- \`references/editing.md\`
  Template editing workflow and XML-specific safety rules
- \`references/pitfalls.md\`
  QA loop and PptxGenJS failure modes
- \`references/pptxgenjs.md\`
  Detailed PptxGenJS API reference

### Generators

- \`generators/cover-page-generator.md\`
- \`generators/table-of-contents-generator.md\`
- \`generators/section-divider-generator.md\`
- \`generators/content-page-generator.md\`
- \`generators/summary-page-generator.md\`

Use the generator files when writing a specific slide. Use the reference files before making design decisions.

---

## Quick Routing

## Dependency Preflight

PptxGenJS and JSZip are app Node dependencies. Do not run \`npm install\`, \`pnpm add\`, \`yarn add\`, \`npx\`, or global npm installs in the user's workspace for built-in PPTX generation or QA helpers.

This PPTX skill is Node-only. Do not use Python, \`markitdown\`, \`pip install\`, or any Python fallback for presentation generation, preview QA, or PPTX text extraction.

Check that the app-provided Node dependency path can resolve the required libraries:

\`\`\`cmd
node -e "require('pptxgenjs'); require('jszip'); console.log('pptx stack ok')"
\`\`\`

If this fails with \`Cannot find module\`, stop and report an app packaging/runtime dependency issue. Do not install npm packages into the user's workspace as a workaround.

### If the user wants to inspect or summarize an existing presentation

Use:

\`\`\`cmd
node "%FLAZZ_SKILL_ROOT%\create-presentations\scripts\audit-pptx.cjs" presentation.pptx
\`\`\`

### If the user wants to create a new deck from scratch

Use the from-scratch workflow below.

### If the user wants to edit a template or existing deck

Use the workflow in \`references/editing.md\`.

---

## Non-Negotiable Rules

### Native output only

The final artifact must be a valid \`.pptx\` file readable by Microsoft PowerPoint and Google Slides.

### Design decisions are required up front

Before generating slides, explicitly decide:

1. Audience and presentation goal
2. Color palette
3. Font pairing
4. Style recipe
5. Deck language
6. Slide outline, slide types, and content-slide layout families

Do not let the model improvise visual direction slide-by-slide.

### Phase order is mandatory

Follow this sequence in order:

1. Planning: audience, goal, language, palette, font pairing, style recipe, outline
2. Specification: write \`slideSpec\` for every content slide
3. Content modeling: define \`contentModel\` for each slide as plain arrays/objects
4. Rendering: call the approved layout helper for that slide's \`layoutFamily\`
5. Validation: run \`validate-slide-bullets.cjs\` on the source slide modules
6. Compile: build the final \`.pptx\`
7. Audit: run \`audit-pptx.cjs\` on the compiled deck

Do not skip directly from prompt to drawing code.

### Use one deck language

Lock the deck to one primary language before writing slide text. If the user writes in Vietnamese, the deck language is Vietnamese unless they explicitly ask otherwise.

Do not mix Vietnamese, English, Chinese, or other languages in visible slide text. Translate headings, bullets, labels, callouts, captions, sources, and notes into the deck language. Keep foreign text only when it is a proper noun, acronym, product name, legal quote, or the user explicitly asks for bilingual/multilingual teaching material.

Do not write slash glosses like "ôm / hug", "ôm /亲吻", "an toàn / safe", or "high-five" in a Vietnamese deck. Choose the deck-language term and, if needed, explain the foreign term in speaker notes instead of visible slide text.

For Vietnamese decks, use natural Vietnamese copy. Avoid English section labels such as "Design", "Best practices", "Use cases", "Summary", "Option A", "Takeaway", unless the user explicitly requested English.

### Use only approved palette colors

Colors must come from the chosen palette. Do not invent extra colors. Do not use gradients. Do not encode opacity in hex strings.

### Body text is not bold

Bold is reserved for titles, section headers, and emphasis labels. Body copy, captions, legends, and footnotes stay regular weight.

### Avoid generic deck structure

Do not produce a deck that is just repeated \`title + bullets\` slides. Content slides must vary in layout and include non-text visual structure.

### One slide per module

Never generate a monolithic \`index.js\` that creates the whole deck. Every slide must live in its own \`slide-XX.js\` module and the deck must be assembled by \`compile.js\`.

### No local presentation helpers

Do not define local helpers such as \`addBullets()\`, \`addTwoColBullets()\`, \`addTitleSlide()\`, or local chart/card renderers when an approved helper exists. Use the skill's bundled helper scripts so layout, bullets, and validation stay consistent.

### Icon layout must be normalized

Use at most one visible icon per item, card, or heading label.

When a slide shows icons next to text, reserve a fixed icon slot and a fixed text start position. Do not position text relative to each icon's natural bounding box, because different SVGs and glyphs have different padding and will look misaligned.

Do not stack multiple icons tightly before one label. If a concept needs multiple signals, pick one primary icon and express the rest with text or color.

### QA is mandatory

Do not stop after first render. Run at least one fix-and-verify cycle.

### Overflow must be fixed structurally

If a slide is out of bounds, overlaps, or becomes dense enough that text crowds edges or spills past its frame, do not treat font shrinking as the primary fix.

Use this remediation order:

1. Shorten copy so each row, card, or bullet contains only one idea
2. Increase available width by reducing the number of columns or switching layout family
3. Split the content across two slides if the structure is still crowded
4. Use \`fit: "shrink"\` only for titles or very short labels, never as the main rescue plan for full tables or dense body text

For comparison slides with many text-heavy columns, do not force a wide table. Prefer cards, box grids, or a two-slide sequence.

---

## From-Scratch Workflow

### Step 1: Understand requirements

Determine:

- Topic
- Audience
- Goal
- Tone
- Expected slide count
- Primary deck language
- Whether the deck is data-heavy, narrative-heavy, or template-driven

Search workspace context when the deck depends on project details, company context, contacts, metrics, or prior notes.

If the user does not specify language, infer it from the user's request. Vietnamese prompt -> Vietnamese deck. English prompt -> English deck. If source material contains multiple languages, normalize all visible copy into the primary deck language unless the user explicitly asks to preserve bilingual source text.

### Step 2: Choose palette and fonts

Before generating any slide, read:

- \`references/design-system.md\`

Then select:

- One color palette that matches the subject and audience
- One header/body font pairing
- One style recipe: \`Sharp & Compact\`, \`Soft & Balanced\`, \`Rounded & Spacious\`, or \`Pill & Airy\`

State the selection clearly in your internal plan and keep it consistent across the deck.

### Step 3: Plan the deck

Read:

- \`references/slide-types.md\`
- \`references/layout-taxonomy.md\`
- \`references/infographic-template-catalog.md\`

Classify every slide as exactly one of:

1. Cover
2. Table of Contents
3. Section Divider
4. Content
5. Summary / Closing

For content slides, choose both:

- a subtype such as text, comparison, timeline, data visualization, mixed media, or image showcase
- a \`layoutFamily\` from \`references/layout-taxonomy.md\`

Every content slide must have a concise \`slideSpec\` with \`type\`, \`index\`, \`title\`, \`layoutFamily\`, \`layoutVariant\`, and \`density\` before any drawing code.

Every content slide must also lock \`language\` in \`slideSpec\`.

### Step 4: Set up output structure

Create a working directory like:

\`\`\`text
slides/
|- slide-01.js
|- slide-02.js
|- ...
|- imgs/
\- output/
   \- presentation.pptx
\`\`\`

Do not create \`slides/index.js\` as the deck generator. \`index.js\` monoliths are invalid for this skill because they bypass per-slide validation and usually regress into fake bullets and hand-positioned layouts.

### Step 5: Generate slide modules

Each slide must be a synchronous JS module exporting \`createSlide(pres, theme)\`.

Each slide module creates exactly one slide. If a file contains more than one \`pres.addSlide()\`, it is invalid and must be split.

For every content slide, define:

- \`const slideSpec = { ... }\`
- \`const contentModel = { ... }\`

\`contentModel\` must contain the plain content arrays/objects that are passed into the approved helper. Do not mix content discovery with drawing coordinates.

Use the relevant generator file for the slide you are writing:

- Cover -> \`generators/cover-page-generator.md\`
- TOC -> \`generators/table-of-contents-generator.md\`
- Section Divider -> \`generators/section-divider-generator.md\`
- Content -> \`generators/content-page-generator.md\`
- Summary -> \`generators/summary-page-generator.md\`

If the deck is large, split slide generation into batches. Keep each worker responsible for a disjoint slide range. Every slide must still follow the same palette, typography, and style recipe.

For bullet-heavy slides, do not let the model handcraft bullet text runs directly. Use the shared helper in:

- \`scripts/pptx-bullet-helpers.cjs\`
- \`scripts/pptx-summary-helpers.cjs\`
- \`scripts/pptx-process-helpers.cjs\`
- \`scripts/pptx-comparison-helpers.cjs\`
- \`scripts/pptx-data-helpers.cjs\`
- \`scripts/pptx-stat-helpers.cjs\`
- \`scripts/pptx-media-helpers.cjs\`
- \`scripts/pptx-hierarchy-helpers.cjs\`
- \`scripts/pptx-quadrant-helpers.cjs\`
- \`scripts/pptx-roadmap-helpers.cjs\`
- \`scripts/pptx-infographic-helpers.cjs\`

The model should first decide the content as plain arrays or objects inside \`contentModel\`, then render with the helper.

Before preview or deck compile, validate every content-bearing slide module:

\`\`\`cmd
node "%FLAZZ_SKILL_ROOT%\create-presentations\scripts\validate-slide-bullets.cjs" slides/slide-02.js
\`\`\`

For whole-deck validation, validate all slide modules before compiling:

\`\`\`cmd
node "%FLAZZ_SKILL_ROOT%\create-presentations\scripts\validate-slide-bullets.cjs" slides/slide-*.js
\`\`\`

If the validator reports monolithic files, local bullet helpers, dense bullets, fake bullets, missing \`slideSpec\`, or missing \`breakLine: true\`, rewrite the slide code before compiling.

Preferred bullet pattern:

\`\`\`javascript
const { addBulletList } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-bullet-helpers.cjs");

const slideSpec = {
  type: "content",
  index: 2,
  title: "Water overview",
  layoutFamily: "text-visual",
  layoutVariant: "single-column-bullets",
  density: "medium",
  language: "vi",
};

const contentModel = {
  bulletItems: [
    "Water exists in three common states",
    "Solid, liquid, and gas change through phase transitions",
    "Water covers about 71% of Earth's surface",
  ],
};

addBulletList(slide, contentModel.bulletItems, { x: 0.9, y: 1.8, w: 8.1, h: 2.3 }, {
  fontSize: 18,
  fontFace: "Georgia",
  color: theme.secondary,
  paraSpaceAfterPt: 10,
});
\`\`\`

Preferred summary/takeaway row pattern:

\`\`\`javascript
const { addSummaryRows } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-summary-helpers.cjs");

const contentModel = {
  takeawayItems: [
    { title: "Water is foundational", body: "It supports life and appears in solid, liquid, and gas form." },
    { title: "State changes matter", body: "Phase transitions explain evaporation, melting, and condensation." },
    { title: "Its reach is global", body: "Water covers most of Earth's surface and shapes climate systems." },
  ],
};

addSummaryRows(slide, contentModel.takeawayItems, {
  x: 0.9,
  y: 1.6,
  w: 7.8,
  h: 3.6,
  rowGap: 0.18,
  titleFontFace: "Georgia",
  bodyFontFace: "Calibri",
}, theme);
\`\`\`

For vertical numbered guidance, do not hand-position "1", "2", "3" rows with fixed "y += 0.4" spacing. Use addSummaryRows() with "h" or "rowHeight" so wrapped titles and body text cannot collide.

Preferred process/timeline pattern:

\`\`\`javascript
const { addProcessTimeline } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-process-helpers.cjs");

const contentModel = {
  steps: [
    { label: "Evaporation", caption: "Liquid water becomes vapor" },
    { label: "Condensation", caption: "Vapor cools into droplets" },
    { label: "Precipitation", caption: "Water returns as rain or snow" },
    { label: "Collection", caption: "Water gathers in oceans and lakes" },
  ],
};

addProcessTimeline(slide, contentModel.steps, {
  x: 0.8,
  y: 1.7,
  w: 8.4,
  labelFontFace: "Georgia",
  captionFontFace: "Calibri",
}, theme);
\`\`\`

Preferred comparison pattern:

\`\`\`javascript
const { addComparisonCards } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-comparison-helpers.cjs");

const contentModel = {
  columns: [
    { title: "Liquid Water", items: ["Flows freely", "Takes container shape", "Supports most daily use cases"] },
    { title: "Ice", items: ["Keeps fixed shape", "Expands when frozen", "Floats on liquid water"] },
  ],
};

addComparisonCards(slide, contentModel.columns, {
  x: 0.8,
  y: 1.5,
  w: 8.4,
  h: 2.8,
  titleFontFace: "Georgia",
  bodyFontFace: "Calibri",
}, theme);
\`\`\`

Preferred data-visualization pattern:

\`\`\`javascript
const { addBarChartWithTakeaways } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-data-helpers.cjs");

const contentModel = {
  chartData: {
    series: [
      { label: "Ice", value: 25 },
      { label: "Liquid", value: 60 },
      { label: "Vapor", value: 15 },
    ],
    takeaways: [
      "Liquid water dominates daily use",
      "Solid and gas forms matter in climate systems",
    ],
    source: "Classroom summary dataset",
  },
};

addBarChartWithTakeaways(slide, contentModel.chartData, {
  x: 0.8,
  y: 1.5,
  w: 8.4,
  h: 2.9,
  labelFontFace: "Georgia",
  bodyFontFace: "Calibri",
}, theme);
\`\`\`

Preferred stat-grid pattern:

\`\`\`javascript
const { addStatCardGrid } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-stat-helpers.cjs");

const contentModel = {
  statCards: [
    { value: "71%", label: "Earth's surface covered by water", detail: "Most of it is ocean water." },
    { value: "60%", label: "Adult body water content", detail: "Hydration supports core body functions." },
    { value: "3%", label: "Freshwater share", detail: "Accessible freshwater remains limited." },
    { value: "1.5B", label: "People facing water stress", detail: "Water management stays a global issue." },
  ],
};

addStatCardGrid(slide, contentModel.statCards, {
  x: 0.8,
  y: 1.55,
  w: 8.4,
  h: 3.0,
  valueFontFace: "Georgia",
  labelFontFace: "Calibri",
  detailFontFace: "Calibri",
}, theme);
\`\`\`

Preferred mixed-media pattern:

\`\`\`javascript
const { addMixedMediaPanel } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-media-helpers.cjs");

const contentModel = {
  mediaPanel: {
    imagePath: "./imgs/water-cycle.png",
    title: "Water moves through a continuous cycle",
    bullets: [
      "Evaporation lifts water vapor into the atmosphere",
      "Condensation forms clouds and droplets",
      "Precipitation returns water to land and oceans",
    ],
    caption: "Illustrative diagram of the water cycle",
  },
};

addMixedMediaPanel(slide, contentModel.mediaPanel, {
  x: 0.8,
  y: 1.45,
  w: 8.4,
  h: 3.15,
  imageSide: "right",
  titleFontFace: "Georgia",
  bodyFontFace: "Calibri",
}, theme);
\`\`\`

Preferred hierarchy pattern:

\`\`\`javascript
const { addHierarchyStack } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-hierarchy-helpers.cjs");

const contentModel = {
  hierarchyNodes: [
    { title: "Water systems", detail: "The broad system that connects climate, ecosystems, and daily use." },
    { title: "Natural cycle", detail: "Evaporation, condensation, precipitation, and collection." },
    { title: "Human usage", detail: "Agriculture, industry, energy, sanitation, and household needs." },
    { title: "Risk layer", detail: "Pollution, scarcity, flooding, and infrastructure pressure." },
  ],
};

addHierarchyStack(slide, contentModel.hierarchyNodes, {
  x: 0.8,
  y: 1.35,
  w: 8.4,
  h: 3.35,
  titleFontFace: "Georgia",
  detailFontFace: "Calibri",
}, theme);
\`\`\`

Preferred quadrant pattern:

\`\`\`javascript
const { addQuadrantMatrix } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-quadrant-helpers.cjs");

const contentModel = {
  quadrants: [
    { title: "High impact / Low effort", items: ["Quick education campaigns", "Leak detection basics"] },
    { title: "High impact / High effort", items: ["Infrastructure renewal", "Large-scale treatment"] },
    { title: "Low impact / Low effort", items: ["Simple reminders", "Usage nudges"] },
    { title: "Low impact / High effort", items: ["Low-priority custom systems"] },
  ],
};

addQuadrantMatrix(slide, contentModel.quadrants, {
  x: 0.9,
  y: 1.35,
  w: 8.0,
  h: 3.25,
  titleFontFace: "Georgia",
  bodyFontFace: "Calibri",
  xAxisLabel: "Effort",
  yAxisLabel: "Impact",
}, theme);
\`\`\`

Preferred roadmap pattern:

\`\`\`javascript
const { addRoadmap } = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-roadmap-helpers.cjs");

const contentModel = {
  roadmapStages: [
    { tag: "Now", label: "Understand", caption: "Map core facts and current constraints." },
    { tag: "Next", label: "Prioritize", caption: "Focus on the most important risks and opportunities." },
    { tag: "Later", label: "Act", caption: "Turn decisions into measurable interventions." },
  ],
};

addRoadmap(slide, contentModel.roadmapStages, {
  x: 0.75,
  y: 1.65,
  w: 8.5,
  h: 2.55,
  tagFontFace: "Calibri",
  labelFontFace: "Georgia",
  captionFontFace: "Calibri",
}, theme);
\`\`\`

Preferred infographic pattern:

\`\`\`javascript
const {
  addRelationMap,
  addCycleDiagram,
  addPyramid,
  addStaircase,
  addBoxGrid,
} = require(process.env.FLAZZ_SKILL_ROOT + "/create-presentations/scripts/pptx-infographic-helpers.cjs");

const contentModel = {
  relationData: {
    center: { title: "Water security", detail: "Shared system pressure" },
    nodes: [
      { title: "Climate", detail: "Drought and flood volatility" },
      { title: "Agriculture", detail: "Irrigation demand" },
      { title: "Cities", detail: "Infrastructure and sanitation" },
      { title: "Industry", detail: "Energy and production needs" },
    ],
  },
};

addRelationMap(slide, contentModel.relationData, {
  cx: 5,
  cy: 3,
  radius: 1.65,
  titleFontFace: "Georgia",
  detailFontFace: "Calibri",
}, theme);
\`\`\`

### Step 6: Use the theme contract

The compile script must pass a theme object with these exact keys:

- \`theme.primary\`
- \`theme.secondary\`
- \`theme.accent\`
- \`theme.light\`
- \`theme.bg\`

Do not rename these keys.

### Step 7: Add page number badges

All slides except the cover must include a page number badge in the bottom-right corner.

- Position: \`x: 9.3\`, \`y: 5.1\`
- Show current slide number only, not total count

### Step 8: Compile

Create \`slides/compile.js\` and compile the modules into a single \`.pptx\`.

Example:

\`\`\`javascript
const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";

const theme = {
  primary: "22223b",
  secondary: "4a4e69",
  accent: "9a8c98",
  light: "c9ada7",
  bg: "f2e9e4",
};

for (let i = 1; i <= 12; i++) {
  const num = String(i).padStart(2, "0");
  const slideModule = require(\`./slide-\${num}.js\`);
  slideModule.createSlide(pres, theme);
}

pres.writeFile({ fileName: "./output/presentation.pptx" });
\`\`\`

### Step 9: QA

Read:

- \`references/pitfalls.md\`

Run content QA:

\`\`\`cmd
node "%FLAZZ_SKILL_ROOT%\create-presentations\scripts\audit-pptx.cjs" output/presentation.pptx
\`\`\`

For structured post-render QA:

\`\`\`cmd
node "%FLAZZ_SKILL_ROOT%\create-presentations\scripts\audit-pptx.cjs" output/presentation.pptx --json
\`\`\`

Run bullet-structure QA on the source files before or alongside preview QA:

\`\`\`cmd
node "%FLAZZ_SKILL_ROOT%\create-presentations\scripts\validate-slide-bullets.cjs" slides/slide-*.js
\`\`\`

Check for:

- Missing content
- Wrong order
- Placeholder text
- Page badge omissions
- Broken hierarchy or repeated layouts
- Mixed visible languages
- More than one icon in the same visible label
- Icon/text misalignment caused by variable icon widths
- Out-of-bounds shapes or text boxes
- Text box overlap after render
- Text boxes that are too dense even if they do not overlap yet

Check placeholder residue:

\`\`\`cmd
node "%FLAZZ_SKILL_ROOT%\create-presentations\scripts\audit-pptx.cjs" output/presentation.pptx
\`\`\`

If anything is wrong, fix the affected slides and verify again.

---

## Template Editing Workflow

When the user provides an existing \`.pptx\` and wants edits, do not rebuild it from scratch unless that is clearly the better option. Use the template workflow in \`references/editing.md\`.

High-level sequence:

1. Copy the original deck to a working file such as \`template.pptx\`
2. Extract text with \`audit-pptx.cjs\`
3. Inspect the slide structure
4. Complete structural operations first: delete, duplicate, reorder
5. Edit slide XML content
6. Clean orphaned artifacts
7. Repack and validate
8. Run QA on the edited result

Critical editing rules:

- Never manually clone slide files without updating relationships and content types
- Remove excess visual groups when source content has fewer items than the template
- Use separate XML paragraphs for separate items
- Preserve formatting and spacing attributes when editing XML

---

## Technical Constraints

### Slide module format

Each slide module should follow this shape:

\`\`\`javascript
const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "cover",
  index: 1,
  title: "Presentation Title",
};
\`\`\`

Content slides must use \`slideSpec\` instead:

\`\`\`javascript
const slideSpec = {
  type: "content",
  index: 4,
  title: "Presentation Title",
  layoutFamily: "hierarchy",
  layoutVariant: "stacked-layered-cards",
  density: "medium",
  language: "vi",
};
\`\`\`

The same file must also define \`contentModel\` as the structured payload passed into the layout helper:

\`\`\`javascript
const contentModel = {
  hierarchyNodes: [
    { title: "Topic A", detail: "Short supporting line." },
    { title: "Topic B", detail: "Another short supporting line." },
  ],
};
\`\`\`

Example module skeleton:

\`\`\`javascript
const pptxgen = require("pptxgenjs");

const slideConfig = {
  type: "cover",
  index: 1,
  title: "Presentation Title",
};

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  slide.addText(slideConfig.title, {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1.2,
    fontSize: 48,
    fontFace: "Arial",
    color: theme.primary,
    bold: true,
    align: "center",
  });

  return slide;
}

if (require.main === module) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  const theme = {
    primary: "22223b",
    secondary: "4a4e69",
    accent: "9a8c98",
    light: "c9ada7",
    bg: "f2e9e4",
  };
  createSlide(pres, theme);
  pres.writeFile({ fileName: "slide-01-preview.pptx" });
}

module.exports = { createSlide, slideConfig };
\`\`\`

### Important implementation constraints

- \`createSlide()\` must be synchronous
- Hex colors must not include \`#\`
- Do not reuse mutable options objects across multiple PptxGenJS calls
- Use \`fit: "shrink"\` when long titles risk overflow
- Avoid external image dependencies unless the user explicitly provides assets or the workflow requires them

---

## Visual Quality Standard

The deck should show intentional design choices, not generic automation artifacts.

Required qualities:

- Consistent palette and typography
- Clear hierarchy
- High contrast
- Layout variety across content slides
- Appropriate whitespace
- Clean closing slide

Avoid:

- Repeating the same layout across the deck
- Centered body text
- Low-contrast text or icons
- Decorative accent lines under titles
- Text-only content slides
- Defaulting every deck to blue palettes

---

## Recommended Dependencies

- \`pptxgenjs\` for generation
- \`jszip\` for Node-based PPTX extraction and QA

Use the app-provided Node dependencies. Do not install PPTX dependencies into the user's workspace as a workaround. If a temporary working directory is needed, keep it isolated from the main app source tree.
`;

export default skill;
