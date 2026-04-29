function assertLayout(layout, helperName) {
  if (!layout || typeof layout !== 'object') {
    throw new Error(`${helperName} needs a layout object.`);
  }
  for (const key of ['x', 'y', 'w', 'h']) {
    if (typeof layout[key] !== 'number') {
      throw new Error(`${helperName} layout is missing numeric ${key}.`);
    }
  }
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function addEditorialQuote(slide, data, layout, theme, options = {}) {
  assertLayout(layout, 'Editorial quote');
  const quote = cleanText(data?.quote);
  const attribution = cleanText(data?.attribution);
  const kicker = cleanText(data?.kicker);

  if (!quote) {
    throw new Error('Editorial quote needs quote text.');
  }

  const { x, y, w, h, titleFontFace, bodyFontFace } = layout;
  const accentW = options.accentWidth || 0.12;

  slide.addShape('rect', {
    x,
    y,
    w: accentW,
    h,
    fill: { color: options.accentColor || theme.accent },
    line: { color: options.accentColor || theme.accent, transparency: 100 },
  });

  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: x + 0.35,
      y,
      w: w - 0.35,
      h: 0.28,
      fontSize: options.kickerFontSize || 9,
      fontFace: bodyFontFace,
      bold: true,
      color: options.kickerColor || theme.accent,
      margin: 0,
      fit: 'shrink',
    });
  }

  slide.addText(`"${quote}"`, {
    x: x + 0.35,
    y: y + (kicker ? 0.45 : 0.08),
    w: w - 0.45,
    h: h - (attribution ? 0.75 : 0.2),
    fontSize: options.quoteFontSize || 28,
    fontFace: titleFontFace,
    bold: true,
    color: options.quoteColor || theme.primary,
    breakLine: false,
    margin: 0,
    fit: 'shrink',
  });

  if (attribution) {
    slide.addText(attribution, {
      x: x + 0.35,
      y: y + h - 0.35,
      w: w - 0.45,
      h: 0.28,
      fontSize: options.attributionFontSize || 11,
      fontFace: bodyFontFace,
      color: options.attributionColor || theme.secondary,
      margin: 0,
      fit: 'shrink',
    });
  }
}

function addMetricWall(slide, cards, layout, theme, options = {}) {
  assertLayout(layout, 'Metric wall');
  if (!Array.isArray(cards) || cards.length < 2) {
    throw new Error('Metric wall needs at least two metric cards.');
  }

  const normalized = cards
    .map((card) => ({
      value: cleanText(String(card?.value ?? '')),
      label: cleanText(card?.label),
      detail: cleanText(card?.detail),
    }))
    .filter((card) => card.value && card.label);

  if (normalized.length < 2) {
    throw new Error('Metric wall needs at least two valid metric cards.');
  }

  const { x, y, w, h, valueFontFace, labelFontFace, detailFontFace } = layout;
  const columns = options.columns || Math.min(4, normalized.length);
  const rows = Math.ceil(normalized.length / columns);
  const gap = options.gap || 0.22;
  const cardW = (w - gap * (columns - 1)) / columns;
  const cardH = (h - gap * (rows - 1)) / rows;

  normalized.forEach((card, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const cardX = x + col * (cardW + gap);
    const cardY = y + row * (cardH + gap);
    const isLead = index === 0 && options.emphasizeFirst !== false;

    slide.addShape('roundRect', {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      rectRadius: options.radius ?? 0.06,
      fill: { color: isLead ? theme.primary : options.cardFill || theme.light },
      line: { color: isLead ? theme.primary : options.cardLine || theme.accent, width: 1 },
    });

    slide.addText(card.value, {
      x: cardX + 0.2,
      y: cardY + 0.16,
      w: cardW - 0.4,
      h: isLead ? 0.58 : 0.44,
      fontSize: isLead ? options.leadValueFontSize || 30 : options.valueFontSize || 22,
      fontFace: valueFontFace,
      bold: true,
      color: isLead ? options.leadTextColor || theme.bg : options.valueColor || theme.primary,
      margin: 0,
      fit: 'shrink',
    });

    slide.addText(card.label, {
      x: cardX + 0.2,
      y: cardY + (isLead ? 0.86 : 0.7),
      w: cardW - 0.4,
      h: 0.36,
      fontSize: options.labelFontSize || 12,
      fontFace: labelFontFace || valueFontFace,
      bold: true,
      color: isLead ? options.leadTextColor || theme.bg : options.labelColor || theme.secondary,
      margin: 0,
      fit: 'shrink',
    });

    if (card.detail) {
      slide.addText(card.detail, {
        x: cardX + 0.2,
        y: cardY + (isLead ? 1.2 : 1.02),
        w: cardW - 0.4,
        h: Math.max(0.22, cardH - (isLead ? 1.35 : 1.18)),
        fontSize: options.detailFontSize || 9,
        fontFace: detailFontFace || labelFontFace || valueFontFace,
        color: isLead ? options.leadTextColor || theme.bg : options.detailColor || theme.secondary,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function addLayeredStack(slide, layers, layout, theme, options = {}) {
  assertLayout(layout, 'Layered stack');
  if (!Array.isArray(layers) || layers.length < 2 || layers.length > 5) {
    throw new Error('Layered stack needs 2-5 layers.');
  }

  const normalized = layers
    .map((layer) => ({
      title: cleanText(layer?.title),
      detail: cleanText(layer?.detail),
      tag: cleanText(layer?.tag),
    }))
    .filter((layer) => layer.title);

  if (normalized.length < 2) {
    throw new Error('Layered stack needs at least two valid layers.');
  }

  const { x, y, w, h, titleFontFace, detailFontFace } = layout;
  const gap = options.gap || 0.16;
  const layerH = (h - gap * (normalized.length - 1)) / normalized.length;
  const insetStep = options.insetStep || 0.16;

  normalized.forEach((layer, index) => {
    const inset = insetStep * index;
    const layerX = x + inset;
    const layerY = y + index * (layerH + gap);
    const layerW = w - inset * 2;
    const fill = index === 0 ? options.topFill || theme.primary : options.fill || theme.light;
    const textColor = index === 0 ? options.topTextColor || theme.bg : options.textColor || theme.primary;

    slide.addShape('roundRect', {
      x: layerX,
      y: layerY,
      w: layerW,
      h: layerH,
      rectRadius: options.radius ?? 0.05,
      fill: { color: fill },
      line: { color: options.lineColor || theme.accent, width: 0.9 },
    });

    if (layer.tag) {
      slide.addText(layer.tag.toUpperCase(), {
        x: layerX + 0.18,
        y: layerY + 0.14,
        w: 0.76,
        h: 0.22,
        fontSize: 8,
        fontFace: detailFontFace,
        bold: true,
        color: index === 0 ? theme.bg : theme.accent,
        margin: 0,
        fit: 'shrink',
      });
    }

    slide.addText(layer.title, {
      x: layerX + 0.18 + (layer.tag ? 0.78 : 0),
      y: layerY + 0.12,
      w: layerW - 0.36 - (layer.tag ? 0.78 : 0),
      h: 0.32,
      fontSize: options.titleFontSize || 15,
      fontFace: titleFontFace,
      bold: true,
      color: textColor,
      margin: 0,
      fit: 'shrink',
    });

    if (layer.detail) {
      slide.addText(layer.detail, {
        x: layerX + 0.18,
        y: layerY + 0.5,
        w: layerW - 0.36,
        h: Math.max(0.2, layerH - 0.62),
        fontSize: options.detailFontSize || 10,
        fontFace: detailFontFace || titleFontFace,
        color: index === 0 ? theme.bg : theme.secondary,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function addEvidenceMedia(slide, data, layout, theme, options = {}) {
  assertLayout(layout, 'Evidence media');
  const imagePath = cleanText(data?.imagePath);
  const title = cleanText(data?.title);
  const caption = cleanText(data?.caption);
  const annotation = cleanText(data?.annotation);

  if (!imagePath) {
    throw new Error('Evidence media needs imagePath.');
  }

  const { x, y, w, h, titleFontFace, bodyFontFace } = layout;
  const captionH = title || caption || annotation ? 0.72 : 0;

  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    rectRadius: options.radius ?? 0.06,
    fill: { color: options.frameFill || theme.light },
    line: { color: options.frameLine || theme.accent, width: 1.1 },
  });

  slide.addImage({
    path: imagePath,
    x: x + 0.16,
    y: y + 0.16,
    w: w - 0.32,
    h: h - 0.32 - captionH,
  });

  if (title) {
    slide.addText(title, {
      x: x + 0.22,
      y: y + h - captionH + 0.12,
      w: w * 0.45,
      h: 0.26,
      fontSize: options.titleFontSize || 11,
      fontFace: titleFontFace,
      bold: true,
      color: options.titleColor || theme.primary,
      margin: 0,
      fit: 'shrink',
    });
  }

  if (caption || annotation) {
    slide.addText(annotation || caption, {
      x: x + (title ? w * 0.5 : 0.22),
      y: y + h - captionH + 0.12,
      w: title ? w * 0.46 : w - 0.44,
      h: 0.38,
      fontSize: options.captionFontSize || 9,
      fontFace: bodyFontFace || titleFontFace,
      color: options.captionColor || theme.secondary,
      margin: 0,
      fit: 'shrink',
    });
  }
}

function addDiagonalCompare(slide, columns, layout, theme, options = {}) {
  assertLayout(layout, 'Diagonal compare');
  if (!Array.isArray(columns) || columns.length !== 2) {
    throw new Error('Diagonal compare needs exactly two columns.');
  }

  const normalized = columns.map((column) => ({
    title: cleanText(column?.title),
    body: cleanText(column?.body),
    label: cleanText(column?.label),
  }));

  if (normalized.some((column) => !column.title)) {
    throw new Error('Diagonal compare columns need titles.');
  }

  const { x, y, w, h, titleFontFace, bodyFontFace } = layout;
  const gap = options.gap || 0.18;
  const panelW = (w - gap) / 2;

  normalized.forEach((column, index) => {
    const panelX = x + index * (panelW + gap);
    const fill = index === 0 ? options.beforeFill || theme.light : options.afterFill || theme.primary;
    const textColor = index === 0 ? options.beforeTextColor || theme.primary : options.afterTextColor || theme.bg;

    slide.addShape('roundRect', {
      x: panelX,
      y: y + index * 0.18,
      w: panelW,
      h: h - index * 0.18,
      rectRadius: options.radius ?? 0.06,
      fill: { color: fill },
      line: { color: index === 0 ? theme.accent : theme.primary, width: 1 },
    });

    if (column.label) {
      slide.addText(column.label.toUpperCase(), {
        x: panelX + 0.24,
        y: y + 0.2 + index * 0.18,
        w: panelW - 0.48,
        h: 0.22,
        fontSize: 8,
        fontFace: bodyFontFace,
        bold: true,
        color: index === 0 ? theme.accent : theme.bg,
        margin: 0,
        fit: 'shrink',
      });
    }

    slide.addText(column.title, {
      x: panelX + 0.24,
      y: y + 0.55 + index * 0.18,
      w: panelW - 0.48,
      h: 0.48,
      fontSize: options.titleFontSize || 20,
      fontFace: titleFontFace,
      bold: true,
      color: textColor,
      margin: 0,
      fit: 'shrink',
    });

    if (column.body) {
      slide.addText(column.body, {
        x: panelX + 0.24,
        y: y + 1.18 + index * 0.18,
        w: panelW - 0.48,
        h: h - 1.42,
        fontSize: options.bodyFontSize || 12,
        fontFace: bodyFontFace || titleFontFace,
        color: textColor,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function addHeroImageOverlay(slide, data, layout, theme, options = {}) {
  assertLayout(layout, 'Hero image overlay');
  const imagePath = cleanText(data?.imagePath);
  const title = cleanText(data?.title);
  const subtitle = cleanText(data?.subtitle);
  const eyebrow = cleanText(data?.eyebrow);

  if (!imagePath || !title) {
    throw new Error('Hero image overlay needs imagePath and title.');
  }

  const { x, y, w, h, titleFontFace, bodyFontFace } = layout;
  slide.addImage({ path: imagePath, x, y, w, h });
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: options.overlayColor || theme.primary, transparency: options.overlayTransparency ?? 24 },
    line: { color: options.overlayColor || theme.primary, transparency: 100 },
  });

  if (eyebrow) {
    slide.addText(eyebrow.toUpperCase(), {
      x: x + 0.45,
      y: y + h - 1.62,
      w: w - 0.9,
      h: 0.24,
      fontSize: options.eyebrowFontSize || 9,
      fontFace: bodyFontFace,
      bold: true,
      color: options.eyebrowColor || theme.accent,
      margin: 0,
      fit: 'shrink',
    });
  }

  slide.addText(title, {
    x: x + 0.45,
    y: y + h - 1.28,
    w: w - 0.9,
    h: 0.58,
    fontSize: options.titleFontSize || 30,
    fontFace: titleFontFace,
    bold: true,
    color: options.titleColor || theme.bg,
    margin: 0,
    fit: 'shrink',
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: x + 0.45,
      y: y + h - 0.62,
      w: w - 0.9,
      h: 0.32,
      fontSize: options.subtitleFontSize || 12,
      fontFace: bodyFontFace || titleFontFace,
      color: options.subtitleColor || theme.bg,
      margin: 0,
      fit: 'shrink',
    });
  }
}

module.exports = {
  addEditorialQuote,
  addMetricWall,
  addLayeredStack,
  addEvidenceMedia,
  addDiagonalCompare,
  addHeroImageOverlay,
};
