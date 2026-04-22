function normalizeProcessSteps(steps) {
  if (!Array.isArray(steps)) {
    throw new Error('Process steps must be an array.');
  }

  const normalized = steps
    .map((step) => (typeof step === 'string' ? { label: step.trim() } : step))
    .map((step) => {
      if (!step || typeof step !== 'object') return null;
      const label = typeof step.label === 'string' ? step.label.trim() : '';
      const caption = typeof step.caption === 'string' ? step.caption.trim() : '';
      return label || caption ? { label, caption } : null;
    })
    .filter(Boolean);

  if (normalized.length < 2) {
    throw new Error('Process layout needs at least two non-empty steps.');
  }

  return normalized;
}

function addProcessTimeline(slide, steps, layout, theme, options = {}) {
  const normalized = normalizeProcessSteps(steps);
  const {
    x,
    y,
    w,
    stepGap = 0.28,
    nodeSize = 0.5,
    labelY = 0.62,
    captionY = 0.9,
    labelFontSize = 15,
    captionFontSize = 11,
    labelFontFace,
    captionFontFace,
  } = layout;

  const count = normalized.length;
  const totalGap = stepGap * (count - 1);
  const stepWidth = (w - totalGap) / count;

  normalized.forEach((step, index) => {
    const stepX = x + index * (stepWidth + stepGap);
    const nodeX = stepX + (stepWidth - nodeSize) / 2;

    slide.addShape('ellipse', {
      x: nodeX,
      y,
      w: nodeSize,
      h: nodeSize,
      fill: { color: options.nodeFill || theme.accent },
      line: { color: options.nodeLine || theme.accent, width: 1 },
    });

    slide.addText(String(index + 1), {
      x: nodeX,
      y,
      w: nodeSize,
      h: nodeSize,
      fontSize: options.nodeFontSize || 12,
      fontFace: labelFontFace,
      bold: true,
      color: options.nodeTextColor || theme.bg,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });

    if (index < count - 1) {
      const lineX = nodeX + nodeSize;
      const lineW = stepGap + stepWidth - nodeSize;
      slide.addShape('line', {
        x: lineX,
        y: y + nodeSize / 2,
        w: lineW,
        h: 0,
        line: { color: options.lineColor || theme.secondary, width: 2 },
        endArrowType: 'triangle',
      });
    }

    slide.addText(step.label, {
      x: stepX,
      y: y + labelY,
      w: stepWidth,
      h: 0.24,
      fontSize: labelFontSize,
      fontFace: labelFontFace,
      bold: true,
      color: options.labelColor || theme.secondary,
      align: 'center',
      margin: 0,
    });

    if (step.caption) {
      slide.addText(step.caption, {
        x: stepX,
        y: y + captionY,
        w: stepWidth,
        h: 0.3,
        fontSize: captionFontSize,
        fontFace: captionFontFace,
        color: options.captionColor || theme.secondary,
        align: 'center',
        margin: 0,
      });
    }
  });
}

module.exports = {
  normalizeProcessSteps,
  addProcessTimeline,
};
