function normalizeStatCards(cards) {
  if (!Array.isArray(cards) || cards.length < 2) {
    throw new Error('Stat grid needs at least two cards.');
  }

  const normalized = cards
    .map((card) => {
      if (!card || typeof card !== 'object') return null;
      const value = typeof card.value === 'string' ? card.value.trim() : String(card.value ?? '').trim();
      const label = typeof card.label === 'string' ? card.label.trim() : '';
      const detail = typeof card.detail === 'string' ? card.detail.trim() : '';
      if (!value || !label) return null;
      return { value, label, detail };
    })
    .filter(Boolean);

  if (normalized.length < 2) {
    throw new Error('Stat grid needs at least two valid cards.');
  }

  return normalized;
}

function splitMetricValue(value) {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^([+-]?\d+(?:[.,]\d+)?(?:\s?[%×x])?)(?:\s+(.+))$/);
  if (!match) {
    return { main: normalized, unit: '' };
  }

  const unit = match[2].trim();
  if (!unit || unit.length > 12 || /\d/.test(unit)) {
    return { main: normalized, unit: '' };
  }

  return {
    main: match[1].replace(/\s+/g, ''),
    unit,
  };
}

function isMetricLike(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return false;
  if (/^[+-]?\d/.test(normalized)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized)) return true;
  return false;
}

function addStatCardGrid(slide, cards, layout, theme, options = {}) {
  const normalized = normalizeStatCards(cards);
  const {
    x,
    y,
    w,
    h,
    columns = normalized.length >= 4 ? 2 : normalized.length,
    cardGapX = 0.32,
    cardGapY = 0.26,
    valueFontFace,
    labelFontFace,
    detailFontFace,
  } = layout;

  const rows = Math.ceil(normalized.length / columns);
  const cardW = (w - cardGapX * (columns - 1)) / columns;
  const cardH = (h - cardGapY * (rows - 1)) / rows;
  const boundedValueFontSize = Math.min(options.valueFontSize || 24, cardH < 1.25 ? 20 : 24);
  const boundedUnitFontSize = Math.max(9, Math.round(boundedValueFontSize * 0.52));
  const boundedLabelFontSize = Math.min(options.labelFontSize || 13, cardH < 1.25 ? 10 : 13);
  const boundedDetailFontSize = Math.min(options.detailFontSize || 10, cardH < 1.25 ? 8 : 10);

  normalized.forEach((card, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const cardX = x + col * (cardW + cardGapX);
    const cardY = y + row * (cardH + cardGapY);

    slide.addShape('roundRect', {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      rectRadius: options.radius ?? 0.08,
      fill: { color: options.cardFill || theme.light },
      line: { color: options.cardLine || theme.accent, width: 1.4 },
    });

    const metricValue = splitMetricValue(card.value);
    const valueLineH = Math.min(0.46, Math.max(0.3, cardH * 0.34));
    const valueFont = options.valueFontFace || (isMetricLike(metricValue.main) ? (labelFontFace || detailFontFace || 'Segoe UI') : valueFontFace);
    const unitW = metricValue.unit ? Math.min(1.1, Math.max(0.38, metricValue.unit.length * 0.085)) : 0;
    const estimatedMetricW = Math.max(0.42, metricValue.main.length * boundedValueFontSize * 0.009);
    const valueW = unitW
      ? Math.min(cardW - 0.44 - unitW - 0.08, estimatedMetricW)
      : cardW - 0.44;

    slide.addText(metricValue.main, {
      x: cardX + 0.22,
      y: cardY + 0.18,
      w: valueW,
      h: valueLineH,
      fontSize: boundedValueFontSize,
      fontFace: valueFont,
      bold: true,
      color: options.valueColor || theme.primary,
      margin: 0,
      fit: 'shrink',
    });

    if (metricValue.unit) {
      slide.addText(metricValue.unit, {
        x: cardX + 0.22 + valueW + 0.08,
        y: cardY + 0.18 + Math.max(0.08, valueLineH * 0.28),
        w: unitW,
        h: Math.max(0.18, valueLineH * 0.58),
        fontSize: boundedUnitFontSize,
        fontFace: labelFontFace || detailFontFace || valueFont,
        bold: true,
        color: options.valueColor || theme.primary,
        margin: 0,
        fit: 'shrink',
      });
    }

    slide.addText(card.label, {
      x: cardX + 0.22,
      y: cardY + Math.min(0.72, Math.max(0.52, cardH * 0.48)),
      w: cardW - 0.44,
      h: Math.min(0.36, Math.max(0.22, cardH * 0.25)),
      fontSize: boundedLabelFontSize,
      fontFace: labelFontFace || valueFontFace,
      bold: true,
      color: options.labelColor || theme.secondary,
      margin: 0,
      fit: 'shrink',
    });

    if (card.detail) {
      const detailY = cardY + Math.min(1.06, Math.max(0.82, cardH * 0.72));
      slide.addText(card.detail, {
        x: cardX + 0.22,
        y: detailY,
        w: cardW - 0.44,
        h: Math.max(0.18, cardH - (detailY - cardY) - 0.12),
        fontSize: boundedDetailFontSize,
        fontFace: detailFontFace || labelFontFace || valueFontFace,
        color: options.detailColor || theme.secondary,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

module.exports = {
  normalizeStatCards,
  addStatCardGrid,
};
