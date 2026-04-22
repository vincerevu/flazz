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
  return /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text);
}

function hasCjk(text) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);
}

function hasSlashGloss(text) {
  return /[A-Za-zÀ-ỹ\u3400-\u9FFF][^"'`\n]{0,36}\s\/\s[^"'`\n]{1,36}[A-Za-zÀ-ỹ\u3400-\u9FFF]/.test(text);
}

function countPictographicIcons(text) {
  const matches = text.match(/\p{Extended_Pictographic}/gu);
  return matches ? matches.length : 0;
}

function likelyEnglishLabelInVietnameseDeck(text) {
  const normalized = text.toLowerCase();
  return /\b(best practices|use cases|summary|overview|option [ab]|key takeaway|takeaways|workflow|safe touch|unsafe touch|high-five|design|content writing|code development|data analysis|research)\b/.test(normalized);
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

function validateSlideSpec(source, errors) {
  const isContentSlide = /\btype\s*:\s*['"]content['"]/.test(source);
  if (!isContentSlide) return;

  if (!/\bconst\s+slideSpec\s*=/.test(source)) {
    errors.push('Content slide must define const slideSpec before drawing.');
  }

  const layoutFamilyMatch = source.match(/\blayoutFamily\s*:\s*['"]([^'"]+)['"]/);
  const densityMatch = source.match(/\bdensity\s*:\s*['"]([^'"]+)['"]/);
  const layoutVariantMatch = source.match(/\blayoutVariant\s*:\s*['"]([^'"]+)['"]/);
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

  if (!layoutFamilyMatch) {
    errors.push('Content slideSpec is missing layoutFamily.');
  } else if (!allowedFamilies.has(layoutFamilyMatch[1])) {
    errors.push(`Content slideSpec uses unknown layoutFamily "${layoutFamilyMatch[1]}".`);
  }

  if (!layoutVariantMatch) {
    errors.push('Content slideSpec is missing layoutVariant.');
  }

  if (!densityMatch) {
    errors.push('Content slideSpec is missing density.');
  } else if (!allowedDensities.has(densityMatch[1])) {
    errors.push(`Content slideSpec uses unknown density "${densityMatch[1]}".`);
  }
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

function validateSlide(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const errors = [];

  validateModuleShape(source, filePath, errors);
  validateThemeContract(source, errors);
  validateSlideSpec(source, errors);
  validateLanguageConsistency(source, errors);

  const fakeBulletPatterns = [
    /\b[A-Za-z_$][\w$]*\.addText\(\s*(['"`])\s*[•✓]\s*\1\s*\+/g,
    /\b[A-Za-z_$][\w$]*\.addText\(\s*(['"`])\s*[•✓]\s+[^'"`]*\1/g,
    /\b[A-Za-z_$][\w$]*\.addText\(\s*(['"`])\s*[-*]\s+\1\s*\+/g,
  ];

  if (fakeBulletPatterns.some((pattern) => pattern.test(source))) {
    errors.push('Found typed bullet characters inside slide.addText(). Use PptxGenJS bullet formatting instead.');
  }

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

  for (const summaryRows of collectSummaryRowSets(source)) {
    validateSummaryRows(summaryRows, errors);
  }

  for (const processSteps of collectProcessStepSets(source)) {
    validateProcessSteps(processSteps, errors);
  }

  for (const comparisonColumns of collectComparisonSets(source)) {
    validateComparisonColumns(comparisonColumns, errors);
  }

  for (const dataBlock of extractDataBlocks(source)) {
    validateDataBlock(dataBlock, errors);
  }

  for (const statCards of collectStatCardSets(source)) {
    validateStatCards(statCards, errors);
  }

  for (const mediaPanel of collectMediaPanels(source)) {
    validateMediaPanel(mediaPanel, errors);
  }

  for (const hierarchyNodes of collectHierarchySets(source)) {
    validateHierarchyNodes(hierarchyNodes, errors);
  }

  for (const roadmapStages of collectRoadmapSets(source)) {
    validateRoadmapStages(roadmapStages, errors);
  }

  for (const quadrants of collectQuadrantSets(source)) {
    validateQuadrants(quadrants, errors);
  }

  for (const relationMap of collectRelationMaps(source)) {
    validateRelationMap(relationMap, errors);
  }

  for (const items of collectGenericInfographicSets(source, 'addCycleDiagram')) {
    validateGenericInfographicItems(items, errors, 'Cycle diagram', 3, 6);
  }

  for (const items of collectGenericInfographicSets(source, 'addPyramid')) {
    validateGenericInfographicItems(items, errors, 'Pyramid', 3, 5);
  }

  for (const items of collectGenericInfographicSets(source, 'addStaircase')) {
    validateGenericInfographicItems(items, errors, 'Staircase', 3, 5);
  }

  for (const items of collectGenericInfographicSets(source, 'addBoxGrid')) {
    validateGenericInfographicItems(items, errors, 'Box grid', 2, 6);
  }

  if (errors.length) {
    const relative = path.relative(process.cwd(), filePath) || filePath;
    console.error(`Slide structure validation failed for ${relative}`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Slide structure validation passed for ${path.relative(process.cwd(), filePath) || filePath}`);
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: node validate-slide-bullets.cjs <slide-file> [more-files]');
  process.exit(1);
}

for (const target of targets) {
  validateSlide(path.resolve(process.cwd(), target));
}
