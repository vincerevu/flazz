function normalizeRoadmapStages(stages) {
  if (!Array.isArray(stages)) {
    throw new Error('Roadmap stages must be an array.');
  }

  const normalized = stages
    .map((stage) => (typeof stage === 'string' ? { label: stage.trim() } : stage))
    .map((stage) => {
      if (!stage || typeof stage !== 'object') return null;
      const tag = typeof stage.tag === 'string' ? stage.tag.trim() : '';
      const label = typeof stage.label === 'string' ? stage.label.trim() : '';
      const caption = typeof stage.caption === 'string' ? stage.caption.trim() : '';
      return tag || label || caption ? { tag, label, caption } : null;
    })
    .filter(Boolean);

  if (normalized.length < 2) {
    throw new Error('Roadmap layout needs at least two stages.');
  }

  return normalized;
}

function addRoadmap(slide, stages, layout, theme, options = {}) {
  const normalized = normalizeRoadmapStages(stages);
  const {
    x,
    y,
    w,
    h,
    gap = 0.18,
    tagFontFace,
    labelFontFace,
    captionFontFace,
    tagFontSize = 9,
    labelFontSize = 15,
    captionFontSize = 10,
  } = layout;

  const cardW = (w - gap * (normalized.length - 1)) / normalized.length;
  const cardH = h;
  const connectorY = y + cardH / 2;

  normalized.forEach((stage, index) => {
    const cardX = x + index * (cardW + gap);

    if (index < normalized.length - 1) {
      slide.addShape('line', {
        x: cardX + cardW,
        y: connectorY,
        w: gap,
        h: 0,
        line: { color: options.connectorColor || theme.accent, width: 2 },
        endArrowType: 'triangle',
      });
    }

    slide.addShape('roundRect', {
      x: cardX,
      y,
      w: cardW,
      h: cardH,
      rectRadius: options.rectRadius ?? 0.12,
      fill: { color: options.fills?.[index] || (index === 0 ? theme.primary : theme.bg) },
      line: { color: options.lineColor || theme.accent, width: 1 },
    });

    const textColor = index === 0 ? (options.activeTextColor || theme.bg) : (options.textColor || theme.primary);
    const mutedColor = index === 0 ? (options.activeMutedColor || theme.bg) : (options.mutedColor || theme.secondary);

    if (stage.tag) {
      slide.addShape('roundRect', {
        x: cardX + 0.16,
        y: y + 0.16,
        w: Math.min(cardW - 0.32, 0.82),
        h: 0.24,
        rectRadius: 0.12,
        fill: { color: index === 0 ? (options.activeTagFill || theme.accent) : (options.tagFill || theme.light) },
        line: { color: index === 0 ? (options.activeTagFill || theme.accent) : (options.tagFill || theme.light), width: 0.5 },
      });

      slide.addText(stage.tag, {
        x: cardX + 0.16,
        y: y + 0.2,
        w: Math.min(cardW - 0.32, 0.82),
        h: 0.12,
        fontSize: tagFontSize,
        fontFace: tagFontFace,
        bold: true,
        color: index === 0 ? (options.activeTagTextColor || theme.bg) : (options.tagTextColor || theme.primary),
        align: 'center',
        margin: 0,
        fit: 'shrink',
      });
    }

    slide.addText(stage.label, {
      x: cardX + 0.16,
      y: y + (stage.tag ? 0.56 : 0.24),
      w: cardW - 0.32,
      h: 0.32,
      fontSize: labelFontSize,
      fontFace: labelFontFace,
      bold: true,
      color: textColor,
      margin: 0,
      fit: 'shrink',
    });

    if (stage.caption) {
      slide.addText(stage.caption, {
        x: cardX + 0.16,
        y: y + (stage.tag ? 0.96 : 0.66),
        w: cardW - 0.32,
        h: cardH - (stage.tag ? 1.06 : 0.76),
        fontSize: captionFontSize,
        fontFace: captionFontFace,
        color: mutedColor,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

module.exports = {
  normalizeRoadmapStages,
  addRoadmap,
};
