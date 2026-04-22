function normalizeQuadrants(quadrants) {
  if (!Array.isArray(quadrants) || quadrants.length !== 4) {
    throw new Error('Quadrant layout requires exactly four quadrants.');
  }

  return quadrants.map((quadrant, index) => {
    if (!quadrant || typeof quadrant !== 'object') {
      throw new Error(`Quadrant ${index + 1} must be an object.`);
    }

    const title = typeof quadrant.title === 'string' ? quadrant.title.trim() : '';
    const body = typeof quadrant.body === 'string' ? quadrant.body.trim() : '';
    const items = Array.isArray(quadrant.items)
      ? quadrant.items.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [];

    if (!title) {
      throw new Error(`Quadrant ${index + 1} needs a title.`);
    }

    if (!body && items.length === 0) {
      throw new Error(`Quadrant ${index + 1} needs body text or items.`);
    }

    return { title, body, items };
  });
}

function addQuadrantMatrix(slide, quadrants, layout, theme, options = {}) {
  const normalized = normalizeQuadrants(quadrants);
  const {
    x,
    y,
    w,
    h,
    gap = 0.12,
    titleFontFace,
    bodyFontFace,
    titleFontSize = 14,
    bodyFontSize = 10,
    xAxisLabel,
    yAxisLabel,
  } = layout;

  const cellW = (w - gap) / 2;
  const cellH = (h - gap) / 2;

  normalized.forEach((quadrant, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + col * (cellW + gap);
    const cellY = y + row * (cellH + gap);

    slide.addShape('roundRect', {
      x: cellX,
      y: cellY,
      w: cellW,
      h: cellH,
      rectRadius: options.rectRadius ?? 0.1,
      fill: { color: options.fills?.[index] || (index === 0 ? theme.light : theme.bg) },
      line: { color: options.lineColor || theme.accent, width: 1 },
    });

    slide.addText(quadrant.title, {
      x: cellX + 0.16,
      y: cellY + 0.14,
      w: cellW - 0.32,
      h: 0.24,
      fontSize: titleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: options.titleColor || theme.primary,
      margin: 0,
      fit: 'shrink',
    });

    if (quadrant.items.length) {
      const runs = quadrant.items.map((item, itemIndex) => ({
        text: item,
        options: {
          bullet: true,
          ...(itemIndex < quadrant.items.length - 1 ? { breakLine: true } : {}),
        },
      }));

      slide.addText(runs, {
        x: cellX + 0.2,
        y: cellY + 0.5,
        w: cellW - 0.4,
        h: cellH - 0.62,
        fontSize: bodyFontSize,
        fontFace: bodyFontFace,
        color: options.bodyColor || theme.secondary,
        margin: 0,
        paraSpaceAfterPt: 5,
        fit: 'shrink',
      });
    } else {
      slide.addText(quadrant.body, {
        x: cellX + 0.18,
        y: cellY + 0.52,
        w: cellW - 0.36,
        h: cellH - 0.62,
        fontSize: bodyFontSize,
        fontFace: bodyFontFace,
        color: options.bodyColor || theme.secondary,
        margin: 0,
        fit: 'shrink',
      });
    }
  });

  if (xAxisLabel) {
    slide.addText(xAxisLabel, {
      x,
      y: y + h + 0.08,
      w,
      h: 0.18,
      fontSize: options.axisFontSize || 9,
      fontFace: bodyFontFace,
      color: options.axisColor || theme.secondary,
      align: 'center',
      margin: 0,
    });
  }

  if (yAxisLabel) {
    slide.addText(yAxisLabel, {
      x: x - 0.5,
      y: y + h / 2 - 0.12,
      w: 0.45,
      h: 0.24,
      fontSize: options.axisFontSize || 9,
      fontFace: bodyFontFace,
      color: options.axisColor || theme.secondary,
      rotate: 270,
      align: 'center',
      margin: 0,
    });
  }
}

module.exports = {
  normalizeQuadrants,
  addQuadrantMatrix,
};
