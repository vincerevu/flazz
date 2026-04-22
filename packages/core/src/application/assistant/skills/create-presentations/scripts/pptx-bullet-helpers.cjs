function normalizeBulletItems(items) {
  if (!Array.isArray(items)) {
    throw new Error('Bullet items must be an array of strings.');
  }

  const normalized = items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error('Bullet list must contain at least one non-empty item.');
  }

  return normalized;
}

function buildBulletRuns(items) {
  const normalized = normalizeBulletItems(items);
  return normalized.map((text, index) => ({
    text,
    options: {
      bullet: true,
      ...(index < normalized.length - 1 ? { breakLine: true } : {}),
    },
  }));
}

function addBulletList(slide, items, box, textOptions = {}) {
  const runs = buildBulletRuns(items);
  slide.addText(runs, {
    margin: 0,
    ...textOptions,
    ...box,
  });
  return runs;
}

module.exports = {
  normalizeBulletItems,
  buildBulletRuns,
  addBulletList,
};
