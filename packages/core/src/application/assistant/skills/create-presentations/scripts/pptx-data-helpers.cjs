function normalizeChartSeries(series) {
  if (!Array.isArray(series) || series.length < 2) {
    throw new Error('Data visualization needs at least two data points.');
  }

  const normalized = series
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      const label = typeof point.label === 'string' ? point.label.trim() : '';
      const value = typeof point.value === 'number' ? point.value : Number(point.value);
      if (!label || !Number.isFinite(value)) return null;
      return { label, value };
    })
    .filter(Boolean);

  if (normalized.length < 2) {
    throw new Error('Data visualization needs at least two valid points.');
  }

  return normalized;
}

function normalizeTakeaways(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Data visualization needs at least one takeaway.');
  }

  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function addBarChartWithTakeaways(slide, data, layout, theme, options = {}) {
  const series = normalizeChartSeries(data.series);
  const takeaways = normalizeTakeaways(data.takeaways);
  const source = typeof data.source === 'string' ? data.source.trim() : '';

  const {
    x,
    y,
    w,
    h,
    chartRatio = 0.56,
    chartGap = 0.35,
    labelFontFace,
    bodyFontFace,
  } = layout;

  const chartW = w * chartRatio;
  const takeawayW = w - chartW - chartGap;
  const chartH = h - 0.42;
  const maxValue = Math.max(...series.map((point) => point.value));
  const barGap = 0.12;
  const barWidth = Math.max(0.28, (chartW - barGap * (series.length - 1)) / series.length);

  slide.addShape('line', {
    x,
    y: y + chartH,
    w: chartW,
    h: 0,
    line: { color: options.axisColor || theme.secondary, width: 1.5 },
  });

  series.forEach((point, index) => {
    const barHeight = chartH * (point.value / maxValue);
    const barX = x + index * (barWidth + barGap);
    const barY = y + chartH - barHeight;

    slide.addShape('rect', {
      x: barX,
      y: barY,
      w: barWidth,
      h: barHeight,
      fill: { color: options.barFill || theme.accent },
      line: { color: options.barLine || theme.accent, width: 1 },
    });

    slide.addText(String(point.value), {
      x: barX,
      y: barY - 0.24,
      w: barWidth,
      h: 0.18,
      fontSize: options.valueFontSize || 10,
      fontFace: bodyFontFace,
      bold: true,
      color: options.valueColor || theme.secondary,
      align: 'center',
      margin: 0,
    });

    slide.addText(point.label, {
      x: barX - 0.05,
      y: y + chartH + 0.08,
      w: barWidth + 0.1,
      h: 0.22,
      fontSize: options.labelFontSize || 10,
      fontFace: bodyFontFace,
      color: options.labelColor || theme.secondary,
      align: 'center',
      margin: 0,
    });
  });

  const takeawayRuns = takeaways.map((text, index) => ({
    text,
    options: {
      bullet: true,
      ...(index < takeaways.length - 1 ? { breakLine: true } : {}),
    },
  }));

  slide.addText(takeawayRuns, {
    x: x + chartW + chartGap,
    y: y + 0.2,
    w: takeawayW,
    h: h - 0.5,
    fontSize: options.takeawayFontSize || 15,
    fontFace: bodyFontFace,
    color: options.takeawayColor || theme.secondary,
    margin: 0,
    paraSpaceAfterPt: 10,
  });

  if (source) {
    slide.addText(`Source: ${source}`, {
      x,
      y: y + h - 0.18,
      w,
      h: 0.16,
      fontSize: options.sourceFontSize || 10,
      fontFace: labelFontFace || bodyFontFace,
      color: options.sourceColor || theme.secondary,
      italic: true,
      margin: 0,
    });
  }
}

module.exports = {
  normalizeChartSeries,
  normalizeTakeaways,
  addBarChartWithTakeaways,
};
