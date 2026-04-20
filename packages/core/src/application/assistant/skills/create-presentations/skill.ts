export default String.raw`
# PowerPoint (PPTX) Generation Skill

This skill allows you to generate professional PowerPoint presentations (.pptx) using the PptxGenJS library. Unlike PDF exports, these are native PowerPoint files that the user can open and edit.

## Overview

You will create presentations from scratch by writing a set of JavaScript files (one per slide) and a compiler script. You must follow a strict design system and use specialized sub-agents if the presentation is long.

## Core Workflow

1.  **Research**: Understand topic, audience, and tone. Use \`research-search\` and \`workspace-readFile\` to find relevant data in the user's memory (e.g., project details, contact info, recent commits).
2.  **Design Selection**: Pick a Color Palette and Style Recipe (Sharp, Soft, Rounded, or Pill) from the Design System below.
3.  **Content Planning**: Classify every slide as one of the 5 slide types (Cover, TOC, Divider, Content, Summary).
4.  **Generation**: 
    - Create a directory \`slides/\` in the current workspace.
    - Generate JS modules for each slide (e.g., \`slide-01.js\`).
    - **Concurrency**: If there are many slides, use sub-agents to generate slides 01-05, 06-10, etc., in parallel.
5.  **Dependency Check (Just-In-Time)**: 
    - Before compile, check if \`pptxgenjs\` is available in the current project environment.
    - If missing, run \`npm install pptxgenjs --no-save\` (or equivalent) in a temporary \`slides/\` directory within the workspace to avoid bloating the core application.
6.  **Compilation & Execution**: 
    - Create a \`compile.js\` that imports all slides and uses \`pptxgenjs\`.
    - Run \`node compile.js\` via \`executeCommand\`. Ensure the execution context can access the locally installed \`node_modules\`.
7.  **Delivery**: Notify the user where the \`.pptx\` file is located.

---

## 1. Design System & Style Recipes

### Style Selection
| Style | Corner Radius | Spacing | Best For |
|-------|--------------|---------|----------|
| **Sharp & Compact** | 0 ~ 0.05" | Tight | Data-dense, tables, professional reports |
| **Soft & Balanced** | 0.08" ~ 0.12" | Moderate | Corporate, business presentations, general use |
| **Rounded & Spacious** | 0.15" ~ 0.25" | Relaxed | Product intros, marketing, creative showcases |
| **Pill & Airy** | 0.3" ~ 0.5" | Open | Brand showcases, launch events, premium presentations |

### Color Palette (Examples)
- **Business**: #2b2d42 (Navy), #8d99ae (Gray), #ef233c (Red)
- **Tech Night**: #000814 (Black), #003566 (Dark Blue), #ffd60a (Yellow)
- **Luxury**: #22223b (Deep Purple), #4a4e69 (Slate), #f2e9e4 (Cream)

### Font Rules
- **English**: Arial (Default), Georgia (Serif), Calibri (Clean).
- **Chinese**: Microsoft YaHei.
- **Strict Rule**: Body text must NOT be bold. Bold is for titles only.

---

## 2. Slide Layout Types

### Type 1: Cover Page
- Dynamic opening. Use large titles (72-120px) and a clear focal point.

### Type 2: Table of Contents (TOC)
- Navigation for 3-5 sections. Use clear numbering and consistent spacing.

### Type 3: Section Divider
- Used for transitions. Feature a dramatic section number (72-120px) and a bold title (36-48px).

### Type 4: Content Page
- **Text Subtype**: Bullets + Icons (never plain text only).
- **Data Subtype**: Charts (Bar, Line, Donut) + Key takeaways.
- **Comparison Subtype**: Side-by-side cards or columns.
- **Process Subtype**: Timelines or flow diagrams with arrows.

### Type 5: Summary / Closing
- Wrap-up items or "Thank You" with contact info.

---

## 3. Technical Implementation (PptxGenJS)

### Slide Module Format (e.g., slide-01.js)
\`\`\`javascript
const pptxgen = require("pptxgenjs");

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  
  // Title
  slide.addText("Slide Title", {
    x: 0.5, y: 0.4, w: 9, h: 0.8,
    fontSize: 36, fontFace: "Arial",
    color: theme.primary, bold: true
  });

  // Example Shape with Style Recipe (Soft)
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.5, w: 4, h: 2,
    fill: { color: theme.secondary },
    rectRadius: 0.1
  });

  // MUST include page number (except on Cover)
  addPageBadge(slide, theme, "01");
}

function addPageBadge(slide, theme, num) {
  slide.addShape("oval", { x: 9.3, y: 5.1, w: 0.4, h: 0.4, fill: { color: theme.accent } });
  slide.addText(num, { x: 9.3, y: 5.1, w: 0.4, h: 0.4, color: "FFFFFF", align: "center", valign: "middle", fontSize: 10 });
}

module.exports = { createSlide };
\`\`\`

### Compiler Format (compile.js)
\`\`\`javascript
const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";

const theme = {
  primary: "22223b", secondary: "4a4e69", accent: "9a8c98", bg: "f2e9e4"
};

require("./slide-01.js").createSlide(pres, theme);
require("./slide-02.js").createSlide(pres, theme);
// ... more slides

pres.writeFile({ fileName: "presentation.pptx" });
\`\`\`

## 4. Specialized Generators (Sub-agents)
For complex slides, refer to the following specialized guides in the \`generators/\` directory of this skill:
- **Cover Page**: \`cover-page-generator.md\`
- **Table of Contents**: \`table-of-contents-generator.md\`
- **Section Divider**: \`section-divider-generator.md\`
- **Content & Data Page**: \`content-page-generator.md\`
- **Final Summary**: \`summary-page-generator.md\`

If you need to delegate, ensure the sub-agent receives the relevant specialist instruction via its system prompt.

## 5. Sub-Agent Coordination
If the user requests more than 5 slides, you **must delegate** groups of slides to specialized sub-agents.
- Agent A: Slides 01-05 (Introduction & Context)
- Agent B: Slides 06-10 (Data & Analysis)
- Agent C: Slides 11-15 (Summary & Closing)

## Critical Constraints
- **NO placeholders**: Find real data or use relevant analogies based on the user's workspace memory.
- **NO external images**: Use PptxGenJS shapes (RECTANGLE, OVAL, LINE) and icons to build visuals.
- **Native File**: The final output must be a valid .pptx file readable by Microsoft PowerPoint and Google Slides.
`
