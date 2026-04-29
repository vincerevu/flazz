function normalizeHierarchyNodes(nodes) {
  if (!Array.isArray(nodes)) {
    throw new Error('Hierarchy nodes must be an array.');
  }

  const normalized = nodes
    .map((node) => (typeof node === 'string' ? { title: node.trim() } : node))
    .map((node) => {
      if (!node || typeof node !== 'object') return null;
      const title = typeof node.title === 'string' ? node.title.trim() : '';
      const detail = typeof node.detail === 'string' ? node.detail.trim() : '';
      return title || detail ? { title, detail } : null;
    })
    .filter(Boolean);

  if (normalized.length < 2) {
    throw new Error('Hierarchy layout needs at least two nodes.');
  }

  return normalized;
}

function addHierarchyStack(slide, nodes, layout, theme, options = {}) {
  const normalized = normalizeHierarchyNodes(nodes);
  const {
    x,
    y,
    w,
    h,
    gap = 0.12,
    titleFontFace,
    detailFontFace,
    titleFontSize = 15,
    detailFontSize = 10,
  } = layout;

  const rowH = (h - gap * (normalized.length - 1)) / normalized.length;
  const boundedTitleFontSize = Math.min(titleFontSize, rowH < 0.58 ? 13 : titleFontSize);
  const boundedDetailFontSize = Math.min(detailFontSize, rowH < 0.58 ? 8 : detailFontSize);

  normalized.forEach((node, index) => {
    const rowY = y + index * (rowH + gap);
    const indent = Math.min(index * (options.indentStep ?? 0.18), 0.7);
    const rowX = x + indent;
    const rowW = w - indent;

    slide.addShape('roundRect', {
      x: rowX,
      y: rowY,
      w: rowW,
      h: rowH,
      rectRadius: options.rectRadius ?? 0.1,
      fill: { color: index === 0 ? (options.rootFill || theme.primary) : (options.fill || theme.light) },
      line: { color: options.lineColor || theme.accent, width: 1 },
    });

    slide.addText(node.title, {
      x: rowX + 0.18,
      y: rowY + 0.09,
      w: rowW - 0.36,
      h: Math.min(0.24, Math.max(0.16, rowH * 0.38)),
      fontSize: boundedTitleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: index === 0 ? (options.rootTextColor || theme.bg) : (options.titleColor || theme.primary),
      margin: 0,
      fit: 'shrink',
    });

    if (node.detail && rowH > 0.42) {
      const detailY = rowY + Math.min(0.38, Math.max(0.28, rowH * 0.48));
      slide.addText(node.detail, {
        x: rowX + 0.18,
        y: detailY,
        w: rowW - 0.36,
        h: Math.max(0.16, rowH - (detailY - rowY) - 0.06),
        fontSize: boundedDetailFontSize,
        fontFace: detailFontFace,
        color: index === 0 ? (options.rootDetailColor || theme.bg) : (options.detailColor || theme.secondary),
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

module.exports = {
  normalizeHierarchyNodes,
  addHierarchyStack,
};
