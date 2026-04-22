function normalizeSummaryItems(items) {
  if (!Array.isArray(items)) {
    throw new Error('Summary items must be an array.');
  }

  const normalized = items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const body = typeof item.body === 'string' ? item.body.trim() : '';
      return title || body ? { title, body } : null;
    })
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error('Summary rows must contain at least one non-empty item.');
  }

  return normalized;
}

function addSummaryRows(slide, items, layout, theme, options = {}) {
  const normalized = normalizeSummaryItems(items);
  const {
    x,
    y,
    w,
    h,
    rowGap = 0.18,
    rowHeight,
    iconSize = 0.34,
    iconTextGap = 0.16,
    titleFontSize = 20,
    bodyFontSize = 13,
    titleFontFace,
    bodyFontFace,
    titleColor = theme.secondary,
    bodyColor = theme.secondary,
  } = layout;

  const computedRowHeight = rowHeight
    || (typeof h === 'number' && h > 0
      ? Math.max(0.62, (h - rowGap * (normalized.length - 1)) / normalized.length)
      : Math.max(0.72, (itemHasBody(normalized) ? 0.78 : 0.52)));

  normalized.forEach((item, index) => {
    const rowY = y + index * (computedRowHeight + rowGap);
    const iconY = rowY + Math.max(0.02, (computedRowHeight - iconSize) / 2);

    slide.addShape('ellipse', {
      x,
      y: iconY,
      w: iconSize,
      h: iconSize,
      fill: { color: options.iconFill || theme.accent },
      line: { color: options.iconLine || theme.accent, width: 1 },
    });

    slide.addText(String(index + 1), {
      x,
      y: iconY,
      w: iconSize,
      h: iconSize,
      fontSize: options.iconFontSize || 11,
      fontFace: bodyFontFace,
      bold: true,
      color: options.iconTextColor || theme.bg,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });

    const textX = x + iconSize + iconTextGap;
    const textW = w - iconSize - iconTextGap;

    if (item.title) {
      slide.addText(item.title, {
        x: textX,
        y: rowY,
        w: textW,
        h: Math.min(0.34, computedRowHeight * 0.42),
        fontSize: titleFontSize,
        fontFace: titleFontFace,
        bold: true,
        color: titleColor,
        margin: 0,
        fit: 'shrink',
      });
    }

    if (item.body) {
      slide.addText(item.body, {
        x: textX,
        y: rowY + (item.title ? Math.min(0.36, computedRowHeight * 0.44) : 0),
        w: textW,
        h: item.title
          ? Math.max(0.24, computedRowHeight - Math.min(0.4, computedRowHeight * 0.5))
          : computedRowHeight,
        fontSize: bodyFontSize,
        fontFace: bodyFontFace,
        color: bodyColor,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function itemHasBody(items) {
  return items.some((item) => item.body);
}

module.exports = {
  normalizeSummaryItems,
  addSummaryRows,
};
