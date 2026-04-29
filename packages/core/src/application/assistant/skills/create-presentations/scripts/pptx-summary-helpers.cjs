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
      ? Math.max(0.42, (h - rowGap * (normalized.length - 1)) / normalized.length)
      : Math.max(0.72, (itemHasBody(normalized) ? 0.78 : 0.52)));
  const boundedIconSize = Math.min(iconSize, Math.max(0.22, computedRowHeight - 0.08));
  const boundedTitleFontSize = Math.min(titleFontSize, computedRowHeight < 0.58 ? 15 : titleFontSize);
  const boundedBodyFontSize = Math.min(bodyFontSize, computedRowHeight < 0.58 ? 9 : bodyFontSize);

  normalized.forEach((item, index) => {
    const rowY = y + index * (computedRowHeight + rowGap);
    const iconY = rowY + Math.max(0.02, (computedRowHeight - boundedIconSize) / 2);

    slide.addShape('ellipse', {
      x,
      y: iconY,
      w: boundedIconSize,
      h: boundedIconSize,
      fill: { color: options.iconFill || theme.accent },
      line: { color: options.iconLine || theme.accent, width: 1 },
    });

    slide.addText(String(index + 1), {
      x,
      y: iconY,
      w: boundedIconSize,
      h: boundedIconSize,
      fontSize: Math.min(options.iconFontSize || 11, boundedIconSize < 0.28 ? 8 : 11),
      fontFace: bodyFontFace,
      bold: true,
      color: options.iconTextColor || theme.bg,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });

    const textX = x + boundedIconSize + iconTextGap;
    const textW = w - boundedIconSize - iconTextGap;
    const titleH = item.title ? Math.min(0.3, Math.max(0.18, computedRowHeight * 0.38)) : 0;
    const bodyY = rowY + (item.title ? titleH + 0.05 : 0);

    if (item.title) {
      slide.addText(item.title, {
        x: textX,
        y: rowY,
        w: textW,
        h: titleH,
        fontSize: boundedTitleFontSize,
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
        y: bodyY,
        w: textW,
        h: item.title
          ? Math.max(0.18, computedRowHeight - titleH - 0.07)
          : computedRowHeight,
        fontSize: boundedBodyFontSize,
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
