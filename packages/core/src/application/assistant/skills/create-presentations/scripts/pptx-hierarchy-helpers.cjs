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
      h: Math.min(0.25, rowH - 0.08),
      fontSize: titleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: index === 0 ? (options.rootTextColor || theme.bg) : (options.titleColor || theme.primary),
      margin: 0,
      fit: 'shrink',
    });

    if (node.detail && rowH > 0.45) {
      slide.addText(node.detail, {
        x: rowX + 0.18,
        y: rowY + 0.38,
        w: rowW - 0.36,
        h: rowH - 0.44,
        fontSize: detailFontSize,
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
