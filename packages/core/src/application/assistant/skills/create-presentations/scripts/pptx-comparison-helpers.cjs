function normalizeComparisonColumns(columns) {
  if (!Array.isArray(columns) || columns.length !== 2) {
    throw new Error('Comparison layout requires exactly two columns.');
  }

  const normalized = columns.map((column) => {
    if (!column || typeof column !== 'object') return null;
    const title = typeof column.title === 'string' ? column.title.trim() : '';
    const items = Array.isArray(column.items)
      ? column.items.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [];
    return title || items.length ? { title, items } : null;
  });

  if (normalized.some((column) => !column)) {
    throw new Error('Comparison columns must contain valid title/items data.');
  }

  if (normalized.some((column) => !column.title)) {
    throw new Error('Each comparison column needs a title.');
  }

  if (normalized.some((column) => column.items.length === 0)) {
    throw new Error('Each comparison column needs at least one item.');
  }

  return normalized;
}

function addComparisonCards(slide, columns, layout, theme, options = {}) {
  const normalized = normalizeComparisonColumns(columns);
  const {
    x,
    y,
    w,
    h,
    gap = 0.35,
    titleFontFace,
    bodyFontFace,
    titleFontSize = 20,
    bodyFontSize = 13,
  } = layout;

  const cardW = (w - gap) / 2;

  normalized.forEach((column, index) => {
    const cardX = x + index * (cardW + gap);

    slide.addShape('roundRect', {
      x: cardX,
      y,
      w: cardW,
      h,
      rectRadius: options.rectRadius ?? 0.12,
      fill: { color: index === 0 ? (options.leftFill || theme.bg) : (options.rightFill || theme.light) },
      line: { color: options.lineColor || theme.accent, width: 1.5 },
    });

    slide.addText(column.title, {
      x: cardX + 0.2,
      y: y + 0.18,
      w: cardW - 0.4,
      h: 0.24,
      fontSize: titleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: options.titleColor || theme.primary,
      margin: 0,
      align: 'center',
    });

    const bulletRuns = column.items.map((item, itemIndex) => ({
      text: item,
      options: {
        bullet: true,
        ...(itemIndex < column.items.length - 1 ? { breakLine: true } : {}),
      },
    }));

    slide.addText(bulletRuns, {
      x: cardX + 0.22,
      y: y + 0.62,
      w: cardW - 0.44,
      h: h - 0.8,
      fontSize: bodyFontSize,
      fontFace: bodyFontFace,
      color: options.bodyColor || theme.secondary,
      margin: 0,
      breakLine: false,
      paraSpaceAfterPt: 8,
    });
  });
}

module.exports = {
  normalizeComparisonColumns,
  addComparisonCards,
};
