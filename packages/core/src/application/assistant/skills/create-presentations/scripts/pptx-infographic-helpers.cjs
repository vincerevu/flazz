function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeItems(items, minCount, label) {
  if (!Array.isArray(items)) {
    throw new Error(`${label} must be an array.`);
  }

  const normalized = items
    .map((item) => (typeof item === 'string' ? { title: item.trim() } : item))
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const title = cleanText(item.title);
      const detail = cleanText(item.detail);
      const caption = cleanText(item.caption);
      return title || detail || caption ? { title, detail, caption } : null;
    })
    .filter(Boolean);

  if (normalized.length < minCount) {
    throw new Error(`${label} needs at least ${minCount} items.`);
  }

  return normalized;
}

function addBoxGrid(slide, items, layout, theme, options = {}) {
  const normalized = normalizeItems(items, 2, 'Box grid');
  const {
    x,
    y,
    w,
    h,
    columns = normalized.length > 4 ? 3 : 2,
    gap = 0.16,
    titleFontFace,
    detailFontFace,
    titleFontSize = 14,
    detailFontSize = 10,
  } = layout;

  const rows = Math.ceil(normalized.length / columns);
  const cellW = (w - gap * (columns - 1)) / columns;
  const cellH = (h - gap * (rows - 1)) / rows;

  normalized.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = x + col * (cellW + gap);
    const cellY = y + row * (cellH + gap);

    slide.addShape('roundRect', {
      x: cellX,
      y: cellY,
      w: cellW,
      h: cellH,
      rectRadius: options.rectRadius ?? 0.12,
      fill: { color: options.fills?.[index] || theme.bg },
      line: { color: options.lineColor || theme.accent, width: 1 },
    });

    slide.addText(item.title, {
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

    if (item.detail || item.caption) {
      slide.addText(item.detail || item.caption, {
        x: cellX + 0.16,
        y: cellY + 0.48,
        w: cellW - 0.32,
        h: cellH - 0.58,
        fontSize: detailFontSize,
        fontFace: detailFontFace,
        color: options.detailColor || theme.secondary,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function addPyramid(slide, items, layout, theme, options = {}) {
  const normalized = normalizeItems(items, 3, 'Pyramid');
  const {
    x,
    y,
    w,
    h,
    gap = 0.08,
    titleFontFace,
    detailFontFace,
    titleFontSize = 14,
    detailFontSize = 9,
  } = layout;

  const levelH = (h - gap * (normalized.length - 1)) / normalized.length;

  normalized.forEach((item, index) => {
    const progress = (index + 1) / normalized.length;
    const levelW = w * (0.42 + progress * 0.58);
    const levelX = x + (w - levelW) / 2;
    const levelY = y + index * (levelH + gap);

    slide.addShape('roundRect', {
      x: levelX,
      y: levelY,
      w: levelW,
      h: levelH,
      rectRadius: options.rectRadius ?? 0.08,
      fill: { color: options.fills?.[index] || (index === 0 ? theme.primary : theme.light) },
      line: { color: options.lineColor || theme.bg, width: 1 },
    });

    slide.addText(item.title, {
      x: levelX + 0.18,
      y: levelY + 0.09,
      w: levelW - 0.36,
      h: 0.22,
      fontSize: titleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: index === 0 ? (options.topTextColor || theme.bg) : (options.titleColor || theme.primary),
      align: 'center',
      margin: 0,
      fit: 'shrink',
    });

    if (item.detail && levelH > 0.46) {
      slide.addText(item.detail, {
        x: levelX + 0.25,
        y: levelY + 0.38,
        w: levelW - 0.5,
        h: levelH - 0.44,
        fontSize: detailFontSize,
        fontFace: detailFontFace,
        color: index === 0 ? (options.topTextColor || theme.bg) : (options.detailColor || theme.secondary),
        align: 'center',
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function addStaircase(slide, items, layout, theme, options = {}) {
  const normalized = normalizeItems(items, 3, 'Staircase');
  const {
    x,
    y,
    w,
    h,
    gap = 0.12,
    titleFontFace,
    detailFontFace,
    titleFontSize = 13,
    detailFontSize = 9,
  } = layout;

  const stepW = (w - gap * (normalized.length - 1)) / normalized.length;

  normalized.forEach((item, index) => {
    const heightRatio = (index + 1) / normalized.length;
    const stepH = Math.max(h * heightRatio, 0.65);
    const stepX = x + index * (stepW + gap);
    const stepY = y + h - stepH;

    slide.addShape('roundRect', {
      x: stepX,
      y: stepY,
      w: stepW,
      h: stepH,
      rectRadius: options.rectRadius ?? 0.1,
      fill: { color: options.fills?.[index] || (index === normalized.length - 1 ? theme.primary : theme.light) },
      line: { color: options.lineColor || theme.accent, width: 1 },
    });

    slide.addText(String(index + 1), {
      x: stepX + 0.12,
      y: stepY + 0.12,
      w: 0.28,
      h: 0.22,
      fontSize: 11,
      fontFace: titleFontFace,
      bold: true,
      color: index === normalized.length - 1 ? theme.bg : theme.primary,
      margin: 0,
      align: 'center',
    });

    slide.addText(item.title, {
      x: stepX + 0.16,
      y: stepY + 0.42,
      w: stepW - 0.32,
      h: 0.28,
      fontSize: titleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: index === normalized.length - 1 ? theme.bg : theme.primary,
      margin: 0,
      fit: 'shrink',
    });

    if (item.detail && stepH > 1.0) {
      slide.addText(item.detail, {
        x: stepX + 0.16,
        y: stepY + 0.78,
        w: stepW - 0.32,
        h: stepH - 0.88,
        fontSize: detailFontSize,
        fontFace: detailFontFace,
        color: index === normalized.length - 1 ? theme.bg : theme.secondary,
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function addCycleDiagram(slide, items, layout, theme, options = {}) {
  const normalized = normalizeItems(items, 3, 'Cycle diagram');
  const {
    cx,
    cy,
    radius,
    nodeW = 1.45,
    nodeH = 0.62,
    titleFontFace,
    detailFontFace,
    titleFontSize = 11,
    detailFontSize = 8,
  } = layout;

  normalized.forEach((item, index) => {
    const angle = (Math.PI * 2 * index) / normalized.length - Math.PI / 2;
    const nodeX = cx + Math.cos(angle) * radius - nodeW / 2;
    const nodeY = cy + Math.sin(angle) * radius - nodeH / 2;
    const nextAngle = (Math.PI * 2 * ((index + 1) % normalized.length)) / normalized.length - Math.PI / 2;
    const nextX = cx + Math.cos(nextAngle) * radius;
    const nextY = cy + Math.sin(nextAngle) * radius;

    slide.addShape('line', {
      x: nodeX + nodeW / 2,
      y: nodeY + nodeH / 2,
      w: nextX - (nodeX + nodeW / 2),
      h: nextY - (nodeY + nodeH / 2),
      line: { color: options.connectorColor || theme.accent, width: 1.5 },
      endArrowType: 'triangle',
    });

    slide.addShape('roundRect', {
      x: nodeX,
      y: nodeY,
      w: nodeW,
      h: nodeH,
      rectRadius: options.rectRadius ?? 0.18,
      fill: { color: options.fills?.[index] || theme.bg },
      line: { color: options.lineColor || theme.accent, width: 1 },
    });

    slide.addText(item.title, {
      x: nodeX + 0.1,
      y: nodeY + 0.1,
      w: nodeW - 0.2,
      h: 0.18,
      fontSize: titleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: options.titleColor || theme.primary,
      align: 'center',
      margin: 0,
      fit: 'shrink',
    });

    if (item.detail) {
      slide.addText(item.detail, {
        x: nodeX + 0.1,
        y: nodeY + 0.34,
        w: nodeW - 0.2,
        h: nodeH - 0.4,
        fontSize: detailFontSize,
        fontFace: detailFontFace,
        color: options.detailColor || theme.secondary,
        align: 'center',
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

function addRelationMap(slide, data, layout, theme, options = {}) {
  if (!data || typeof data !== 'object') {
    throw new Error('Relation map data must be an object.');
  }

  const center = data.center && typeof data.center === 'object' ? data.center : null;
  const centerTitle = cleanText(center?.title || data.center);
  const centerDetail = cleanText(center?.detail);
  const nodes = normalizeItems(data.nodes, 2, 'Relation map nodes');
  const {
    cx,
    cy,
    radius,
    centerW = 1.85,
    centerH = 0.9,
    nodeW = 1.55,
    nodeH = 0.66,
    titleFontFace,
    detailFontFace,
    titleFontSize = 10,
    detailFontSize = 8,
  } = layout;

  if (!centerTitle) {
    throw new Error('Relation map needs a center title.');
  }

  slide.addShape('roundRect', {
    x: cx - centerW / 2,
    y: cy - centerH / 2,
    w: centerW,
    h: centerH,
    rectRadius: options.centerRadius ?? 0.18,
    fill: { color: options.centerFill || theme.primary },
    line: { color: options.centerFill || theme.primary, width: 1 },
  });

  slide.addText(centerTitle, {
    x: cx - centerW / 2 + 0.12,
    y: cy - centerH / 2 + 0.12,
    w: centerW - 0.24,
    h: centerDetail ? 0.28 : centerH - 0.24,
    fontSize: titleFontSize,
    fontFace: titleFontFace,
    bold: true,
    color: options.centerTextColor || theme.bg,
    align: 'center',
    valign: 'middle',
    margin: 0,
    fit: 'shrink',
  });

  if (centerDetail) {
    slide.addText(centerDetail, {
      x: cx - centerW / 2 + 0.12,
      y: cy + 0.1,
      w: centerW - 0.24,
      h: Math.max(0.22, centerH / 2 - 0.16),
      fontSize: detailFontSize,
      fontFace: detailFontFace,
      color: options.centerTextColor || theme.bg,
      align: 'center',
      margin: 0,
      fit: 'shrink',
    });
  }

  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    const nodeCx = cx + Math.cos(angle) * radius;
    const nodeCy = cy + Math.sin(angle) * radius;
    const nodeX = nodeCx - nodeW / 2;
    const nodeY = nodeCy - nodeH / 2;

    slide.addShape('line', {
      x: cx,
      y: cy,
      w: nodeCx - cx,
      h: nodeCy - cy,
      line: { color: options.connectorColor || theme.accent, width: 1.2 },
    });

    slide.addShape('roundRect', {
      x: nodeX,
      y: nodeY,
      w: nodeW,
      h: nodeH,
      rectRadius: options.nodeRadius ?? 0.14,
      fill: { color: options.nodeFill || theme.bg },
      line: { color: options.lineColor || theme.accent, width: 1 },
    });

    slide.addText(node.title, {
      x: nodeX + 0.1,
      y: nodeY + 0.1,
      w: nodeW - 0.2,
      h: 0.24,
      fontSize: titleFontSize,
      fontFace: titleFontFace,
      bold: true,
      color: options.titleColor || theme.primary,
      align: 'center',
      margin: 0,
      fit: 'shrink',
    });

    if (node.detail) {
      slide.addText(node.detail, {
        x: nodeX + 0.1,
        y: nodeY + 0.38,
        w: nodeW - 0.2,
        h: nodeH - 0.44,
        fontSize: detailFontSize,
        fontFace: detailFontFace,
        color: options.detailColor || theme.secondary,
        align: 'center',
        margin: 0,
        fit: 'shrink',
      });
    }
  });
}

module.exports = {
  normalizeItems,
  addBoxGrid,
  addPyramid,
  addStaircase,
  addCycleDiagram,
  addRelationMap,
};
