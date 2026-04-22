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

    slide.addText(card.value, {
      x: cardX + 0.22,
      y: cardY + 0.18,
      w: cardW - 0.44,
      h: 0.44,
      fontSize: options.valueFontSize || 24,
      fontFace: valueFontFace,
      bold: true,
      color: options.valueColor || theme.primary,
      margin: 0,
      fit: 'shrink',
    });

    slide.addText(card.label, {
      x: cardX + 0.22,
      y: cardY + 0.72,
      w: cardW - 0.44,
      h: 0.36,
      fontSize: options.labelFontSize || 13,
      fontFace: labelFontFace || valueFontFace,
      bold: true,
      color: options.labelColor || theme.secondary,
      margin: 0,
      fit: 'shrink',
    });

    if (card.detail) {
      slide.addText(card.detail, {
        x: cardX + 0.22,
        y: cardY + 1.06,
        w: cardW - 0.44,
        h: Math.max(0.28, cardH - 1.24),
        fontSize: options.detailFontSize || 10,
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
