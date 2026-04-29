#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const JSZip = require("jszip");
const EMU_PER_INCH = 914400;

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeWhitespace(value) {
  return value
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function extractTextRuns(xml) {
  const runs = [];
  const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    runs.push(decodeXml(match[1]));
  }

  return normalizeWhitespace(runs.join("\n"));
}

function parseSlideSize(xml) {
  const match = xml.match(/<p:sldSz\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  if (!match) {
    return {
      cx: 9144000,
      cy: 5143500,
      widthIn: 10,
      heightIn: 5.625,
    };
  }

  const cx = Number(match[1]);
  const cy = Number(match[2]);
  return {
    cx,
    cy,
    widthIn: cx / EMU_PER_INCH,
    heightIn: cy / EMU_PER_INCH,
  };
}

function extractShapeDescriptors(xml) {
  const shapes = [];
  const pattern = /<p:(sp|pic|graphicFrame)\b[\s\S]*?<\/p:\1>/g;
  let match;
  let order = 0;

  while ((match = pattern.exec(xml)) !== null) {
    const block = match[0];
    const tag = match[1];
    const boundsMatch = block.match(/<a:xfrm\b[\s\S]*?<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"[\s\S]*?<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
    if (!boundsMatch) continue;

    const nameMatch = block.match(/<p:cNvPr\b[^>]*name="([^"]*)"/);
    const text = extractTextRuns(block);
    const x = Number(boundsMatch[1]);
    const y = Number(boundsMatch[2]);
    const cx = Number(boundsMatch[3]);
    const cy = Number(boundsMatch[4]);

    shapes.push({
      order: ++order,
      type: tag,
      name: nameMatch ? decodeXml(nameMatch[1]) : `${tag}-${order}`,
      text,
      x,
      y,
      cx,
      cy,
      xIn: x / EMU_PER_INCH,
      yIn: y / EMU_PER_INCH,
      wIn: cx / EMU_PER_INCH,
      hIn: cy / EMU_PER_INCH,
    });
  }

  return shapes;
}

function previewText(value) {
  return normalizeWhitespace(value).slice(0, 80) || "(no text)";
}

function isNumericBadge(shape) {
  const text = normalizeWhitespace(shape.text);
  return /^\d{1,3}$/.test(text) && shape.wIn <= 0.55 && shape.hIn <= 0.35;
}

function isLikelyDecorativeText(shape) {
  const text = normalizeWhitespace(shape.text);
  if (!text) return true;
  if (isNumericBadge(shape)) return true;
  return false;
}

function findOutOfBoundsShapes(shapes, slideSize) {
  const tolerance = 0.02;
  return shapes
    .filter((shape) => !isNumericBadge(shape))
    .filter((shape) => (
      shape.xIn < -tolerance
      || shape.yIn < -tolerance
      || shape.xIn + shape.wIn > slideSize.widthIn + tolerance
      || shape.yIn + shape.hIn > slideSize.heightIn + tolerance
    ))
    .map((shape) => ({
      type: "out-of-bounds",
      shape: shape.name,
      shapeType: shape.type,
      textPreview: previewText(shape.text),
      boundsIn: {
        x: Number(shape.xIn.toFixed(3)),
        y: Number(shape.yIn.toFixed(3)),
        w: Number(shape.wIn.toFixed(3)),
        h: Number(shape.hIn.toFixed(3)),
      },
    }));
}

function intersectionArea(a, b) {
  const left = Math.max(a.xIn, b.xIn);
  const top = Math.max(a.yIn, b.yIn);
  const right = Math.min(a.xIn + a.wIn, b.xIn + b.wIn);
  const bottom = Math.min(a.yIn + a.hIn, b.yIn + b.hIn);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function findTextOverlaps(shapes) {
  const issues = [];
  const textShapes = shapes
    .filter((shape) => !isLikelyDecorativeText(shape))
    .filter((shape) => shape.wIn > 0.2 && shape.hIn > 0.12);

  for (let i = 0; i < textShapes.length; i += 1) {
    for (let j = i + 1; j < textShapes.length; j += 1) {
      const a = textShapes[i];
      const b = textShapes[j];

      const overlap = intersectionArea(a, b);
      if (overlap <= 0.02) continue;

      const aArea = a.wIn * a.hIn;
      const bArea = b.wIn * b.hIn;
      const overlapRatio = overlap / Math.min(aArea, bArea);

      if (overlapRatio < 0.12) continue;

      issues.push({
        type: "overlap",
        shapes: [a.name, b.name],
        textPreviews: [previewText(a.text), previewText(b.text)],
        overlapAreaIn2: Number(overlap.toFixed(3)),
        overlapRatio: Number(overlapRatio.toFixed(3)),
      });
    }
  }

  return issues;
}

function findFooterIntrusions(shapes, slideSize) {
  const footerTop = Math.max(0, slideSize.heightIn - 0.55);
  const reservedBadgeLeft = Math.max(0, slideSize.widthIn - 0.8);

  return shapes
    .filter((shape) => !isNumericBadge(shape))
    .filter((shape) => shape.yIn + shape.hIn > footerTop)
    .filter((shape) => shape.xIn + shape.wIn > 0.45)
    .map((shape) => ({
      type: shape.xIn + shape.wIn > reservedBadgeLeft ? "page-badge-overlap-risk" : "footer-overlap-risk",
      shape: shape.name,
      shapeType: shape.type,
      textPreview: previewText(shape.text),
      boundsIn: {
        x: Number(shape.xIn.toFixed(3)),
        y: Number(shape.yIn.toFixed(3)),
        w: Number(shape.wIn.toFixed(3)),
        h: Number(shape.hIn.toFixed(3)),
      },
      message: "Content enters the reserved footer/page-number zone. Move it upward, reduce rows, or split the slide.",
    }));
}

function findDenseTextShapes(shapes) {
  return shapes
    .filter((shape) => !isLikelyDecorativeText(shape))
    .filter((shape) => shape.type === "sp")
    .filter((shape) => shape.wIn > 0.4 && shape.hIn > 0.22)
    .map((shape) => {
      const text = normalizeWhitespace(shape.text);
      const area = shape.wIn * shape.hIn;
      const lines = text ? text.split("\n").filter(Boolean).length : 0;
      const charDensity = area > 0 ? text.length / area : 0;
      return {
        shape,
        text,
        area,
        lines,
        charDensity,
      };
    })
    .filter(({ text, lines, charDensity }) => {
      if (!text) return false;
      if (lines >= 7 && charDensity >= 95) return true;
      if (lines >= 5 && charDensity >= 125) return true;
      if (text.length >= 220 && charDensity >= 110) return true;
      return false;
    })
    .map(({ shape, text, charDensity, lines }) => ({
      type: "dense-text",
      shape: shape.name,
      shapeType: shape.type,
      textPreview: previewText(text),
      lineCount: lines,
      charDensity: Number(charDensity.toFixed(1)),
      boundsIn: {
        x: Number(shape.xIn.toFixed(3)),
        y: Number(shape.yIn.toFixed(3)),
        w: Number(shape.wIn.toFixed(3)),
        h: Number(shape.hIn.toFixed(3)),
      },
    }));
}

function findTinyWrappedTextShapes(shapes) {
  return shapes
    .filter((shape) => shape.type === "sp")
    .filter((shape) => shape.wIn <= 0.72 || shape.hIn <= 0.72)
    .map((shape) => {
      const text = normalizeWhitespace(shape.text);
      const compact = text.replace(/\s+/g, "");
      const lines = text.split("\n").filter(Boolean);
      return { shape, text, compact, lines };
    })
    .filter(({ text, compact, lines }) => {
      if (!text) return false;
      if (isNumericBadge({ text: compact, wIn: 0.4, hIn: 0.25 })) return false;
      if (lines.length >= 2 && compact.length >= 4) return true;
      if (compact.length >= 5 && /^[\d-/]+$/.test(compact)) return true;
      return false;
    })
    .map(({ shape, text, lines }) => ({
      type: "tiny-wrapped-text",
      shape: shape.name,
      shapeType: shape.type,
      textPreview: previewText(text),
      lineCount: lines.length,
      boundsIn: {
        x: Number(shape.xIn.toFixed(3)),
        y: Number(shape.yIn.toFixed(3)),
        w: Number(shape.wIn.toFixed(3)),
        h: Number(shape.hIn.toFixed(3)),
      },
      message: "A small marker/circle appears to contain wrapped text. Use a short index inside the marker and place dates or labels in a separate wider text box.",
    }));
}

function findPlainSlideIssues(shapes) {
  const visibleTextShapes = shapes
    .filter((shape) => !isLikelyDecorativeText(shape))
    .filter((shape) => normalizeWhitespace(shape.text).length > 0);
  const textLength = visibleTextShapes
    .reduce((sum, shape) => sum + normalizeWhitespace(shape.text).length, 0);
  const mediaCount = shapes.filter((shape) => shape.type === "pic" || shape.type === "graphicFrame").length;
  const visualShapeCount = shapes
    .filter((shape) => !isLikelyDecorativeText(shape))
    .filter((shape) => {
      if (shape.type === "pic" || shape.type === "graphicFrame") return true;
      if (!normalizeWhitespace(shape.text)) return true;
      return shape.wIn >= 0.65 && shape.hIn >= 0.35 && normalizeWhitespace(shape.text).length <= 90;
    }).length;
  const issues = [];

  if (textLength >= 520 && mediaCount === 0) {
    issues.push({
      type: "text-heavy-slide",
      textLength,
      visualShapeCount,
      message: "Slide has heavy text and no media/chart frame. Convert content into stats, comparison, hierarchy, roadmap, or media structure.",
    });
  }

  if (textLength >= 220 && visualShapeCount <= 3) {
    issues.push({
      type: "plain-slide",
      textLength,
      visualShapeCount,
      message: "Slide has too few visual groups for its text load. Add a native helper pattern or reduce text.",
    });
  }

  if (visibleTextShapes.length >= 7 && mediaCount === 0) {
    issues.push({
      type: "too-many-text-boxes",
      textBoxCount: visibleTextShapes.length,
      message: "Slide uses many separate text boxes without a strong visual anchor.",
    });
  }

  return issues;
}

function collectPlaceholderMatches(text) {
  const patterns = [
    /xxxx/gi,
    /lorem/gi,
    /ipsum/gi,
    /placeholder/gi,
    /this.*(?:page|slide).*layout/gi,
  ];

  const matches = [];
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) matches.push(...found);
  }

  return [...new Set(matches)];
}

async function readZipText(zip, entryPath) {
  const file = zip.file(entryPath);
  if (!file) return "";
  return file.async("string");
}

async function main() {
  const [targetPath, formatFlag] = process.argv.slice(2);
  if (!targetPath) {
    console.error("Usage: node audit-pptx.cjs <file.pptx> [--json]");
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), targetPath);
  const raw = await fs.readFile(absolutePath);
  const zip = await JSZip.loadAsync(raw);
  const presentationXml = await readZipText(zip, "ppt/presentation.xml");
  const slideSize = parseSlideSize(presentationXml);

  const slideEntries = Object.keys(zip.files)
    .map((name) => {
      const match = name.match(/^ppt\/slides\/slide(\d+)\.xml$/);
      if (!match) return null;
      return { name, index: Number(match[1]) };
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  const slides = [];
  for (const slideEntry of slideEntries) {
    const slideXml = await readZipText(zip, slideEntry.name);
    const notesXml = await readZipText(zip, `ppt/notesSlides/notesSlide${slideEntry.index}.xml`);
    const text = extractTextRuns(slideXml);
    const notes = extractTextRuns(notesXml);
    const placeholderMatches = collectPlaceholderMatches(`${text}\n${notes}`);
    const shapes = extractShapeDescriptors(slideXml);
    const layoutIssues = [
      ...findOutOfBoundsShapes(shapes, slideSize),
      ...findTextOverlaps(shapes),
      ...findFooterIntrusions(shapes, slideSize),
      ...findDenseTextShapes(shapes),
      ...findTinyWrappedTextShapes(shapes),
      ...findPlainSlideIssues(shapes),
    ];

    slides.push({
      index: slideEntry.index,
      text,
      notes,
      placeholderMatches,
      shapeCount: shapes.length,
      layoutIssues,
      shapes: formatFlag === "--json"
        ? shapes.map((shape) => ({
            order: shape.order,
            type: shape.type,
            name: shape.name,
            textPreview: previewText(shape.text),
            boundsIn: {
              x: Number(shape.xIn.toFixed(3)),
              y: Number(shape.yIn.toFixed(3)),
              w: Number(shape.wIn.toFixed(3)),
              h: Number(shape.hIn.toFixed(3)),
            },
          }))
        : undefined,
    });
  }

  const payload = {
    file: absolutePath,
    slideCount: slides.length,
    slideSize: {
      widthIn: Number(slideSize.widthIn.toFixed(3)),
      heightIn: Number(slideSize.heightIn.toFixed(3)),
    },
    slides,
    placeholderMatches: [...new Set(slides.flatMap((slide) => slide.placeholderMatches))],
    layoutIssues: slides.flatMap((slide) => slide.layoutIssues.map((issue) => ({
      slideIndex: slide.index,
      ...issue,
    }))),
  };

  if (formatFlag === "--json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`File: ${payload.file}`);
  console.log(`Slides: ${payload.slideCount}`);
  console.log(`Slide size: ${payload.slideSize.widthIn}" x ${payload.slideSize.heightIn}"`);
  if (payload.placeholderMatches.length > 0) {
    console.log(`Placeholder matches: ${payload.placeholderMatches.join(", ")}`);
  }
  if (payload.layoutIssues.length > 0) {
    console.log(`Layout issues: ${payload.layoutIssues.length}`);
  }
  console.log("");

  for (const slide of slides) {
    console.log(`--- Slide ${String(slide.index).padStart(2, "0")} ---`);
    console.log(slide.text || "(no visible text)");
    if (slide.notes) {
      console.log("");
      console.log("Notes:");
      console.log(slide.notes);
    }
    if (slide.placeholderMatches.length > 0) {
      console.log("");
      console.log(`Placeholder matches: ${slide.placeholderMatches.join(", ")}`);
    }
    if (slide.layoutIssues.length > 0) {
      console.log("");
      console.log("Layout issues:");
      for (const issue of slide.layoutIssues) {
        if (issue.type === "out-of-bounds") {
          console.log(`- Out of bounds: ${issue.shape} ${JSON.stringify(issue.boundsIn)} -> ${issue.textPreview}`);
        } else if (issue.type === "overlap") {
          console.log(`- Overlap: ${issue.shapes.join(" <-> ")} (ratio ${issue.overlapRatio})`);
          console.log(`  ${issue.textPreviews[0]}`);
          console.log(`  ${issue.textPreviews[1]}`);
        } else if (issue.type === "dense-text") {
          console.log(`- Dense text: ${issue.shape} (${issue.lineCount} lines, density ${issue.charDensity}) -> ${issue.textPreview}`);
        } else if (issue.type === "tiny-wrapped-text") {
          console.log(`- Tiny wrapped text: ${issue.shape} ${JSON.stringify(issue.boundsIn)} -> ${issue.message}`);
        } else if (issue.type === "footer-overlap-risk" || issue.type === "page-badge-overlap-risk") {
          console.log(`- ${issue.type}: ${issue.shape} ${JSON.stringify(issue.boundsIn)} -> ${issue.message}`);
        } else if (issue.type === "text-heavy-slide" || issue.type === "plain-slide") {
          console.log(`- ${issue.type}: ${issue.message} (${issue.textLength} chars, ${issue.visualShapeCount} visual groups)`);
        } else if (issue.type === "too-many-text-boxes") {
          console.log(`- Too many text boxes: ${issue.textBoxCount}. ${issue.message}`);
        }
      }
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
