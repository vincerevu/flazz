# QA Process & Common Pitfalls

## QA Process

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

### Content QA

```bash
python -m markitdown output.pptx
```

Check for missing content, typos, wrong order.

Check for language consistency. A Vietnamese deck must not contain accidental English or Chinese fragments in visible slide text. An English deck must not contain accidental Vietnamese or Chinese fragments. Mixed-language source material must be normalized into the deck language unless the user explicitly requested bilingual/multilingual slides.

Common failure examples:

- `Ôm /亲吻 chào tạm biệt`
- `Vỗ vai / high-five`
- `Chạm Touch Không An Toàn`
- English labels such as `Best practices`, `Use cases`, or `Summary` inside an otherwise Vietnamese deck

**Check for leftover placeholder text:**

```bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|placeholder|this.*(page|slide).*layout"
```

If grep returns results, fix them before declaring success.

### Verification Loop

1. Generate slides -> Extract text with `python -m markitdown output.pptx` -> Review content
2. **List issues found** (if none found, look again more critically)
3. Fix issues
4. **Re-verify affected slides** — one fix often creates another problem
5. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

### Per-Slide QA (for from-scratch creation)

```bash
python -m markitdown slide-XX-preview.pptx
```

Check for missing content, placeholder text, missing page number badge.

---

## Common Mistakes to Avoid

- **Don't repeat the same layout** — vary columns, cards, and callouts across slides
- **Don't center body text** — left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** — titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** — pick colors that reflect the specific topic
- **Don't mix spacing randomly** — choose 0.3" or 0.5" gaps and use consistently
- **Don't style one slide and leave the rest plain** — commit fully or keep it simple throughout
- **Don't create text-only slides** — add images, icons, charts, or visual elements; avoid plain title + bullets
- **Don't skip layout planning** — every content slide needs `slideSpec.layoutFamily` before drawing
- **Don't hand-position standard layouts** — use helpers for comparison, timeline, roadmap, hierarchy, quadrant, data, stats, and media
- **Don't generate monolithic deck scripts** — one file with many `pres.addSlide()` calls bypasses per-slide validation and usually regresses quality
- **Don't define local bullet helpers** — `addBullets()` and `addTwoColBullets()` usually type fake bullets; use `addBulletList()` or structured layout helpers
- **Don't mix languages** — lock the deck to one primary language and translate visible text into it
- **Don't use slash glosses** — avoid visible text like `ôm / hug`, `an toàn / safe`, or `ôm /亲吻`; use one term in the deck language
- **Don't cluster icons** — use at most one icon/emoji per row, card, title, or label; never write icon strings like `👶👧👦👨`
- **Don't hand-space numbered rows** — use `addSummaryRows()` with `rowHeight` or a layout `h` so titles and descriptions cannot overlap
- **Don't forget text box padding** — when aligning lines or shapes with text edges, set `margin: 0` on the text box or offset the shape to account for padding
- **Don't use low-contrast elements** — icons AND text need strong contrast against the background
- **NEVER use accent lines under titles** — these are a hallmark of AI-generated slides; use whitespace or background color instead
- **NEVER use "#" with hex colors** — causes file corruption in PptxGenJS
- **NEVER encode opacity in hex strings** — use the `opacity` property instead
- **NEVER use async/await in createSlide()** — compile.js won't await
- **NEVER reuse option objects across PptxGenJS calls** — PptxGenJS mutates objects in-place
- **NEVER type fake bullets into text** — use real bullet formatting, not `•`, `*`, `-`, or `✓`
- **NEVER pack multiple ideas into one bullet** — split dense source text into multiple bullets or rows
- **NEVER draw a content slide without `slideSpec`** — the validator should fail content slides with missing layout metadata
- **NEVER create slides in `index.js`** — use `slide-01.js`, `slide-02.js`, and `compile.js`

---

## Critical Pitfalls — PptxGenJS

### NEVER use async/await in createSlide()

```javascript
// WRONG - compile.js won't await
async function createSlide(pres, theme) { ... }

// CORRECT
function createSlide(pres, theme) { ... }
```

### NEVER use "#" with hex colors

```javascript
color: "FF0000"      // CORRECT
color: "#FF0000"     // CORRUPTS FILE
```

### NEVER encode opacity in hex strings

```javascript
shadow: { color: "00000020" }              // CORRUPTS FILE
shadow: { color: "000000", opacity: 0.12 } // CORRECT
```

### Prevent text wrapping in titles

```javascript
// Use fit:'shrink' for long titles
slide.addText("Long Title Here", {
  x: 0.5, y: 2, w: 9, h: 1,
  fontSize: 48, fit: "shrink"
});
```

### Keep bullets atomic

```javascript
// WRONG
slide.addText("• 72% deployed AI. Spend hit $154B. 40% increased investment.", { ... });

// CORRECT
slide.addText([
  { text: "72% of businesses deployed AI", options: { bullet: true, breakLine: true } },
  { text: "AI spending reached $154B in 2023", options: { bullet: true, breakLine: true } },
  { text: "40% increased AI investment in 2024", options: { bullet: true } }
], { ... });
```

### Force bullets onto separate lines

```javascript
// WRONG: separate bullet entries but no breakLine
slide.addText([
  { text: "Point one", options: { bullet: true } },
  { text: "Point two", options: { bullet: true } }
], { ... });

// CORRECT: each bullet breaks to its own line
slide.addText([
  { text: "Point one", options: { bullet: true, breakLine: true } },
  { text: "Point two", options: { bullet: true, breakLine: true } },
  { text: "Point three", options: { bullet: true } }
], { ... });
```

### Validate bullet source before preview

Run:

```bash
node packages/core/src/application/assistant/skills/create-presentations/scripts/validate-slide-bullets.cjs slides/slide-XX.js
```

The validator fails when:

- typed bullet characters are used inside `slide.addText(...)`
- local bullet helpers such as `addBullets()` are defined
- one file contains multiple `pres.addSlide()` calls
- an `index.js` file creates slides directly
- non-final bullet entries omit `breakLine: true`
- a bullet list contains a single oversized bullet
- a bullet item is too dense and should be split into multiple rows

### NEVER reuse option objects across calls

```javascript
// WRONG
const shadow = { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 };
slide.addShape(pres.shapes.RECTANGLE, { shadow, ... });
slide.addShape(pres.shapes.RECTANGLE, { shadow, ... });

// CORRECT - factory function
const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 });
slide.addShape(pres.shapes.RECTANGLE, { shadow: makeShadow(), ... });
slide.addShape(pres.shapes.RECTANGLE, { shadow: makeShadow(), ... });
```
