# XML Layout Reference

This reference ports the useful layout prompt patterns from `presentation-ai`.
Use it for planning and content modeling only. Flazz still renders native PPTX
with PptxGenJS helpers.

## Purpose

Use these layout tags as mental templates before choosing a Flazz
`layoutFamily`. They prevent repeated title-plus-bullets slides and force the
deck to contain visual structure.

## Section Layout Attribute

Every generated slide concept should vary its high-level composition:

- `layout="left"`: visual or accent panel on the left
- `layout="right"`: visual or accent panel on the right
- `layout="vertical"`: visual or accent band at the top
- `layout="background"`: image-led or high-impact cover/section slide

Do not use the same section layout more than twice in a row.

## Layout Tags

### COLUMNS

Use for balanced comparison or paired concepts.

```xml
<COLUMNS>
  <DIV><H3>First concept</H3><P>Short explanation.</P></DIV>
  <DIV><H3>Second concept</H3><P>Short explanation.</P></DIV>
</COLUMNS>
```

Flazz mapping: `comparison`, `boxes`, or `text-visual`.

### BULLETS

Use only for concise key points. Avoid making this the default.

```xml
<BULLETS>
  <DIV><H3>Main point</H3><P>One compact idea.</P></DIV>
  <DIV><H3>Second point</H3><P>One compact idea.</P></DIV>
</BULLETS>
```

Flazz mapping: `text-visual`.

### ICONS

Use for concepts that benefit from symbols.

```xml
<ICONS>
  <DIV icon="rocket"><H3>Innovation</H3><P>Short explanation.</P></DIV>
  <DIV icon="shield"><H3>Security</H3><P>Short explanation.</P></DIV>
</ICONS>
```

Flazz mapping: `boxes`, `stats`, or `text-visual` with normalized icon slots.

### CYCLE

Use for repeating loops and flywheels.

```xml
<CYCLE>
  <DIV><H3>Research</H3><P>Initial exploration.</P></DIV>
  <DIV><H3>Design</H3><P>Solution creation.</P></DIV>
  <DIV><H3>Implement</H3><P>Execution.</P></DIV>
  <DIV><H3>Evaluate</H3><P>Assessment.</P></DIV>
</CYCLE>
```

Flazz mapping: `cycle`.

### ARROWS

Use for cause-effect, before-to-after, or directional flows.

```xml
<ARROWS>
  <DIV><H3>Challenge</H3><P>Current problem.</P></DIV>
  <DIV><H3>Solution</H3><P>Intervention.</P></DIV>
  <DIV><H3>Result</H3><P>Outcome.</P></DIV>
</ARROWS>
```

Flazz mapping: `timeline`, `roadmap`, or `staircase`.

### ARROW-VERTICAL

Use for vertical step-by-step flows.

```xml
<ARROW-VERTICAL>
  <DIV><H3>Discover</H3><P>Research and requirements.</P></DIV>
  <DIV><H3>Design</H3><P>UX and architecture.</P></DIV>
  <DIV><H3>Deliver</H3><P>Build, test, deploy.</P></DIV>
</ARROW-VERTICAL>
```

Flazz mapping: `roadmap` or `staircase`.

### TIMELINE

Use for chronological progression.

```xml
<TIMELINE sidedness="single" orientation="horizontal">
  <DIV><H3>2024</H3><P>Milestone.</P></DIV>
  <DIV><H3>2025</H3><P>Milestone.</P></DIV>
  <DIV><H3>2026</H3><P>Milestone.</P></DIV>
</TIMELINE>
```

Flazz mapping: `timeline`.

### PYRAMID

Use for priority, foundations, hierarchy, funnels, or maturity layers.

```xml
<PYRAMID isFunnel="false">
  <DIV><H3>Vision</H3><P>Aspirational goal.</P></DIV>
  <DIV><H3>Strategy</H3><P>Key approach.</P></DIV>
  <DIV><H3>Tactics</H3><P>Concrete actions.</P></DIV>
</PYRAMID>
```

Flazz mapping: `pyramid`.

### STAIRCASE

Use for progressive capability or maturity.

```xml
<STAIRCASE>
  <DIV><H3>Basic</H3><P>Foundation.</P></DIV>
  <DIV><H3>Advanced</H3><P>Improved capability.</P></DIV>
  <DIV><H3>Expert</H3><P>Premium outcome.</P></DIV>
</STAIRCASE>
```

Flazz mapping: `staircase`.

### BOXES

Use for peer ideas, features, capability groups, or compact tiles.

```xml
<BOXES boxType="outline">
  <DIV><H3>Speed</H3><P>Faster delivery.</P></DIV>
  <DIV><H3>Quality</H3><P>Better checks.</P></DIV>
  <DIV><H3>Security</H3><P>Reduced risk.</P></DIV>
</BOXES>
```

Flazz mapping: `boxes`.

Useful visual variants: `outline`, `icon`, `solid`, `sideline`, `joined`,
`leaf`.

### COMPARE

Use for side-by-side alternatives.

```xml
<COMPARE>
  <DIV><H3>Option A</H3><LI>Strength.</LI><LI>Tradeoff.</LI></DIV>
  <DIV><H3>Option B</H3><LI>Strength.</LI><LI>Tradeoff.</LI></DIV>
</COMPARE>
```

Flazz mapping: `comparison`.

### BEFORE-AFTER

Use for transformations.

```xml
<BEFORE-AFTER>
  <DIV><H3>Before</H3><P>Current state.</P></DIV>
  <DIV><H3>After</H3><P>Improved state.</P></DIV>
</BEFORE-AFTER>
```

Flazz mapping: `comparison`.

### PROS-CONS

Use for tradeoffs.

```xml
<PROS-CONS>
  <PROS><H3>Pros</H3><LI>Benefit.</LI></PROS>
  <CONS><H3>Cons</H3><LI>Risk.</LI></CONS>
</PROS-CONS>
```

Flazz mapping: `comparison`.

### TABLE

Use only when rows and columns are the clearest form.

```xml
<TABLE>
  <TR><TH>Metric</TH><TH>Value</TH></TR>
  <TR><TD>Conversion</TD><TD>24%</TD></TR>
</TABLE>
```

Flazz mapping: `data` or table-specific rendering.

### CHART

Use for simple data stories.

```xml
<CHART charttype="bar">
  <DATA><LABEL>Q1</LABEL><VALUE>24</VALUE></DATA>
  <DATA><LABEL>Q2</LABEL><VALUE>36</VALUE></DATA>
</CHART>
```

Flazz mapping: `data`.

Allowed chart types: `bar`, `pie`, `line`, `area`, `radar`, `scatter`.

### STATS

Use for metrics and KPIs.

```xml
<STATS statstype="circle">
  <DIV stat="85"><H3>Satisfaction</H3><P>Q4 survey.</P></DIV>
  <DIV stat="4.5"><H3>Rating</H3><P>App store average.</P></DIV>
</STATS>
```

Flazz mapping: `stats`.

Useful visual variants: `plain`, `circle`, `circle-bold`, `star`, `bar`,
`dot-grid`, `dot-line`.

## Planning Rules

- Use at least 4 distinct layout tags in decks with 8 or more slides.
- Use at least 6 distinct layout tags in decks with 15 or more slides.
- Never use `BULLETS` for more than 25% of content slides.
- Prefer `BOXES`, `STATS`, `COMPARE`, `TIMELINE`, `PYRAMID`, `STAIRCASE`,
  `CYCLE`, or `CHART` whenever the content has structure.
- Every content slide should have one dominant visual pattern.
- Expand the outline into structured units; do not copy outline text verbatim.
