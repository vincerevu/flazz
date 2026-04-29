#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function countSentences(text) {
  const matches = text.match(/[.!?](?:\s|$)/g);
  return matches ? matches.length : 0;
}

function stripQuoted(value) {
  const quote = value[0];
  if ((quote !== '"' && quote !== "'" && quote !== '`') || value[value.length - 1] !== quote) {
    return value;
  }
  return value.slice(1, -1);
}

function collectStringLiterals(source) {
  const strings = [];
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const value = stripQuoted(match[1]).trim();
    if (!value) continue;
    strings.push(value);
  }

  return strings;
}

function hasVietnamese(text) {
  return /[\u0103\u00e2\u0111\u00ea\u00f4\u01a1\u01b0\u00e1\u00e0\u1ea3\u00e3\u1ea1\u1eaf\u1eb1\u1eb3\u1eb5\u1eb7\u1ea5\u1ea7\u1ea9\u1eab\u1ead\u00e9\u00e8\u1ebb\u1ebd\u1eb9\u1ebf\u1ec1\u1ec3\u1ec5\u1ec7\u00ed\u00ec\u1ec9\u0129\u1ecb\u00f3\u00f2\u1ecf\u00f5\u1ecd\u1ed1\u1ed3\u1ed5\u1ed7\u1ed9\u1edb\u1edd\u1edf\u1ee1\u1ee3\u00fa\u00f9\u1ee7\u0169\u1ee5\u1ee9\u1eeb\u1eed\u1eef\u1ef1\u00fd\u1ef3\u1ef7\u1ef9\u1ef5]/i.test(text);
}

function hasCjk(text) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);
}

function hasSlashGloss(text) {
  return /[A-Za-z\u00c0-\u1ef9\u3400-\u9FFF][^"'`\n]{0,36}\s\/\s[^"'`\n]{1,36}[A-Za-z\u00c0-\u1ef9\u3400-\u9FFF]/.test(text);
}

function countPictographicIcons(text) {
  const matches = text.match(/\p{Extended_Pictographic}/gu);
  return matches ? matches.length : 0;
}

function likelyEnglishLabelInVietnameseDeck(text) {
  const normalized = text.toLowerCase();
  return /\b(best practices|use cases|summary|overview|option [ab]|key takeaway|takeaways|workflow|safe touch|unsafe touch|high-five|design|content writing|code development|data analysis|research)\b/.test(normalized);
}

function collectFontFaces(source) {
  const fonts = [];
  const pattern = /\b(?:fontFace|titleFontFace|bodyFontFace|captionFontFace|labelFontFace|detailFontFace|valueFontFace|tagFontFace)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const font = stripQuoted(match[1]).trim();
    if (font) fonts.push(font);
  }

  return [...new Set(fonts)];
}

function validateLanguageConsistency(source, errors) {
  const strings = collectStringLiterals(source)
    .filter((text) => !text.startsWith('../') && !text.startsWith('./'))
    .filter((text) => !/^[A-Za-z_$][\w$.-]*$/.test(text));

  const deckLooksVietnamese = strings.some(hasVietnamese);
  if (!deckLooksVietnamese) return;

  for (const text of strings) {
    const iconCount = countPictographicIcons(text);
    if (iconCount > 1) {
      errors.push(`Multiple icons/emojis in one visible text string. Use at most one icon per item: "${text.slice(0, 80)}"`);
    }
    if (hasCjk(text)) {
      errors.push(`Mixed-language text contains CJK characters in a Vietnamese deck: "${text.slice(0, 80)}"`);
    }
    if (hasSlashGloss(text)) {
      errors.push(`Mixed-language slash gloss detected. Use one deck language instead: "${text.slice(0, 80)}"`);
    }
    if (likelyEnglishLabelInVietnameseDeck(text)) {
      errors.push(`English label appears in a Vietnamese deck. Translate visible text: "${text.slice(0, 80)}"`);
    }
  }

  const allowedVietnameseFonts = new Set([
    'aptos',
    'arial',
    'calibri',
    'cambria',
    'segoe ui',
    'tahoma',
    'times new roman',
  ]);
  const riskyVietnameseFonts = new Set([
    'dm serif display',
    'garamond',
    'georgia',
    'impact',
    'merriweather',
    'palatino',
    'playfair display',
  ]);

  for (const font of collectFontFaces(source)) {
    const normalizedFont = font.toLowerCase();
    if (riskyVietnameseFonts.has(normalizedFont)) {
      errors.push(`Vietnamese deck uses risky font "${font}". Use Segoe UI, Arial, Aptos, Calibri, Tahoma, or Cambria unless visually verified.`);
      continue;
    }
    if (!allowedVietnameseFonts.has(normalizedFont)) {
      errors.push(`Vietnamese deck uses non-system or unverified font "${font}". Use a Vietnamese-safe system font.`);
    }
  }
}

function collectArrayBlocks(source) {
  const blocks = [];
  const needle = 'slide.addText([';
  let index = 0;

  while ((index = source.indexOf(needle, index)) !== -1) {
    let cursor = index + needle.length;
    let depth = 1;
    let inString = false;
    let stringQuote = '';

    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      const prev = source[cursor - 1];

      if (inString) {
        if (char === stringQuote && prev !== '\\') {
          inString = false;
        }
        cursor += 1;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringQuote = char;
      } else if (char === '[') {
        depth += 1;
      } else if (char === ']') {
        depth -= 1;
      }
      cursor += 1;
    }

    if (depth === 0) {
      blocks.push(source.slice(index + needle.length, cursor - 1));
    }

    index = cursor;
  }

  return blocks;
}

function collectBulletEntries(block) {
  const entries = [];
  const entryPattern = /\{\s*text\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*options\s*:\s*\{([\s\S]*?)\}\s*\}/g;
  let match;

  while ((match = entryPattern.exec(block)) !== null) {
    const rawText = match[1];
    const options = match[2];
    if (!/\bbullet\s*:\s*(true|\{)/.test(options)) continue;

    entries.push({
      text: stripQuoted(rawText),
      hasBreakLine: /\bbreakLine\s*:\s*true\b/.test(options),
    });
  }

  return entries;
}

function collectNamedArrays(source) {
  const arrays = new Map();
  const pattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\[[\s\S]*?\]);/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    arrays.set(match[1], match[2]);
  }

  return arrays;
}

function extractStringArray(arraySource) {
  const items = [];
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let match;

  while ((match = pattern.exec(arraySource)) !== null) {
    items.push(stripQuoted(match[1]).trim());
  }

  return items.filter(Boolean);
}

function collectBulletHelperSets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addBulletList\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractStringArray(arraySource));
  }

  return sets;
}

function extractSummaryItems(arraySource) {
  const items = [];
  const itemPattern = /\{\s*title\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)?\s*,?\s*body\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)?[\s\S]*?\}/g;
  let match;

  while ((match = itemPattern.exec(arraySource)) !== null) {
    const titleMatch = match[0].match(/\btitle\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    const bodyMatch = match[0].match(/\bbody\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    items.push({
      title: titleMatch ? stripQuoted(titleMatch[1]).trim() : '',
      body: bodyMatch ? stripQuoted(bodyMatch[1]).trim() : '',
    });
  }

  return items;
}

function collectSummaryRowSets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addSummaryRows\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractSummaryItems(arraySource));
  }

  return sets;
}

function extractProcessSteps(arraySource) {
  const steps = [];
  const stepPattern = /\{\s*label\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)?\s*,?\s*caption\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)?[\s\S]*?\}|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let match;

  while ((match = stepPattern.exec(arraySource)) !== null) {
    if (match[3]) {
      steps.push({ label: stripQuoted(match[3]).trim(), caption: '' });
      continue;
    }

    const labelMatch = match[0].match(/\blabel\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    const captionMatch = match[0].match(/\bcaption\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    steps.push({
      label: labelMatch ? stripQuoted(labelMatch[1]).trim() : '',
      caption: captionMatch ? stripQuoted(captionMatch[1]).trim() : '',
    });
  }

  return steps;
}

function collectProcessStepSets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addProcessTimeline\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractProcessSteps(arraySource));
  }

  return sets;
}

function extractComparisonColumns(arraySource) {
  const columns = [];
  const colPattern = /\{\s*title\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*items\s*:\s*\[([\s\S]*?)\][\s\S]*?\}/g;
  let match;

  while ((match = colPattern.exec(arraySource)) !== null) {
    const items = [];
    const itemPattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(match[2])) !== null) {
      items.push(stripQuoted(itemMatch[1]).trim());
    }
    columns.push({
      title: stripQuoted(match[1]).trim(),
      items,
    });
  }

  return columns;
}

function collectComparisonSets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addComparisonCards\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractComparisonColumns(arraySource));
  }

  return sets;
}

function extractStatCards(arraySource) {
  const cards = [];
  const cardPattern = /\{\s*value\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*label\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)(?:\s*,\s*detail\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`))?[\s\S]*?\}/g;
  let match;

  while ((match = cardPattern.exec(arraySource)) !== null) {
    cards.push({
      value: stripQuoted(match[1]).trim(),
      label: stripQuoted(match[2]).trim(),
      detail: match[3] ? stripQuoted(match[3]).trim() : '',
    });
  }

  return cards;
}

function collectStatCardSets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addStatCardGrid\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractStatCards(arraySource));
  }

  const contentModelStatCardsMatch = source.match(/\bstatCards\s*:\s*(\[[\s\S]*?\])/);
  if (contentModelStatCardsMatch) {
    const cards = extractStatCards(contentModelStatCardsMatch[1]);
    if (cards.length) sets.push(cards);
  }

  return sets;
}

function collectNamedObjects(source) {
  const objects = new Map();
  const pattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\{[\s\S]*?\});/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    objects.set(match[1], match[2]);
  }

  return objects;
}

function extractStringProperty(objectSource, propertyName) {
  const match = objectSource.match(new RegExp(`\\b${propertyName}\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)`));
  return match ? stripQuoted(match[1]).trim() : '';
}

function extractStringArrayProperty(objectSource, propertyName, namedArrays) {
  const propertyMatch = objectSource.match(new RegExp(`\\b${propertyName}\\s*:\\s*([A-Za-z_$][\\w$]*|\\[[\\s\\S]*?\\])`));
  if (!propertyMatch) return [];

  const ref = propertyMatch[1].trim();
  const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
  if (!arraySource) return [];

  const items = [];
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let match;
  while ((match = pattern.exec(arraySource)) !== null) {
    items.push(stripQuoted(match[1]).trim());
  }
  return items;
}

function collectMediaPanels(source) {
  const namedArrays = collectNamedArrays(source);
  const namedObjects = collectNamedObjects(source);
  const panels = [];
  const callPattern = /addMixedMediaPanel\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\{[\s\S]*?\})\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const objectSource = ref.startsWith('{') ? ref : namedObjects.get(ref);
    if (!objectSource) continue;

    panels.push({
      imagePath: extractStringProperty(objectSource, 'imagePath'),
      title: extractStringProperty(objectSource, 'title'),
      bullets: extractStringArrayProperty(objectSource, 'bullets', namedArrays),
      caption: extractStringProperty(objectSource, 'caption'),
    });
  }

  return panels;
}

function extractObjectItems(arraySource) {
  const items = [];
  const objectPattern = /\{[\s\S]*?\}/g;
  let match;

  while ((match = objectPattern.exec(arraySource)) !== null) {
    items.push(match[0]);
  }

  return items;
}

function extractHierarchyNodes(arraySource) {
  return extractObjectItems(arraySource).map((itemSource) => ({
    title: extractStringProperty(itemSource, 'title'),
    detail: extractStringProperty(itemSource, 'detail'),
  }));
}

function collectHierarchySets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addHierarchyStack\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractHierarchyNodes(arraySource));
  }

  return sets;
}

function extractRoadmapStages(arraySource) {
  return extractObjectItems(arraySource).map((itemSource) => ({
    tag: extractStringProperty(itemSource, 'tag'),
    label: extractStringProperty(itemSource, 'label'),
    caption: extractStringProperty(itemSource, 'caption'),
  }));
}

function collectRoadmapSets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addRoadmap\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractRoadmapStages(arraySource));
  }

  return sets;
}

function extractQuadrants(arraySource) {
  const namedArrays = collectNamedArrays(arraySource);
  return extractObjectItems(arraySource).map((itemSource) => ({
    title: extractStringProperty(itemSource, 'title'),
    body: extractStringProperty(itemSource, 'body'),
    items: extractStringArrayProperty(itemSource, 'items', namedArrays),
  }));
}

function collectQuadrantSets(source) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = /addQuadrantMatrix\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractQuadrants(arraySource));
  }

  return sets;
}

function extractGenericInfographicItems(arraySource) {
  return extractObjectItems(arraySource).map((itemSource) => ({
    title: extractStringProperty(itemSource, 'title'),
    detail: extractStringProperty(itemSource, 'detail') || extractStringProperty(itemSource, 'caption'),
  }));
}

function collectGenericInfographicSets(source, helperName) {
  const namedArrays = collectNamedArrays(source);
  const sets = [];
  const callPattern = new RegExp(`${helperName}\\(\\s*slide\\s*,\\s*([A-Za-z_$][\\w$]*|\\[[\\s\\S]*?\\])\\s*,`, 'g');
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const arraySource = ref.startsWith('[') ? ref : namedArrays.get(ref);
    if (!arraySource) continue;
    sets.push(extractGenericInfographicItems(arraySource));
  }

  return sets;
}

function collectRelationMaps(source) {
  const namedObjects = collectNamedObjects(source);
  const maps = [];
  const callPattern = /addRelationMap\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\{[\s\S]*?\})\s*,/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const objectSource = ref.startsWith('{') ? ref : namedObjects.get(ref);
    if (!objectSource) continue;

    const centerObjectMatch = objectSource.match(/\bcenter\s*:\s*(\{[\s\S]*?\}|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    let centerTitle = '';
    let centerDetail = '';
    if (centerObjectMatch) {
      const centerSource = centerObjectMatch[1];
      if (centerSource.startsWith('{')) {
        centerTitle = extractStringProperty(centerSource, 'title');
        centerDetail = extractStringProperty(centerSource, 'detail');
      } else {
        centerTitle = stripQuoted(centerSource);
      }
    }

    const nodesMatch = objectSource.match(/\bnodes\s*:\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])/);
    const nodesSource = nodesMatch ? nodesMatch[1].trim() : '';

    maps.push({
      center: { title: centerTitle, detail: centerDetail },
      nodes: nodesSource.startsWith('[') ? extractGenericInfographicItems(nodesSource) : [],
    });
  }

  return maps;
}

function collectSlideSpecMetadata(source) {
  const match = source.match(/\bconst\s+slideSpec\s*=\s*\{([\s\S]*?)\};/);
  if (!match) return null;

  const block = match[1];
  const getProp = (name) => {
    const propMatch = block.match(new RegExp(`\\b${name}\\s*:\\s*['"]([^'"]+)['"]`));
    return propMatch ? propMatch[1].trim() : '';
  };
  const indexMatch = block.match(/\bindex\s*:\s*(\d+)/);

  return {
    type: getProp('type'),
    title: getProp('title'),
    layoutFamily: getProp('layoutFamily'),
    layoutVariant: getProp('layoutVariant'),
    visualPattern: getProp('visualPattern'),
    sectionLayout: getProp('sectionLayout'),
    density: getProp('density'),
    language: getProp('language'),
    index: indexMatch ? Number(indexMatch[1]) : null,
  };
}

function validateSlideSpec(source, errors) {
  const isContentSlide = /\btype\s*:\s*['"]content['"]/.test(source);
  if (!isContentSlide) return null;

  if (!/\bconst\s+slideSpec\s*=/.test(source)) {
    errors.push('Content slide must define const slideSpec before drawing.');
    return null;
  }

  const metadata = collectSlideSpecMetadata(source);
  const allowedFamilies = new Set([
    'text-visual',
    'comparison',
    'timeline',
    'roadmap',
    'hierarchy',
    'quadrant',
    'relation',
    'cycle',
    'pyramid',
    'staircase',
    'boxes',
    'data',
    'stats',
    'media',
  ]);
  const allowedDensities = new Set(['light', 'medium', 'dense']);
  const allowedVisualPatterns = new Set([
    'COLUMNS',
    'BULLETS',
    'ICONS',
    'CYCLE',
    'ARROWS',
    'ARROW-VERTICAL',
    'TIMELINE',
    'PYRAMID',
    'STAIRCASE',
    'BOXES',
    'COMPARE',
    'BEFORE-AFTER',
    'PROS-CONS',
    'TABLE',
    'CHART',
    'STATS',
    'QUOTE',
    'CALLOUT',
    'MEDIA',
  ]);
  const allowedSectionLayouts = new Set(['left', 'right', 'vertical', 'background']);

  if (!metadata?.title) {
    errors.push('Content slideSpec is missing title.');
  }

  if (!metadata?.index) {
    errors.push('Content slideSpec is missing a numeric index.');
  }

  if (!metadata?.language) {
    errors.push('Content slideSpec is missing language. Lock every content slide to one deck language.');
  }

  if (!/\bconst\s+contentModel\s*=/.test(source)) {
    errors.push('Content slide must define const contentModel before calling the layout helper.');
  }

  if (!metadata?.layoutFamily) {
    errors.push('Content slideSpec is missing layoutFamily.');
  } else if (!allowedFamilies.has(metadata.layoutFamily)) {
    errors.push(`Content slideSpec uses unknown layoutFamily "${metadata.layoutFamily}".`);
  }

  if (!metadata?.layoutVariant) {
    errors.push('Content slideSpec is missing layoutVariant.');
  }

  if (!metadata?.visualPattern) {
    errors.push('Content slideSpec is missing visualPattern. Choose one XML layout pattern such as PYRAMID, TIMELINE, STATS, or CHART.');
  } else if (!allowedVisualPatterns.has(metadata.visualPattern.toUpperCase())) {
    errors.push(`Content slideSpec uses unknown visualPattern "${metadata.visualPattern}".`);
  }

  if (!metadata?.sectionLayout) {
    errors.push('Content slideSpec is missing sectionLayout. Use left, right, vertical, or background to plan deck rhythm.');
  } else if (!allowedSectionLayouts.has(metadata.sectionLayout)) {
    errors.push(`Content slideSpec uses unknown sectionLayout "${metadata.sectionLayout}".`);
  }

  if (!metadata?.density) {
    errors.push('Content slideSpec is missing density.');
  } else if (!allowedDensities.has(metadata.density)) {
    errors.push(`Content slideSpec uses unknown density "${metadata.density}".`);
  }

  return metadata;
}

function validateThankYouPlacement(source, slideSpec, errors) {
  if (slideSpec?.type !== 'content') return;
  const strings = collectStringLiterals(source);
  const hasThankYou = strings.some((text) => /\b(?:c\u1ea3m\s+\u01a1n|c\u00e1m\s+\u01a1n|thank\s+you|thanks)\b/i.test(text));
  if (!hasThankYou) return;

  errors.push('Thank-you text must be a standalone final Summary / Closing slide, not a footer or callout on a content slide.');
}

function validateModuleShape(source, filePath, errors) {
  const addSlideCount = (source.match(/\bpres\.addSlide\s*\(/g) || []).length;
  const fileName = path.basename(filePath).toLowerCase();

  if (addSlideCount > 1) {
    errors.push('Found multiple pres.addSlide() calls in one file. Generate one slide module per file, not a monolithic deck script.');
  }

  if (fileName === 'index.js' && addSlideCount > 0) {
    errors.push('Do not generate presentation slides in index.js. Use slide-01.js, slide-02.js, etc. plus compile.js.');
  }

  if (/function\s+addBullets\s*\(|const\s+addBullets\s*=|let\s+addBullets\s*=|var\s+addBullets\s*=/.test(source)) {
    errors.push('Do not define a local addBullets helper. Use scripts/pptx-bullet-helpers.cjs addBulletList() instead.');
  }

  if (!/\bfunction\s+createSlide\s*\(|\bconst\s+createSlide\s*=|\blet\s+createSlide\s*=|\bvar\s+createSlide\s*=/.test(source)) {
    errors.push('Slide module must define createSlide(pres, theme).');
  }

  if (!/module\.exports\s*=\s*\{[\s\S]*\bcreateSlide\b/.test(source)) {
    errors.push('Slide module must export createSlide in module.exports.');
  }
}

function validateThemeContract(source, errors) {
  const themeMatch = source.match(/\bconst\s+theme\s*=\s*\{([\s\S]*?)\};/);
  if (!themeMatch) return;

  const allowed = new Set(['primary', 'secondary', 'accent', 'light', 'bg']);
  const keys = [];
  const keyPattern = /(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*:/g;
  let match;

  while ((match = keyPattern.exec(themeMatch[1])) !== null) {
    keys.push(match[1]);
  }

  const extras = keys.filter((key) => !allowed.has(key));
  if (extras.length) {
    errors.push(`Theme contains non-contract keys: ${extras.join(', ')}. Use only primary, secondary, accent, light, bg.`);
  }

  for (const key of allowed) {
    if (!keys.includes(key)) {
      errors.push(`Theme is missing required key: ${key}.`);
    }
  }
}

function extractDataBlocks(source) {
  const namedArrays = collectNamedArrays(source);
  const namedObjects = collectNamedObjects(source);

  const blocks = [];
  const callPattern = /addBarChartWithTakeaways\(\s*slide\s*,\s*([A-Za-z_$][\w$]*|\{[\s\S]*?\})\s*,/g;
  let match;
  while ((match = callPattern.exec(source)) !== null) {
    const ref = match[1].trim();
    const objSource = ref.startsWith('{') ? ref : namedObjects.get(ref);
    if (!objSource) continue;

    const seriesRefMatch = objSource.match(/\bseries\s*:\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])/);
    const takeawaysRefMatch = objSource.match(/\btakeaways\s*:\s*([A-Za-z_$][\w$]*|\[[\s\S]*?\])/);
    const sourceMatch = objSource.match(/\bsource\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);

    const seriesSource = seriesRefMatch
      ? (seriesRefMatch[1].trim().startsWith('[') ? seriesRefMatch[1].trim() : namedArrays.get(seriesRefMatch[1].trim()))
      : null;
    const takeawaysSource = takeawaysRefMatch
      ? (takeawaysRefMatch[1].trim().startsWith('[') ? takeawaysRefMatch[1].trim() : namedArrays.get(takeawaysRefMatch[1].trim()))
      : null;

    const series = [];
    if (seriesSource) {
      const seriesPattern = /\{\s*label\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*value\s*:\s*([0-9.]+)\s*\}/g;
      let seriesMatch;
      while ((seriesMatch = seriesPattern.exec(seriesSource)) !== null) {
        series.push({
          label: stripQuoted(seriesMatch[1]).trim(),
          value: Number(seriesMatch[2]),
        });
      }
    }

    const takeaways = [];
    if (takeawaysSource) {
      const takeawayPattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
      let takeawayMatch;
      while ((takeawayMatch = takeawayPattern.exec(takeawaysSource)) !== null) {
        takeaways.push(stripQuoted(takeawayMatch[1]).trim());
      }
    }

    blocks.push({
      series,
      takeaways,
      source: sourceMatch ? stripQuoted(sourceMatch[1]).trim() : '',
    });
  }

  return blocks;
}

function validateSummaryRows(summaryRows, errors) {
  if (!summaryRows.length) {
    errors.push('Summary rows helper was used with no valid items.');
    return;
  }

  if (summaryRows.length > 4 && summaryRows.some((item) => item.body)) {
    errors.push('Summary rows has more than four body-bearing rows. Split across two slides or remove the bottom callout/footer.');
  }

  summaryRows.forEach((item, index) => {
    if (!item.title && !item.body) {
      errors.push(`Summary row ${index + 1} is empty.`);
      return;
    }

    if (item.title && (item.title.length > 80 || countSentences(item.title) > 1)) {
      errors.push(`Summary row ${index + 1} title is too dense. Keep the title short and single-idea.`);
    }

    if (item.body && (item.body.length > 140 || countSentences(item.body) > 2)) {
      errors.push(`Summary row ${index + 1} body is too dense. Split it into shorter recap rows.`);
    }

    if (!item.title && item.body.length > 90) {
      errors.push(`Summary row ${index + 1} is body-only and too long. Add a short title or split the row.`);
    }
  });
}

function validateProcessSteps(steps, errors) {
  if (steps.length < 2) {
    errors.push('Process timeline needs at least two steps.');
    return;
  }

  if (steps.length > 5) {
    errors.push('Process timeline has too many steps for one slide. Keep it to five or fewer, or split the process.');
  }

  steps.forEach((step, index) => {
    if (!step.label) {
      errors.push(`Process step ${index + 1} is missing a label.`);
      return;
    }

    if (step.label.length > 40 || countSentences(step.label) > 1) {
      errors.push(`Process step ${index + 1} label is too dense. Keep it short and single-idea.`);
    }

    if (step.caption && (step.caption.length > 80 || countSentences(step.caption) > 2)) {
      errors.push(`Process step ${index + 1} caption is too dense. Shorten it or split the process.`);
    }
  });
}

function validateComparisonColumns(columns, errors) {
  if (columns.length !== 2) {
    errors.push('Comparison layout needs exactly two columns.');
    return;
  }

  columns.forEach((column, index) => {
    if (!column.title) {
      errors.push(`Comparison column ${index + 1} is missing a title.`);
    }
    if (column.title && (column.title.length > 40 || countSentences(column.title) > 1)) {
      errors.push(`Comparison column ${index + 1} title is too dense. Keep it short and single-idea.`);
    }
    if (!Array.isArray(column.items) || column.items.length === 0) {
      errors.push(`Comparison column ${index + 1} needs at least one item.`);
      return;
    }
    column.items.forEach((item, itemIndex) => {
      if (item.length > 90 || countSentences(item) > 2) {
        errors.push(`Comparison column ${index + 1} item ${itemIndex + 1} is too dense. Split or shorten it.`);
      }
    });
  });
}

function validateDataBlock(block, errors) {
  if (!Array.isArray(block.series) || block.series.length < 2) {
    errors.push('Data visualization needs at least two chart data points.');
  } else {
    block.series.forEach((point, index) => {
      if (!point.label) {
        errors.push(`Chart data point ${index + 1} is missing a label.`);
      }
      if (point.label && (point.label.length > 24 || countSentences(point.label) > 1)) {
        errors.push(`Chart data point ${index + 1} label is too dense. Keep labels short.`);
      }
      if (!Number.isFinite(point.value)) {
        errors.push(`Chart data point ${index + 1} has an invalid numeric value.`);
      }
    });
  }

  if (!Array.isArray(block.takeaways) || block.takeaways.length === 0) {
    errors.push('Data visualization needs at least one takeaway.');
  } else {
    block.takeaways.forEach((item, index) => {
      if (item.length > 90 || countSentences(item) > 2) {
        errors.push(`Data takeaway ${index + 1} is too dense. Split or shorten it.`);
      }
    });
  }

  if (!block.source) {
    errors.push('Data visualization is missing a source string.');
  }
}

function validateStatCards(cards, errors) {
  if (cards.length < 2) {
    errors.push('Stat grid needs at least two cards.');
    return;
  }

  cards.forEach((card, index) => {
    if (!card.value) {
      errors.push(`Stat card ${index + 1} is missing a value.`);
    }
    if (!card.label) {
      errors.push(`Stat card ${index + 1} is missing a label.`);
    }
    if (card.value && card.value.length > 18) {
      errors.push(`Stat card ${index + 1} value is too long. Keep the metric compact.`);
    }
    if (card.value && /[A-Za-z\u00c0-\u1ef9]/.test(card.value) && !/^[+-]?\d+(?:[.,]\d+)?(?:\s?[%\u00d7x])?\s+[A-Za-z\u00c0-\u1ef9]{1,12}$/.test(card.value)) {
      errors.push(`Stat card ${index + 1} value mixes prose with metric text. Keep value to a number/percent/date, and move words into label/detail.`);
    }
    if (card.label && (card.label.length > 50 || countSentences(card.label) > 1)) {
      errors.push(`Stat card ${index + 1} label is too dense. Keep it short and single-idea.`);
    }
    if (card.detail && (card.detail.length > 100 || countSentences(card.detail) > 2)) {
      errors.push(`Stat card ${index + 1} detail is too dense. Shorten it or split the card.`);
    }
  });
}

function validateMediaPanel(panel, errors) {
  if (!panel.imagePath) {
    errors.push('Mixed-media panel is missing imagePath.');
  }
  if (!panel.title && panel.bullets.length === 0 && !panel.caption) {
    errors.push('Mixed-media panel needs title, bullets, or caption text.');
  }
  if (panel.title && (panel.title.length > 70 || countSentences(panel.title) > 1)) {
    errors.push('Mixed-media title is too dense. Keep it short and single-idea.');
  }
  if (panel.caption && (panel.caption.length > 110 || countSentences(panel.caption) > 2)) {
    errors.push('Mixed-media caption is too dense. Shorten it or move content into bullets.');
  }
  if (panel.bullets.length > 4) {
    errors.push('Mixed-media panel has too many bullets. Keep it to four or fewer.');
  }
  panel.bullets.forEach((item, index) => {
    if (item.length > 90 || countSentences(item) > 1) {
      errors.push(`Mixed-media bullet ${index + 1} is too dense. Split or shorten it.`);
    }
  });
}

function validateHierarchyNodes(nodes, errors) {
  if (nodes.length < 2) {
    errors.push('Hierarchy layout needs at least two nodes.');
    return;
  }

  if (nodes.length > 5) {
    errors.push('Hierarchy layout has too many nodes for one slide. Keep it to five or fewer, or split the hierarchy.');
  }

  nodes.forEach((node, index) => {
    if (!node.title) {
      errors.push(`Hierarchy node ${index + 1} is missing a title.`);
    }
    if (node.title && (node.title.length > 50 || countSentences(node.title) > 1)) {
      errors.push(`Hierarchy node ${index + 1} title is too dense. Keep it short and single-idea.`);
    }
    if (node.detail && (node.detail.length > 120 || countSentences(node.detail) > 2)) {
      errors.push(`Hierarchy node ${index + 1} detail is too dense. Shorten or split the hierarchy.`);
    }
  });
}

function validateRoadmapStages(stages, errors) {
  if (stages.length < 2) {
    errors.push('Roadmap layout needs at least two stages.');
    return;
  }

  stages.forEach((stage, index) => {
    if (!stage.label) {
      errors.push(`Roadmap stage ${index + 1} is missing a label.`);
    }
    if (stage.tag && stage.tag.length > 14) {
      errors.push(`Roadmap stage ${index + 1} tag is too long. Use short tags like Now, Next, Later.`);
    }
    if (stage.label && (stage.label.length > 36 || countSentences(stage.label) > 1)) {
      errors.push(`Roadmap stage ${index + 1} label is too dense. Keep it short.`);
    }
    if (stage.caption && (stage.caption.length > 90 || countSentences(stage.caption) > 2)) {
      errors.push(`Roadmap stage ${index + 1} caption is too dense. Shorten it.`);
    }
  });
}

function validateQuadrants(quadrants, errors) {
  if (quadrants.length !== 4) {
    errors.push('Quadrant layout needs exactly four quadrants.');
    return;
  }

  quadrants.forEach((quadrant, index) => {
    if (!quadrant.title) {
      errors.push(`Quadrant ${index + 1} is missing a title.`);
    }
    if (quadrant.title && (quadrant.title.length > 48 || countSentences(quadrant.title) > 1)) {
      errors.push(`Quadrant ${index + 1} title is too dense. Keep it short.`);
    }
    if (!quadrant.body && quadrant.items.length === 0) {
      errors.push(`Quadrant ${index + 1} needs body text or items.`);
    }
    if (quadrant.body && (quadrant.body.length > 100 || countSentences(quadrant.body) > 2)) {
      errors.push(`Quadrant ${index + 1} body is too dense. Shorten or use items.`);
    }
    quadrant.items.forEach((item, itemIndex) => {
      if (item.length > 70 || countSentences(item) > 1) {
        errors.push(`Quadrant ${index + 1} item ${itemIndex + 1} is too dense. Split or shorten it.`);
      }
    });
  });
}

function validateGenericInfographicItems(items, errors, label, minCount, maxCount = 6) {
  if (items.length < minCount) {
    errors.push(`${label} needs at least ${minCount} items.`);
    return;
  }

  if (items.length > maxCount) {
    errors.push(`${label} has too many items. Keep it to ${maxCount} or fewer.`);
  }

  items.forEach((item, index) => {
    if (!item.title) {
      errors.push(`${label} item ${index + 1} is missing a title.`);
    }
    if (item.title && (item.title.length > 44 || countSentences(item.title) > 1)) {
      errors.push(`${label} item ${index + 1} title is too dense. Keep it short.`);
    }
    if (item.detail && (item.detail.length > 100 || countSentences(item.detail) > 2)) {
      errors.push(`${label} item ${index + 1} detail is too dense. Shorten it.`);
    }
  });
}

function validateRelationMap(map, errors) {
  if (!map.center.title) {
    errors.push('Relation map is missing center.title.');
  }
  if (map.center.title && (map.center.title.length > 42 || countSentences(map.center.title) > 1)) {
    errors.push('Relation map center title is too dense. Keep it short.');
  }
  if (map.center.detail && (map.center.detail.length > 80 || countSentences(map.center.detail) > 2)) {
    errors.push('Relation map center detail is too dense. Shorten it.');
  }
  validateGenericInfographicItems(map.nodes, errors, 'Relation map node', 2, 6);
}

function validateLayoutHelperRouting(spec, source, errors) {
  if (!spec?.layoutFamily) return;

  const familyPatterns = {
    comparison: /addComparisonCards\s*\(|addDiagonalCompare\s*\(/,
    timeline: /addProcessTimeline\s*\(/,
    roadmap: /addRoadmap\s*\(/,
    hierarchy: /addHierarchyStack\s*\(|addLayeredStack\s*\(/,
    quadrant: /addQuadrantMatrix\s*\(/,
    relation: /addRelationMap\s*\(/,
    cycle: /addCycleDiagram\s*\(/,
    pyramid: /addPyramid\s*\(/,
    staircase: /addStaircase\s*\(/,
    boxes: /addBoxGrid\s*\(/,
    data: /addBarChartWithTakeaways\s*\(/,
    stats: /addStatCardGrid\s*\(|addMetricWall\s*\(/,
    media: /addMixedMediaPanel\s*\(|addEvidenceMedia\s*\(|addHeroImageOverlay\s*\(/,
    'text-visual': /addBulletList\s*\(|addSummaryRows\s*\(|addMixedMediaPanel\s*\(|addEditorialQuote\s*\(/,
  };

  const requiredPattern = familyPatterns[spec.layoutFamily];
  if (requiredPattern && !requiredPattern.test(source)) {
    errors.push(`layoutFamily "${spec.layoutFamily}" must render through its approved helper, not ad hoc addText positioning.`);
  }
}

function numericProp(objectSource, name) {
  const match = objectSource.match(new RegExp(`\\b${name}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

function collectInlineHelperLayoutObjects(source) {
  const layouts = [];
  const helpers = [
    'addSummaryRows',
    'addProcessTimeline',
    'addComparisonCards',
    'addBarChartWithTakeaways',
    'addStatCardGrid',
    'addMixedMediaPanel',
    'addHierarchyStack',
    'addQuadrantMatrix',
    'addRoadmap',
    'addBoxGrid',
    'addPyramid',
    'addStaircase',
    'addMetricWall',
    'addLayeredStack',
    'addEvidenceMedia',
    'addDiagonalCompare',
  ];

  for (const helper of helpers) {
    const pattern = new RegExp(`${helper}\\(\\s*slide\\s*,[\\s\\S]*?,\\s*(\\{[\\s\\S]*?\\})\\s*,\\s*theme`, 'g');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const objectSource = match[1];
      layouts.push({
        helper,
        x: numericProp(objectSource, 'x'),
        y: numericProp(objectSource, 'y'),
        w: numericProp(objectSource, 'w'),
        h: numericProp(objectSource, 'h'),
      });
    }
  }

  return layouts;
}

function collectInlineRadialLayoutObjects(source) {
  const layouts = [];
  const helpers = ['addRelationMap', 'addCycleDiagram'];

  for (const helper of helpers) {
    const pattern = new RegExp(`${helper}\\(\\s*slide\\s*,[\\s\\S]*?,\\s*(\\{[\\s\\S]*?\\})\\s*,\\s*theme`, 'g');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const objectSource = match[1];
      layouts.push({
        helper,
        cx: numericProp(objectSource, 'cx'),
        cy: numericProp(objectSource, 'cy'),
        radius: numericProp(objectSource, 'radius'),
        nodeW: numericProp(objectSource, 'nodeW') ?? 1.55,
        nodeH: numericProp(objectSource, 'nodeH') ?? 0.66,
      });
    }
  }

  return layouts;
}

function validateSafeFrame(source, errors) {
  for (const layout of collectInlineHelperLayoutObjects(source)) {
    if ([layout.x, layout.y, layout.w, layout.h].some((value) => typeof value !== 'number')) continue;
    if (layout.x < 0.35) {
      errors.push(`${layout.helper} layout starts too close to the left edge (x=${layout.x}). Use x >= 0.45 for content.`);
    }
    if (layout.x + layout.w > 9.45) {
      errors.push(`${layout.helper} layout exceeds the right safe frame (x+w=${Number((layout.x + layout.w).toFixed(2))}). Keep x+w <= 9.35.`);
    }
    if (layout.y < 1.12) {
      errors.push(`${layout.helper} layout enters the title zone (y=${layout.y}). Content helpers should start at y >= 1.25.`);
    }
    if (layout.y + layout.h > 4.9) {
      errors.push(`${layout.helper} layout enters the footer/page-number zone (y+h=${Number((layout.y + layout.h).toFixed(2))}). Keep content y+h <= 4.85 or split the slide.`);
    }
  }

  for (const layout of collectInlineRadialLayoutObjects(source)) {
    if ([layout.cx, layout.cy, layout.radius].some((value) => typeof value !== 'number')) continue;
    const left = layout.cx - layout.radius - layout.nodeW / 2;
    const right = layout.cx + layout.radius + layout.nodeW / 2;
    const top = layout.cy - layout.radius - layout.nodeH / 2;
    const bottom = layout.cy + layout.radius + layout.nodeH / 2;
    if (left < 0.45 || right > 9.35 || top < 1.2 || bottom > 4.85) {
      errors.push(`${layout.helper} radial layout exceeds the safe content frame. Bounds are x=${Number(left.toFixed(2))}..${Number(right.toFixed(2))}, y=${Number(top.toFixed(2))}..${Number(bottom.toFixed(2))}. Reduce radius/node count or split the slide.`);
    }
  }
}

function validateDensityBudget(spec, collected, errors) {
  if (!spec?.density || !spec?.layoutFamily) return;

  const densityLimits = {
    light: {
      bulletItems: 4,
      summaryRows: 4,
      processSteps: 4,
      comparisonItemsPerColumn: 3,
      dataSeries: 4,
      dataTakeaways: 2,
      statCards: 4,
      mediaBullets: 3,
      hierarchyNodes: 3,
      roadmapStages: 3,
      quadrantItemsPerQuadrant: 2,
      infographicItems: 4,
    },
    medium: {
      bulletItems: 6,
      summaryRows: 5,
      processSteps: 5,
      comparisonItemsPerColumn: 4,
      dataSeries: 6,
      dataTakeaways: 3,
      statCards: 4,
      mediaBullets: 4,
      hierarchyNodes: 4,
      roadmapStages: 4,
      quadrantItemsPerQuadrant: 3,
      infographicItems: 5,
    },
    dense: {
      bulletItems: 8,
      summaryRows: 6,
      processSteps: 6,
      comparisonItemsPerColumn: 5,
      dataSeries: 8,
      dataTakeaways: 4,
      statCards: 6,
      mediaBullets: 4,
      hierarchyNodes: 5,
      roadmapStages: 5,
      quadrantItemsPerQuadrant: 3,
      infographicItems: 6,
    },
  };

  const limits = densityLimits[spec.density];
  if (!limits) return;

  if (spec.layoutFamily === 'text-visual') {
    for (const items of collected.bulletSets) {
      if (items.length > limits.bulletItems) {
        errors.push(`text-visual slide uses ${items.length} bullets but density "${spec.density}" allows at most ${limits.bulletItems}. Split the slide or lower density.`);
      }
    }
    for (const rows of collected.summaryRows) {
      if (rows.length > limits.summaryRows) {
        errors.push(`text-visual slide uses ${rows.length} summary rows but density "${spec.density}" allows at most ${limits.summaryRows}. Split the slide or reduce rows.`);
      }
    }
  }

  for (const steps of collected.processSteps) {
    if (steps.length > limits.processSteps) {
      errors.push(`Process/timeline slide uses ${steps.length} steps but density "${spec.density}" allows at most ${limits.processSteps}.`);
    }
  }

  for (const columns of collected.comparisonColumns) {
    columns.forEach((column, index) => {
      if (column.items.length > limits.comparisonItemsPerColumn) {
        errors.push(`Comparison column ${index + 1} has ${column.items.length} items but density "${spec.density}" allows at most ${limits.comparisonItemsPerColumn}.`);
      }
    });
  }

  for (const block of collected.dataBlocks) {
    if (block.series.length > limits.dataSeries) {
      errors.push(`Data slide has ${block.series.length} series items but density "${spec.density}" allows at most ${limits.dataSeries}.`);
    }
    if (block.takeaways.length > limits.dataTakeaways) {
      errors.push(`Data slide has ${block.takeaways.length} takeaways but density "${spec.density}" allows at most ${limits.dataTakeaways}.`);
    }
  }

  for (const cards of collected.statCards) {
    if (cards.length > limits.statCards) {
      errors.push(`Stats slide has ${cards.length} cards but density "${spec.density}" allows at most ${limits.statCards}.`);
    }
  }

  for (const panel of collected.mediaPanels) {
    if (panel.bullets.length > limits.mediaBullets) {
      errors.push(`Mixed-media slide has ${panel.bullets.length} bullets but density "${spec.density}" allows at most ${limits.mediaBullets}.`);
    }
  }

  for (const nodes of collected.hierarchySets) {
    if (nodes.length > limits.hierarchyNodes) {
      errors.push(`Hierarchy slide has ${nodes.length} nodes but density "${spec.density}" allows at most ${limits.hierarchyNodes}.`);
    }
  }

  for (const stages of collected.roadmapSets) {
    if (stages.length > limits.roadmapStages) {
      errors.push(`Roadmap slide has ${stages.length} stages but density "${spec.density}" allows at most ${limits.roadmapStages}.`);
    }
  }

  for (const quadrants of collected.quadrantSets) {
    quadrants.forEach((quadrant, index) => {
      if (quadrant.items.length > limits.quadrantItemsPerQuadrant) {
        errors.push(`Quadrant ${index + 1} has ${quadrant.items.length} items but density "${spec.density}" allows at most ${limits.quadrantItemsPerQuadrant}.`);
      }
    });
  }

  const infographicSets = [
    ...collected.cycleSets,
    ...collected.pyramidSets,
    ...collected.staircaseSets,
    ...collected.boxGridSets,
  ];
  for (const items of infographicSets) {
    if (items.length > limits.infographicItems) {
      errors.push(`Infographic slide has ${items.length} items but density "${spec.density}" allows at most ${limits.infographicItems}.`);
    }
  }

  for (const map of collected.relationMaps) {
    if (map.nodes.length > limits.infographicItems) {
      errors.push(`Relation map has ${map.nodes.length} nodes but density "${spec.density}" allows at most ${limits.infographicItems}.`);
    }
  }
}

function validateSlide(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const errors = [];

  validateModuleShape(source, filePath, errors);
  validateThemeContract(source, errors);
  const slideSpec = validateSlideSpec(source, errors);
  validateThankYouPlacement(source, slideSpec, errors);
  validateLanguageConsistency(source, errors);
  validateLayoutHelperRouting(slideSpec, source, errors);
  validateSafeFrame(source, errors);

  const fakeBulletPatterns = [
    /\b[A-Za-z_$][\w$]*\.addText\(\s*(['"`])\s*[•✓]\s*\1\s*\+/g,
    /\b[A-Za-z_$][\w$]*\.addText\(\s*(['"`])\s*[•✓]\s+[^'"`]*\1/g,
    /\b[A-Za-z_$][\w$]*\.addText\(\s*(['"`])\s*[-*]\s+\1\s*\+/g,
  ];

  if (fakeBulletPatterns.some((pattern) => pattern.test(source))) {
    errors.push('Found typed bullet characters inside slide.addText(). Use PptxGenJS bullet formatting instead.');
  }

  const bulletSets = collectBulletHelperSets(source);

  for (const block of collectArrayBlocks(source)) {
    const bulletEntries = collectBulletEntries(block);
    if (!bulletEntries.length) continue;

    bulletEntries.forEach((entry, index) => {
      const isLast = index === bulletEntries.length - 1;
      if (!isLast && !entry.hasBreakLine) {
        errors.push(`Bullet ${index + 1} is missing breakLine: true.`);
      }

      if (entry.text.length > 140 || countSentences(entry.text) > 1) {
        errors.push(`Bullet ${index + 1} is too dense. Split it into shorter bullet items.`);
      }
    });

    if (bulletEntries.length === 1) {
      errors.push('Found a single bullet entry in a bullet list. Split dense content into multiple bullets or rows.');
    }
  }

  const summaryRowSets = collectSummaryRowSets(source);
  for (const summaryRows of summaryRowSets) {
    validateSummaryRows(summaryRows, errors);
  }

  const processStepSets = collectProcessStepSets(source);
  for (const processSteps of processStepSets) {
    validateProcessSteps(processSteps, errors);
  }

  const comparisonSets = collectComparisonSets(source);
  for (const comparisonColumns of comparisonSets) {
    validateComparisonColumns(comparisonColumns, errors);
  }

  const dataBlocks = extractDataBlocks(source);
  for (const dataBlock of dataBlocks) {
    validateDataBlock(dataBlock, errors);
  }

  const statCardSets = collectStatCardSets(source);
  for (const statCards of statCardSets) {
    validateStatCards(statCards, errors);
  }

  const mediaPanels = collectMediaPanels(source);
  for (const mediaPanel of mediaPanels) {
    validateMediaPanel(mediaPanel, errors);
  }

  const hierarchySets = collectHierarchySets(source);
  for (const hierarchyNodes of hierarchySets) {
    validateHierarchyNodes(hierarchyNodes, errors);
  }

  const roadmapSets = collectRoadmapSets(source);
  for (const roadmapStages of roadmapSets) {
    validateRoadmapStages(roadmapStages, errors);
  }

  const quadrantSets = collectQuadrantSets(source);
  for (const quadrants of quadrantSets) {
    validateQuadrants(quadrants, errors);
  }

  const relationMaps = collectRelationMaps(source);
  for (const relationMap of relationMaps) {
    validateRelationMap(relationMap, errors);
  }

  const cycleSets = collectGenericInfographicSets(source, 'addCycleDiagram');
  for (const items of cycleSets) {
    validateGenericInfographicItems(items, errors, 'Cycle diagram', 3, 6);
  }

  const pyramidSets = collectGenericInfographicSets(source, 'addPyramid');
  for (const items of pyramidSets) {
    validateGenericInfographicItems(items, errors, 'Pyramid', 3, 5);
  }

  const staircaseSets = collectGenericInfographicSets(source, 'addStaircase');
  for (const items of staircaseSets) {
    validateGenericInfographicItems(items, errors, 'Staircase', 3, 5);
  }

  const boxGridSets = collectGenericInfographicSets(source, 'addBoxGrid');
  for (const items of boxGridSets) {
    validateGenericInfographicItems(items, errors, 'Box grid', 2, 6);
  }

  validateDensityBudget(slideSpec, {
    bulletSets,
    summaryRows: summaryRowSets,
    processSteps: processStepSets,
    comparisonColumns: comparisonSets,
    dataBlocks,
    statCards: statCardSets,
    mediaPanels,
    hierarchySets,
    roadmapSets,
    quadrantSets,
    relationMaps,
    cycleSets,
    pyramidSets,
    staircaseSets,
    boxGridSets,
  }, errors);

  const result = { filePath, slideSpec, errors };

  if (errors.length) {
    const relative = path.relative(process.cwd(), filePath) || filePath;
    console.error(`Slide structure validation failed for ${relative}`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return result;
  }

  console.log(`Slide structure validation passed for ${path.relative(process.cwd(), filePath) || filePath}`);
  return result;
}

function findRepeatedRun(items, key) {
  let previous = '';
  let count = 0;

  for (const item of items) {
    const value = item.slideSpec?.[key] || '';
    if (!value) {
      previous = '';
      count = 0;
      continue;
    }

    if (value === previous) {
      count += 1;
    } else {
      previous = value;
      count = 1;
    }

    if (count >= 3) {
      return value;
    }
  }

  return '';
}

function validateDeckRhythm(results) {
  const contentSlides = results
    .filter((result) => result?.slideSpec?.type === 'content')
    .sort((a, b) => (a.slideSpec.index || 0) - (b.slideSpec.index || 0));

  if (contentSlides.length < 2) return;

  const errors = [];
  const distinctFamilies = new Set(contentSlides.map((result) => result.slideSpec.layoutFamily).filter(Boolean));
  const distinctPatterns = new Set(contentSlides.map((result) => result.slideSpec.visualPattern?.toUpperCase()).filter(Boolean));
  const bulletLikeCount = contentSlides.filter((result) => {
    const family = result.slideSpec.layoutFamily;
    const pattern = result.slideSpec.visualPattern?.toUpperCase();
    return family === 'text-visual' || pattern === 'BULLETS';
  }).length;
  const familyRun = findRepeatedRun(contentSlides, 'layoutFamily');
  const sectionRun = findRepeatedRun(contentSlides, 'sectionLayout');

  if (contentSlides.length >= 15 && distinctFamilies.size < 6) {
    errors.push(`Deck has ${contentSlides.length} content slides but only ${distinctFamilies.size} layout families. Use at least 6.`);
  } else if (contentSlides.length >= 8 && distinctFamilies.size < 4) {
    errors.push(`Deck has ${contentSlides.length} content slides but only ${distinctFamilies.size} layout families. Use at least 4.`);
  }

  if (contentSlides.length >= 15 && distinctPatterns.size < 6) {
    errors.push(`Deck has ${contentSlides.length} content slides but only ${distinctPatterns.size} visual patterns. Use at least 6.`);
  } else if (contentSlides.length >= 8 && distinctPatterns.size < 4) {
    errors.push(`Deck has ${contentSlides.length} content slides but only ${distinctPatterns.size} visual patterns. Use at least 4.`);
  }

  if (contentSlides.length >= 4 && bulletLikeCount / contentSlides.length > 0.25) {
    errors.push(`Bullet-like/text-visual slides are ${bulletLikeCount}/${contentSlides.length}. Keep them at or below 25% of content slides.`);
  }

  if (familyRun) {
    errors.push(`Deck repeats layoutFamily "${familyRun}" for 3+ consecutive content slides.`);
  }

  if (sectionRun) {
    errors.push(`Deck repeats sectionLayout "${sectionRun}" for 3+ consecutive content slides.`);
  }

  if (errors.length) {
    console.error('Deck rhythm validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Deck rhythm validation passed for ${contentSlides.length} content slides`);
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: node validate-slide-bullets.cjs <slide-file> [more-files]');
  process.exit(1);
}

const results = [];
for (const target of targets) {
  results.push(validateSlide(path.resolve(process.cwd(), target)));
}
validateDeckRhythm(results);
