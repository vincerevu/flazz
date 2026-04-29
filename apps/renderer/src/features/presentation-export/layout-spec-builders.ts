import type {
  PresentationPreviewElement,
  PresentationPreviewSlide,
  PresentationPreviewTheme,
} from './types';

const SLIDE_W = 10;
const SLIDE_H = 5.625;

type InchRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SummaryItem = {
  title?: string;
  body?: string;
};

export type StatCard = {
  value: string | number;
  label: string;
  detail?: string;
};

export type ComparisonColumn = {
  title: string;
  items: string[];
};

export type RoadmapStage = {
  tag?: string;
  label?: string;
  caption?: string;
};

export type HierarchyNode = {
  title?: string;
  detail?: string;
};

export type InfographicItem = {
  title?: string;
  detail?: string;
  caption?: string;
};

export type RelationMapData = {
  center: string | { title?: string; detail?: string };
  nodes: InfographicItem[];
};

export type ChartPoint = {
  label: string;
  value: number | string;
};

export type BarChartData = {
  series: ChartPoint[];
  takeaways: string[];
  source?: string;
};

export type MediaPanelData = {
  imagePath: string;
  title?: string;
  bullets?: string[];
  caption?: string;
};

export type DomSlideBaseOptions = {
  id: string;
  title?: string;
  backgroundColor?: string;
  theme?: PresentationPreviewTheme;
};

export type SummaryRowsOptions = DomSlideBaseOptions & {
  items: SummaryItem[];
  layout?: Partial<InchRect> & {
    rowGap?: number;
    iconSize?: number;
    iconTextGap?: number;
  };
};

export type StatGridOptions = DomSlideBaseOptions & {
  cards: StatCard[];
  layout?: Partial<InchRect> & {
    columns?: number;
    cardGapX?: number;
    cardGapY?: number;
  };
};

export type ComparisonCardsOptions = DomSlideBaseOptions & {
  columns: [ComparisonColumn, ComparisonColumn];
  layout?: Partial<InchRect> & {
    gap?: number;
  };
};

export type RoadmapSlideOptions = DomSlideBaseOptions & {
  stages: RoadmapStage[];
  layout?: Partial<InchRect> & {
    gap?: number;
  };
};

export type HierarchyStackOptions = DomSlideBaseOptions & {
  nodes: HierarchyNode[];
  layout?: Partial<InchRect> & {
    gap?: number;
    indentStep?: number;
  };
};

export type BoxGridOptions = DomSlideBaseOptions & {
  items: InfographicItem[];
  layout?: Partial<InchRect> & {
    columns?: number;
    gap?: number;
  };
};

export type PyramidOptions = DomSlideBaseOptions & {
  items: InfographicItem[];
  layout?: Partial<InchRect> & {
    gap?: number;
  };
};

export type StaircaseOptions = DomSlideBaseOptions & {
  items: InfographicItem[];
  layout?: Partial<InchRect> & {
    gap?: number;
  };
};

export type CycleDiagramOptions = DomSlideBaseOptions & {
  items: InfographicItem[];
  layout?: {
    cx?: number;
    cy?: number;
    radius?: number;
    nodeW?: number;
    nodeH?: number;
  };
};

export type RelationMapOptions = DomSlideBaseOptions & {
  data: RelationMapData;
  layout?: {
    cx?: number;
    cy?: number;
    radius?: number;
    centerW?: number;
    centerH?: number;
    nodeW?: number;
    nodeH?: number;
  };
};

export type BarChartWithTakeawaysOptions = DomSlideBaseOptions & {
  data: BarChartData;
  layout?: Partial<InchRect> & {
    chartRatio?: number;
    chartGap?: number;
  };
};

export type MixedMediaPanelOptions = DomSlideBaseOptions & {
  data: MediaPanelData;
  layout?: Partial<InchRect> & {
    imageSide?: 'left' | 'right';
    imageRatio?: number;
    gap?: number;
  };
};

export type ProcessTimelineOptions = DomSlideBaseOptions & {
  steps: RoadmapStage[];
  layout?: Partial<InchRect> & {
    gap?: number;
  };
};

export type Quadrant = {
  title: string;
  items: string[];
};

export type QuadrantMatrixOptions = DomSlideBaseOptions & {
  quadrants: [Quadrant, Quadrant, Quadrant, Quadrant];
  xAxisLabel?: string;
  yAxisLabel?: string;
  layout?: Partial<InchRect> & {
    gap?: number;
  };
};

export type MetricWallOptions = StatGridOptions;

export type EditorialQuoteBlock = {
  quote: string;
  attribution?: string;
  kicker?: string;
};

export type EditorialQuoteOptions = DomSlideBaseOptions & {
  quote: EditorialQuoteBlock;
  layout?: Partial<InchRect>;
};

export type LayeredStackOptions = DomSlideBaseOptions & {
  layers: InfographicItem[];
  layout?: Partial<InchRect> & {
    gap?: number;
  };
};

export type EvidenceMediaOptions = DomSlideBaseOptions & {
  data: MediaPanelData;
  layout?: Partial<InchRect> & {
    imageSide?: 'left' | 'right';
    imageRatio?: number;
    gap?: number;
  };
};

export type DiagonalCompareOptions = DomSlideBaseOptions & {
  columns: [ComparisonColumn, ComparisonColumn];
  layout?: Partial<InchRect>;
};

export type HeroImageOverlayOptions = DomSlideBaseOptions & {
  imagePath: string;
  headline: string;
  subtitle?: string;
  layout?: Partial<InchRect>;
};

function pctX(value: number): number {
  return (value / SLIDE_W) * 100;
}

function pctY(value: number): number {
  return (value / SLIDE_H) * 100;
}

function box({ x, y, w, h }: InchRect) {
  return {
    x: pctX(x),
    y: pctY(y),
    width: pctX(w),
    height: pctY(h),
  };
}

function mergeLayout(defaults: InchRect, layout?: Partial<InchRect>): InchRect {
  return {
    x: layout?.x ?? defaults.x,
    y: layout?.y ?? defaults.y,
    w: layout?.w ?? defaults.w,
    h: layout?.h ?? defaults.h,
  };
}

function normalizeSummaryItems(items: SummaryItem[]): Required<SummaryItem>[] {
  return items
    .map((item) => ({
      title: item.title?.trim() ?? '',
      body: item.body?.trim() ?? '',
    }))
    .filter((item) => item.title || item.body);
}

function normalizeStatCards(cards: StatCard[]): Array<{ value: string; label: string; detail: string }> {
  return cards
    .map((card) => ({
      value: String(card.value ?? '').trim(),
      label: card.label?.trim() ?? '',
      detail: card.detail?.trim() ?? '',
    }))
    .filter((card) => card.value && card.label);
}

function normalizeComparisonColumns(columns: [ComparisonColumn, ComparisonColumn]) {
  return columns.map((column) => ({
    title: column.title.trim(),
    items: column.items.map((item) => item.trim()).filter(Boolean),
  })) as [ComparisonColumn, ComparisonColumn];
}

function normalizeRoadmapStages(stages: RoadmapStage[]): Array<{ tag: string; label: string; caption: string }> {
  return stages
    .map((stage) => ({
      tag: stage.tag?.trim() ?? '',
      label: stage.label?.trim() ?? '',
      caption: stage.caption?.trim() ?? '',
    }))
    .filter((stage) => stage.tag || stage.label || stage.caption);
}

function normalizeInfographicItems(items: InfographicItem[], minCount = 2): Array<{ title: string; detail: string; caption: string }> {
  const normalized = items
    .map((item) => ({
      title: item.title?.trim() ?? '',
      detail: item.detail?.trim() ?? '',
      caption: item.caption?.trim() ?? '',
    }))
    .filter((item) => item.title || item.detail || item.caption);

  return normalized.length >= minCount ? normalized : [];
}

function normalizeChartSeries(series: ChartPoint[]): Array<{ label: string; value: number }> {
  return series
    .map((point) => ({
      label: point.label?.trim() ?? '',
      value: typeof point.value === 'number' ? point.value : Number(point.value),
    }))
    .filter((point) => point.label && Number.isFinite(point.value));
}

function titleElements(title: string | undefined, theme?: PresentationPreviewTheme): PresentationPreviewElement[] {
  if (!title) return [];
  return [
    {
      type: 'text',
      id: 'slide-title',
      text: title,
      position: box({ x: 0.65, y: 0.42, w: 8.7, h: 0.55 }),
      style: {
        color: theme?.primary ?? 'var(--flazz-ppt-primary)',
        fontFamily: 'var(--flazz-ppt-font-heading)',
        fontSize: '5.2%',
        fontWeight: 700,
        lineHeight: 1.05,
      },
    },
  ];
}

function pageBadgeElement(index?: number): PresentationPreviewElement[] {
  if (!index) return [];
  return [
    {
      type: 'text',
      id: 'page-badge',
      text: String(index),
      position: box({ x: 9.28, y: 5.08, w: 0.32, h: 0.22 }),
      style: {
        color: 'var(--flazz-ppt-secondary)',
        fontFamily: 'var(--flazz-ppt-font-body)',
        fontSize: '1.8%',
        textAlign: 'right',
      },
    },
  ];
}

function slideNumberFromId(id: string): number | undefined {
  const match = id.match(/(\d+)$/);
  return match?.[1] ? Number(match[1]) : undefined;
}

export function buildSummaryRowsSlide(options: SummaryRowsOptions): PresentationPreviewSlide {
  const items = normalizeSummaryItems(options.items);
  const layout = mergeLayout({ x: 0.85, y: 1.35, w: 8.35, h: 3.35 }, options.layout);
  const rowGap = options.layout?.rowGap ?? 0.18;
  const iconSize = options.layout?.iconSize ?? 0.34;
  const iconTextGap = options.layout?.iconTextGap ?? 0.16;
  const rowH = Math.max(0.62, (layout.h - rowGap * Math.max(0, items.length - 1)) / Math.max(1, items.length));
  const elements: PresentationPreviewElement[] = [
    ...titleElements(options.title, options.theme),
  ];

  items.forEach((item, index) => {
    const y = layout.y + index * (rowH + rowGap);
    const iconY = y + Math.max(0.02, (rowH - iconSize) / 2);
    const textX = layout.x + iconSize + iconTextGap;
    const textW = layout.w - iconSize - iconTextGap;

    elements.push({
      type: 'shape',
      id: `summary-icon-${index + 1}`,
      shape: 'ellipse',
      position: box({ x: layout.x, y: iconY, w: iconSize, h: iconSize }),
      style: {
        background: 'var(--flazz-ppt-accent)',
        borderColor: 'var(--flazz-ppt-accent)',
      },
    });
    elements.push({
      type: 'text',
      id: `summary-number-${index + 1}`,
      text: String(index + 1),
      position: box({ x: layout.x, y: iconY + 0.02, w: iconSize, h: iconSize - 0.04 }),
      style: {
        color: 'var(--flazz-ppt-bg)',
        fontFamily: 'var(--flazz-ppt-font-body)',
        fontSize: '2.1%',
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1,
      },
    });

    if (item.title) {
      elements.push({
        type: 'text',
        id: `summary-title-${index + 1}`,
        text: item.title,
        position: box({ x: textX, y, w: textW, h: Math.min(0.38, rowH * 0.44) }),
        style: {
          color: 'var(--flazz-ppt-primary)',
          fontFamily: 'var(--flazz-ppt-font-heading)',
          fontSize: '3.4%',
          fontWeight: 700,
          lineHeight: 1.05,
        },
      });
    }

    if (item.body) {
      elements.push({
        type: 'text',
        id: `summary-body-${index + 1}`,
        text: item.body,
        position: box({
          x: textX,
          y: y + (item.title ? Math.min(0.42, rowH * 0.48) : 0),
          w: textW,
          h: item.title ? Math.max(0.24, rowH - Math.min(0.46, rowH * 0.54)) : rowH,
        }),
        style: {
          color: 'var(--flazz-ppt-secondary)',
          fontFamily: 'var(--flazz-ppt-font-body)',
          fontSize: '2.35%',
          lineHeight: 1.18,
        },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return {
    id: options.id,
    backgroundColor: options.backgroundColor,
    elements,
  };
}

export function buildStatGridSlide(options: StatGridOptions): PresentationPreviewSlide {
  const cards = normalizeStatCards(options.cards);
  const layout = mergeLayout({ x: 0.8, y: 1.35, w: 8.4, h: 3.45 }, options.layout);
  const columns = options.layout?.columns ?? (cards.length >= 4 ? 2 : cards.length);
  const rows = Math.ceil(cards.length / columns);
  const gapX = options.layout?.cardGapX ?? 0.32;
  const gapY = options.layout?.cardGapY ?? 0.26;
  const cardW = (layout.w - gapX * (columns - 1)) / columns;
  const cardH = (layout.h - gapY * (rows - 1)) / rows;
  const elements: PresentationPreviewElement[] = [
    ...titleElements(options.title, options.theme),
  ];

  cards.forEach((card, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = layout.x + col * (cardW + gapX);
    const y = layout.y + row * (cardH + gapY);
    elements.push({
      type: 'backgroundRect',
      id: `stat-card-bg-${index + 1}`,
      position: box({ x, y, w: cardW, h: cardH }),
      style: {
        background: 'var(--flazz-ppt-light)',
        border: '1.4px solid var(--flazz-ppt-accent)',
        borderRadius: 10,
      },
    });
    elements.push({
      type: 'text',
      id: `stat-value-${index + 1}`,
      text: card.value,
      position: box({ x: x + 0.22, y: y + 0.17, w: cardW - 0.44, h: 0.46 }),
      style: {
        color: 'var(--flazz-ppt-primary)',
        fontFamily: 'var(--flazz-ppt-font-heading)',
        fontSize: '4.6%',
        fontWeight: 700,
        lineHeight: 1,
      },
    });
    elements.push({
      type: 'text',
      id: `stat-label-${index + 1}`,
      text: card.label,
      position: box({ x: x + 0.22, y: y + 0.72, w: cardW - 0.44, h: 0.42 }),
      style: {
        color: 'var(--flazz-ppt-secondary)',
        fontFamily: 'var(--flazz-ppt-font-body)',
        fontSize: '2.5%',
        fontWeight: 700,
        lineHeight: 1.1,
      },
    });
    if (card.detail) {
      elements.push({
        type: 'text',
        id: `stat-detail-${index + 1}`,
        text: card.detail,
        position: box({ x: x + 0.22, y: y + 1.08, w: cardW - 0.44, h: Math.max(0.28, cardH - 1.26) }),
        style: {
          color: 'var(--flazz-ppt-secondary)',
          fontFamily: 'var(--flazz-ppt-font-body)',
          fontSize: '2%',
          lineHeight: 1.15,
        },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return {
    id: options.id,
    backgroundColor: options.backgroundColor,
    elements,
  };
}

export function buildComparisonCardsSlide(options: ComparisonCardsOptions): PresentationPreviewSlide {
  const columns = normalizeComparisonColumns(options.columns);
  const layout = mergeLayout({ x: 0.8, y: 1.35, w: 8.4, h: 3.35 }, options.layout);
  const gap = options.layout?.gap ?? 0.35;
  const cardW = (layout.w - gap) / 2;
  const elements: PresentationPreviewElement[] = [
    ...titleElements(options.title, options.theme),
  ];

  columns.forEach((column, index) => {
    const x = layout.x + index * (cardW + gap);
    elements.push({
      type: 'backgroundRect',
      id: `compare-card-bg-${index + 1}`,
      position: box({ x, y: layout.y, w: cardW, h: layout.h }),
      style: {
        background: index === 0 ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-light)',
        border: '1.5px solid var(--flazz-ppt-accent)',
        borderRadius: 12,
      },
    });
    elements.push({
      type: 'text',
      id: `compare-title-${index + 1}`,
      text: column.title,
      position: box({ x: x + 0.2, y: layout.y + 0.18, w: cardW - 0.4, h: 0.34 }),
      style: {
        color: 'var(--flazz-ppt-primary)',
        fontFamily: 'var(--flazz-ppt-font-heading)',
        fontSize: '3.5%',
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1.05,
      },
    });
    elements.push({
      type: 'text',
      id: `compare-items-${index + 1}`,
      text: column.items.map((item) => `• ${item}`).join('\n'),
      position: box({ x: x + 0.28, y: layout.y + 0.68, w: cardW - 0.56, h: layout.h - 0.86 }),
      style: {
        color: 'var(--flazz-ppt-secondary)',
        fontFamily: 'var(--flazz-ppt-font-body)',
        fontSize: '2.45%',
        lineHeight: 1.28,
        whiteSpace: 'pre-wrap',
      },
    });
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return {
    id: options.id,
    backgroundColor: options.backgroundColor,
    elements,
  };
}

export function buildRoadmapSlide(options: RoadmapSlideOptions): PresentationPreviewSlide {
  const stages = normalizeRoadmapStages(options.stages);
  const layout = mergeLayout({ x: 0.75, y: 1.65, w: 8.5, h: 2.55 }, options.layout);
  const gap = options.layout?.gap ?? 0.18;
  const cardW = (layout.w - gap * Math.max(0, stages.length - 1)) / Math.max(1, stages.length);
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  stages.forEach((stage, index) => {
    const x = layout.x + index * (cardW + gap);
    if (index < stages.length - 1) {
      elements.push({
        type: 'shape',
        id: `roadmap-connector-${index + 1}`,
        shape: 'line',
        position: box({ x: x + cardW, y: layout.y + layout.h / 2, w: gap, h: 0.01 }),
        style: { borderColor: 'var(--flazz-ppt-accent)', background: 'var(--flazz-ppt-accent)' },
      });
    }
    elements.push({
      type: 'backgroundRect',
      id: `roadmap-card-${index + 1}`,
      position: box({ x, y: layout.y, w: cardW, h: layout.h }),
      style: {
        background: index === 0 ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-bg)',
        border: '1px solid var(--flazz-ppt-accent)',
        borderRadius: 12,
      },
    });
    const active = index === 0;
    if (stage.tag) {
      elements.push({
        type: 'backgroundRect',
        id: `roadmap-tag-bg-${index + 1}`,
        position: box({ x: x + 0.16, y: layout.y + 0.16, w: Math.min(cardW - 0.32, 0.82), h: 0.24 }),
        style: { background: active ? 'var(--flazz-ppt-accent)' : 'var(--flazz-ppt-light)', borderRadius: 999 },
      });
      elements.push({
        type: 'text',
        id: `roadmap-tag-${index + 1}`,
        text: stage.tag,
        position: box({ x: x + 0.16, y: layout.y + 0.18, w: Math.min(cardW - 0.32, 0.82), h: 0.18 }),
        style: { color: active ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontSize: '1.7%', fontWeight: 700, textAlign: 'center' },
      });
    }
    elements.push({
      type: 'text',
      id: `roadmap-label-${index + 1}`,
      text: stage.label,
      position: box({ x: x + 0.16, y: layout.y + (stage.tag ? 0.56 : 0.24), w: cardW - 0.32, h: 0.34 }),
      style: { color: active ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.8%', fontWeight: 700 },
    });
    if (stage.caption) {
      elements.push({
        type: 'text',
        id: `roadmap-caption-${index + 1}`,
        text: stage.caption,
        position: box({ x: x + 0.16, y: layout.y + (stage.tag ? 0.96 : 0.66), w: cardW - 0.32, h: layout.h - (stage.tag ? 1.06 : 0.76) }),
        style: { color: active ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-secondary)', fontSize: '2%', lineHeight: 1.16 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildHierarchyStackSlide(options: HierarchyStackOptions): PresentationPreviewSlide {
  const nodes = normalizeInfographicItems(options.nodes, 2);
  const layout = mergeLayout({ x: 0.85, y: 1.35, w: 8.25, h: 3.35 }, options.layout);
  const gap = options.layout?.gap ?? 0.12;
  const indentStep = options.layout?.indentStep ?? 0.18;
  const rowH = (layout.h - gap * Math.max(0, nodes.length - 1)) / Math.max(1, nodes.length);
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  nodes.forEach((node, index) => {
    const indent = Math.min(index * indentStep, 0.7);
    const x = layout.x + indent;
    const y = layout.y + index * (rowH + gap);
    const w = layout.w - indent;
    const root = index === 0;
    elements.push({
      type: 'backgroundRect',
      id: `hierarchy-bg-${index + 1}`,
      position: box({ x, y, w, h: rowH }),
      style: { background: root ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-light)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 10 },
    });
    elements.push({
      type: 'text',
      id: `hierarchy-title-${index + 1}`,
      text: node.title || node.detail,
      position: box({ x: x + 0.18, y: y + 0.09, w: w - 0.36, h: Math.min(0.28, rowH - 0.08) }),
      style: { color: root ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.7%', fontWeight: 700 },
    });
    if (node.detail && rowH > 0.45) {
      elements.push({
        type: 'text',
        id: `hierarchy-detail-${index + 1}`,
        text: node.detail,
        position: box({ x: x + 0.18, y: y + 0.4, w: w - 0.36, h: rowH - 0.46 }),
        style: { color: root ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-secondary)', fontSize: '1.95%', lineHeight: 1.12 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildBoxGridSlide(options: BoxGridOptions): PresentationPreviewSlide {
  const items = normalizeInfographicItems(options.items, 2);
  const layout = mergeLayout({ x: 0.8, y: 1.35, w: 8.4, h: 3.35 }, options.layout);
  const columns = options.layout?.columns ?? (items.length > 4 ? 3 : 2);
  const gap = options.layout?.gap ?? 0.16;
  const rows = Math.ceil(items.length / columns);
  const cellW = (layout.w - gap * (columns - 1)) / columns;
  const cellH = (layout.h - gap * (rows - 1)) / rows;
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  items.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = layout.x + col * (cellW + gap);
    const y = layout.y + row * (cellH + gap);
    elements.push({
      type: 'backgroundRect',
      id: `box-bg-${index + 1}`,
      position: box({ x, y, w: cellW, h: cellH }),
      style: { background: 'var(--flazz-ppt-bg)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 12 },
    });
    elements.push({
      type: 'text',
      id: `box-title-${index + 1}`,
      text: item.title || item.detail || item.caption,
      position: box({ x: x + 0.16, y: y + 0.14, w: cellW - 0.32, h: 0.28 }),
      style: { color: 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.6%', fontWeight: 700 },
    });
    const detail = item.detail || item.caption;
    if (detail) {
      elements.push({
        type: 'text',
        id: `box-detail-${index + 1}`,
        text: detail,
        position: box({ x: x + 0.16, y: y + 0.5, w: cellW - 0.32, h: cellH - 0.6 }),
        style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.95%', lineHeight: 1.14 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildPyramidSlide(options: PyramidOptions): PresentationPreviewSlide {
  const items = normalizeInfographicItems(options.items, 3);
  const layout = mergeLayout({ x: 1.25, y: 1.25, w: 7.5, h: 3.55 }, options.layout);
  const gap = options.layout?.gap ?? 0.08;
  const levelH = (layout.h - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length);
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  items.forEach((item, index) => {
    const progress = (index + 1) / items.length;
    const w = layout.w * (0.42 + progress * 0.58);
    const x = layout.x + (layout.w - w) / 2;
    const y = layout.y + index * (levelH + gap);
    const top = index === 0;
    elements.push({
      type: 'backgroundRect',
      id: `pyramid-level-${index + 1}`,
      position: box({ x, y, w, h: levelH }),
      style: { background: top ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-light)', borderRadius: 8 },
    });
    elements.push({
      type: 'text',
      id: `pyramid-title-${index + 1}`,
      text: item.title || item.detail,
      position: box({ x: x + 0.18, y: y + 0.09, w: w - 0.36, h: 0.25 }),
      style: { color: top ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.55%', fontWeight: 700, textAlign: 'center' },
    });
    if (item.detail && levelH > 0.46) {
      elements.push({
        type: 'text',
        id: `pyramid-detail-${index + 1}`,
        text: item.detail,
        position: box({ x: x + 0.25, y: y + 0.38, w: w - 0.5, h: levelH - 0.44 }),
        style: { color: top ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-secondary)', fontSize: '1.75%', textAlign: 'center', lineHeight: 1.12 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildStaircaseSlide(options: StaircaseOptions): PresentationPreviewSlide {
  const items = normalizeInfographicItems(options.items, 3);
  const layout = mergeLayout({ x: 0.85, y: 1.35, w: 8.3, h: 3.35 }, options.layout);
  const gap = options.layout?.gap ?? 0.12;
  const stepW = (layout.w - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length);
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  items.forEach((item, index) => {
    const stepH = Math.max(layout.h * ((index + 1) / items.length), 0.65);
    const x = layout.x + index * (stepW + gap);
    const y = layout.y + layout.h - stepH;
    const last = index === items.length - 1;
    elements.push({
      type: 'backgroundRect',
      id: `stair-step-${index + 1}`,
      position: box({ x, y, w: stepW, h: stepH }),
      style: { background: last ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-light)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 10 },
    });
    elements.push({
      type: 'text',
      id: `stair-number-${index + 1}`,
      text: String(index + 1),
      position: box({ x: x + 0.12, y: y + 0.12, w: 0.28, h: 0.22 }),
      style: { color: last ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontSize: '1.9%', fontWeight: 700, textAlign: 'center' },
    });
    elements.push({
      type: 'text',
      id: `stair-title-${index + 1}`,
      text: item.title || item.detail,
      position: box({ x: x + 0.16, y: y + 0.42, w: stepW - 0.32, h: 0.32 }),
      style: { color: last ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.35%', fontWeight: 700 },
    });
    if (item.detail && stepH > 1) {
      elements.push({
        type: 'text',
        id: `stair-detail-${index + 1}`,
        text: item.detail,
        position: box({ x: x + 0.16, y: y + 0.8, w: stepW - 0.32, h: stepH - 0.9 }),
        style: { color: last ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-secondary)', fontSize: '1.7%', lineHeight: 1.12 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildCycleDiagramSlide(options: CycleDiagramOptions): PresentationPreviewSlide {
  const items = normalizeInfographicItems(options.items, 3);
  const cx = options.layout?.cx ?? 5;
  const cy = options.layout?.cy ?? 3;
  const radius = options.layout?.radius ?? 1.55;
  const nodeW = options.layout?.nodeW ?? 1.45;
  const nodeH = options.layout?.nodeH ?? 0.62;
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  items.forEach((item, index) => {
    const angle = (Math.PI * 2 * index) / items.length - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius - nodeW / 2;
    const y = cy + Math.sin(angle) * radius - nodeH / 2;
    elements.push({
      type: 'backgroundRect',
      id: `cycle-node-${index + 1}`,
      position: box({ x, y, w: nodeW, h: nodeH }),
      style: { background: 'var(--flazz-ppt-bg)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 14 },
    });
    elements.push({
      type: 'text',
      id: `cycle-title-${index + 1}`,
      text: item.title || item.detail,
      position: box({ x: x + 0.1, y: y + 0.1, w: nodeW - 0.2, h: 0.2 }),
      style: { color: 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2%', fontWeight: 700, textAlign: 'center' },
    });
    if (item.detail) {
      elements.push({
        type: 'text',
        id: `cycle-detail-${index + 1}`,
        text: item.detail,
        position: box({ x: x + 0.1, y: y + 0.34, w: nodeW - 0.2, h: nodeH - 0.4 }),
        style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.5%', textAlign: 'center', lineHeight: 1.1 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildRelationMapSlide(options: RelationMapOptions): PresentationPreviewSlide {
  const center = typeof options.data.center === 'string'
    ? { title: options.data.center, detail: '' }
    : { title: options.data.center.title ?? '', detail: options.data.center.detail ?? '' };
  const nodes = normalizeInfographicItems(options.data.nodes, 2);
  const cx = options.layout?.cx ?? 5;
  const cy = options.layout?.cy ?? 3;
  const radius = options.layout?.radius ?? 1.62;
  const centerW = options.layout?.centerW ?? 1.85;
  const centerH = options.layout?.centerH ?? 0.9;
  const nodeW = options.layout?.nodeW ?? 1.55;
  const nodeH = options.layout?.nodeH ?? 0.66;
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  elements.push({
    type: 'backgroundRect',
    id: 'relation-center-bg',
    position: box({ x: cx - centerW / 2, y: cy - centerH / 2, w: centerW, h: centerH }),
    style: { background: 'var(--flazz-ppt-primary)', borderRadius: 16 },
  });
  elements.push({
    type: 'text',
    id: 'relation-center-title',
    text: center.title,
    position: box({ x: cx - centerW / 2 + 0.12, y: cy - centerH / 2 + 0.12, w: centerW - 0.24, h: center.detail ? 0.28 : centerH - 0.24 }),
    style: { color: 'var(--flazz-ppt-bg)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '1.95%', fontWeight: 700, textAlign: 'center' },
  });
  if (center.detail) {
    elements.push({
      type: 'text',
      id: 'relation-center-detail',
      text: center.detail,
      position: box({ x: cx - centerW / 2 + 0.12, y: cy + 0.1, w: centerW - 0.24, h: Math.max(0.22, centerH / 2 - 0.16) }),
      style: { color: 'var(--flazz-ppt-bg)', fontSize: '1.5%', textAlign: 'center' },
    });
  }
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    const nodeCx = cx + Math.cos(angle) * radius;
    const nodeCy = cy + Math.sin(angle) * radius;
    const x = nodeCx - nodeW / 2;
    const y = nodeCy - nodeH / 2;
    elements.push({
      type: 'backgroundRect',
      id: `relation-node-bg-${index + 1}`,
      position: box({ x, y, w: nodeW, h: nodeH }),
      style: { background: 'var(--flazz-ppt-bg)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 12 },
    });
    elements.push({
      type: 'text',
      id: `relation-node-title-${index + 1}`,
      text: node.title || node.detail,
      position: box({ x: x + 0.1, y: y + 0.1, w: nodeW - 0.2, h: 0.24 }),
      style: { color: 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '1.9%', fontWeight: 700, textAlign: 'center' },
    });
    if (node.detail) {
      elements.push({
        type: 'text',
        id: `relation-node-detail-${index + 1}`,
        text: node.detail,
        position: box({ x: x + 0.1, y: y + 0.38, w: nodeW - 0.2, h: nodeH - 0.44 }),
        style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.45%', textAlign: 'center' },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildBarChartWithTakeawaysSlide(options: BarChartWithTakeawaysOptions): PresentationPreviewSlide {
  const series = normalizeChartSeries(options.data.series);
  const takeaways = options.data.takeaways.map((item) => item.trim()).filter(Boolean);
  const layout = mergeLayout({ x: 0.8, y: 1.45, w: 8.4, h: 3.15 }, options.layout);
  const chartRatio = options.layout?.chartRatio ?? 0.56;
  const chartGap = options.layout?.chartGap ?? 0.35;
  const chartW = layout.w * chartRatio;
  const takeawayW = layout.w - chartW - chartGap;
  const chartH = layout.h - 0.42;
  const maxValue = Math.max(...series.map((point) => point.value), 1);
  const barGap = 0.12;
  const barW = Math.max(0.28, (chartW - barGap * Math.max(0, series.length - 1)) / Math.max(1, series.length));
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  series.forEach((point, index) => {
    const h = chartH * (point.value / maxValue);
    const x = layout.x + index * (barW + barGap);
    const y = layout.y + chartH - h;
    elements.push({
      type: 'backgroundRect',
      id: `chart-bar-${index + 1}`,
      position: box({ x, y, w: barW, h }),
      style: { background: 'var(--flazz-ppt-accent)' },
    });
    elements.push({
      type: 'text',
      id: `chart-value-${index + 1}`,
      text: String(point.value),
      position: box({ x, y: y - 0.24, w: barW, h: 0.18 }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.75%', fontWeight: 700, textAlign: 'center' },
    });
    elements.push({
      type: 'text',
      id: `chart-label-${index + 1}`,
      text: point.label,
      position: box({ x: x - 0.05, y: layout.y + chartH + 0.08, w: barW + 0.1, h: 0.24 }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.75%', textAlign: 'center' },
    });
  });
  elements.push({
    type: 'text',
    id: 'chart-takeaways',
    text: takeaways.map((item) => `• ${item}`).join('\n'),
    position: box({ x: layout.x + chartW + chartGap, y: layout.y + 0.2, w: takeawayW, h: layout.h - 0.5 }),
    style: { color: 'var(--flazz-ppt-secondary)', fontSize: '2.75%', lineHeight: 1.28, whiteSpace: 'pre-wrap' },
  });
  if (options.data.source) {
    elements.push({
      type: 'text',
      id: 'chart-source',
      text: `Source: ${options.data.source}`,
      position: box({ x: layout.x, y: layout.y + layout.h - 0.18, w: layout.w, h: 0.16 }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.55%', fontStyle: 'italic' },
    });
  }

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildMixedMediaPanelSlide(options: MixedMediaPanelOptions): PresentationPreviewSlide {
  const media = options.data;
  const layout = mergeLayout({ x: 0.8, y: 1.45, w: 8.4, h: 3.15 }, options.layout);
  const imageSide = options.layout?.imageSide ?? 'right';
  const imageRatio = options.layout?.imageRatio ?? 0.48;
  const gap = options.layout?.gap ?? 0.36;
  const imageW = layout.w * imageRatio;
  const textW = layout.w - imageW - gap;
  const imageX = imageSide === 'left' ? layout.x : layout.x + textW + gap;
  const textX = imageSide === 'left' ? layout.x + imageW + gap : layout.x;
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  elements.push({
    type: 'image',
    id: 'media-image',
    src: media.imagePath,
    alt: media.caption,
    position: box({ x: imageX, y: layout.y, w: imageW, h: layout.h - (media.caption ? 0.28 : 0) }),
  });
  if (media.title) {
    elements.push({
      type: 'text',
      id: 'media-title',
      text: media.title,
      position: box({ x: textX, y: layout.y, w: textW, h: 0.5 }),
      style: { color: 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '3.9%', fontWeight: 700, lineHeight: 1.05 },
    });
  }
  if (media.bullets?.length) {
    elements.push({
      type: 'text',
      id: 'media-bullets',
      text: media.bullets.map((item) => `• ${item}`).join('\n'),
      position: box({ x: textX, y: layout.y + (media.title ? 0.72 : 0), w: textW, h: layout.h - (media.title ? 0.9 : 0.2) }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '2.65%', lineHeight: 1.25, whiteSpace: 'pre-wrap' },
    });
  }
  if (media.caption) {
    elements.push({
      type: 'text',
      id: 'media-caption',
      text: media.caption,
      position: box({ x: imageX, y: layout.y + layout.h - 0.22, w: imageW, h: 0.18 }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.55%', fontStyle: 'italic' },
    });
  }

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildProcessTimelineSlide(options: ProcessTimelineOptions): PresentationPreviewSlide {
  const steps = normalizeRoadmapStages(options.steps);
  const layout = mergeLayout({ x: 0.8, y: 2.0, w: 8.4, h: 1.8 }, options.layout);
  const gap = options.layout?.gap ?? 0.16;
  const cardW = (layout.w - gap * Math.max(0, steps.length - 1)) / Math.max(1, steps.length);
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  elements.push({
    type: 'shape',
    id: 'timeline-axis',
    shape: 'line',
    position: box({ x: layout.x + 0.2, y: layout.y + 0.42, w: layout.w - 0.4, h: 0.01 }),
    style: { borderColor: 'var(--flazz-ppt-accent)', background: 'var(--flazz-ppt-accent)' },
  });

  steps.forEach((step, index) => {
    const x = layout.x + index * (cardW + gap);
    const markerSize = 0.34;
    elements.push({
      type: 'shape',
      id: `timeline-marker-${index + 1}`,
      shape: 'ellipse',
      position: box({ x: x + cardW / 2 - markerSize / 2, y: layout.y + 0.25, w: markerSize, h: markerSize }),
      style: { background: index === 0 ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-accent)' },
    });
    elements.push({
      type: 'text',
      id: `timeline-label-${index + 1}`,
      text: step.label || step.tag,
      position: box({ x, y: layout.y + 0.78, w: cardW, h: 0.28 }),
      style: { color: 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.35%', fontWeight: 700, textAlign: 'center' },
    });
    if (step.caption) {
      elements.push({
        type: 'text',
        id: `timeline-caption-${index + 1}`,
        text: step.caption,
        position: box({ x, y: layout.y + 1.12, w: cardW, h: layout.h - 1.12 }),
        style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.75%', textAlign: 'center', lineHeight: 1.12 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildQuadrantMatrixSlide(options: QuadrantMatrixOptions): PresentationPreviewSlide {
  const quadrants = options.quadrants.map((quadrant) => ({
    title: quadrant.title.trim(),
    items: quadrant.items.map((item) => item.trim()).filter(Boolean),
  })) as [Quadrant, Quadrant, Quadrant, Quadrant];
  const layout = mergeLayout({ x: 1.0, y: 1.35, w: 8.0, h: 3.45 }, options.layout);
  const gap = options.layout?.gap ?? 0.1;
  const cellW = (layout.w - gap) / 2;
  const cellH = (layout.h - gap) / 2;
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  quadrants.forEach((quadrant, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = layout.x + col * (cellW + gap);
    const y = layout.y + row * (cellH + gap);
    const highlight = index === 0;
    elements.push({
      type: 'backgroundRect',
      id: `quadrant-bg-${index + 1}`,
      position: box({ x, y, w: cellW, h: cellH }),
      style: {
        background: highlight ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-light)',
        border: '1px solid var(--flazz-ppt-accent)',
        borderRadius: 10,
      },
    });
    elements.push({
      type: 'text',
      id: `quadrant-title-${index + 1}`,
      text: quadrant.title,
      position: box({ x: x + 0.18, y: y + 0.16, w: cellW - 0.36, h: 0.28 }),
      style: { color: highlight ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.35%', fontWeight: 700 },
    });
    elements.push({
      type: 'text',
      id: `quadrant-items-${index + 1}`,
      text: quadrant.items.map((item) => `• ${item}`).join('\n'),
      position: box({ x: x + 0.22, y: y + 0.58, w: cellW - 0.44, h: cellH - 0.72 }),
      style: { color: highlight ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-secondary)', fontSize: '1.85%', lineHeight: 1.18, whiteSpace: 'pre-wrap' },
    });
  });

  if (options.xAxisLabel) {
    elements.push({
      type: 'text',
      id: 'quadrant-x-axis',
      text: options.xAxisLabel,
      position: box({ x: layout.x, y: layout.y + layout.h + 0.08, w: layout.w, h: 0.18 }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.65%', textAlign: 'center' },
    });
  }
  if (options.yAxisLabel) {
    elements.push({
      type: 'text',
      id: 'quadrant-y-axis',
      text: options.yAxisLabel,
      position: box({ x: layout.x - 0.58, y: layout.y + layout.h / 2 - 0.12, w: 0.5, h: 0.22 }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '1.65%', textAlign: 'center' },
    });
  }

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildMetricWallSlide(options: MetricWallOptions): PresentationPreviewSlide {
  return buildStatGridSlide({
    ...options,
    layout: {
      columns: options.layout?.columns ?? (options.cards.length >= 6 ? 3 : 2),
      cardGapX: options.layout?.cardGapX ?? 0.18,
      cardGapY: options.layout?.cardGapY ?? 0.18,
      ...options.layout,
    },
  });
}

export function buildEditorialQuoteSlide(options: EditorialQuoteOptions): PresentationPreviewSlide {
  const layout = mergeLayout({ x: 1.05, y: 1.38, w: 7.9, h: 3.05 }, options.layout);
  const quote = options.quote;
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  elements.push({
    type: 'backgroundRect',
    id: 'quote-panel',
    position: box(layout),
    style: { background: 'var(--flazz-ppt-light)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 14 },
  });
  if (quote.kicker) {
    elements.push({
      type: 'text',
      id: 'quote-kicker',
      text: quote.kicker,
      position: box({ x: layout.x + 0.36, y: layout.y + 0.26, w: layout.w - 0.72, h: 0.24 }),
      style: { color: 'var(--flazz-ppt-accent)', fontSize: '1.9%', fontWeight: 700, textTransform: 'uppercase' },
    });
  }
  elements.push({
    type: 'text',
    id: 'quote-body',
    text: quote.quote,
    position: box({ x: layout.x + 0.42, y: layout.y + (quote.kicker ? 0.66 : 0.44), w: layout.w - 0.84, h: layout.h - (quote.attribution ? 1.15 : 0.72) }),
    style: { color: 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '4.15%', fontWeight: 700, lineHeight: 1.05 },
  });
  if (quote.attribution) {
    elements.push({
      type: 'text',
      id: 'quote-attribution',
      text: quote.attribution,
      position: box({ x: layout.x + 0.42, y: layout.y + layout.h - 0.45, w: layout.w - 0.84, h: 0.24 }),
      style: { color: 'var(--flazz-ppt-secondary)', fontSize: '2%', textAlign: 'right' },
    });
  }

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildLayeredStackSlide(options: LayeredStackOptions): PresentationPreviewSlide {
  const layers = normalizeInfographicItems(options.layers, 2);
  const layout = mergeLayout({ x: 1.05, y: 1.35, w: 7.9, h: 3.35 }, options.layout);
  const gap = options.layout?.gap ?? 0.08;
  const layerH = (layout.h - gap * Math.max(0, layers.length - 1)) / Math.max(1, layers.length);
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];

  layers.forEach((layer, index) => {
    const offset = index * 0.12;
    const x = layout.x + offset;
    const y = layout.y + index * (layerH + gap);
    const w = layout.w - offset * 2;
    const active = index === 0;
    elements.push({
      type: 'backgroundRect',
      id: `layer-bg-${index + 1}`,
      position: box({ x, y, w, h: layerH }),
      style: { background: active ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-light)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 12 },
    });
    elements.push({
      type: 'text',
      id: `layer-title-${index + 1}`,
      text: layer.title || layer.detail,
      position: box({ x: x + 0.22, y: y + 0.12, w: w - 0.44, h: 0.28 }),
      style: { color: active ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '2.45%', fontWeight: 700 },
    });
    if (layer.detail) {
      elements.push({
        type: 'text',
        id: `layer-detail-${index + 1}`,
        text: layer.detail,
        position: box({ x: x + 0.22, y: y + 0.48, w: w - 0.44, h: layerH - 0.58 }),
        style: { color: active ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-secondary)', fontSize: '1.8%', lineHeight: 1.12 },
      });
    }
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildEvidenceMediaSlide(options: EvidenceMediaOptions): PresentationPreviewSlide {
  return buildMixedMediaPanelSlide({
    ...options,
    layout: {
      imageRatio: options.layout?.imageRatio ?? 0.58,
      gap: options.layout?.gap ?? 0.32,
      ...options.layout,
    },
  });
}

export function buildDiagonalCompareSlide(options: DiagonalCompareOptions): PresentationPreviewSlide {
  const columns = normalizeComparisonColumns(options.columns);
  const layout = mergeLayout({ x: 0.85, y: 1.35, w: 8.3, h: 3.35 }, options.layout);
  const elements: PresentationPreviewElement[] = [...titleElements(options.title, options.theme)];
  const leftW = layout.w * 0.52;
  const rightW = layout.w * 0.52;

  [
    { column: columns[0], x: layout.x, y: layout.y + 0.22, w: leftW, h: layout.h - 0.22, active: true },
    { column: columns[1], x: layout.x + layout.w - rightW, y: layout.y, w: rightW, h: layout.h - 0.22, active: false },
  ].forEach((card, index) => {
    elements.push({
      type: 'backgroundRect',
      id: `diagonal-card-${index + 1}`,
      position: box({ x: card.x, y: card.y, w: card.w, h: card.h }),
      style: { background: card.active ? 'var(--flazz-ppt-primary)' : 'var(--flazz-ppt-light)', border: '1px solid var(--flazz-ppt-accent)', borderRadius: 16 },
    });
    elements.push({
      type: 'text',
      id: `diagonal-title-${index + 1}`,
      text: card.column.title,
      position: box({ x: card.x + 0.25, y: card.y + 0.24, w: card.w - 0.5, h: 0.34 }),
      style: { color: card.active ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-primary)', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '3%', fontWeight: 700 },
    });
    elements.push({
      type: 'text',
      id: `diagonal-items-${index + 1}`,
      text: card.column.items.map((item) => `• ${item}`).join('\n'),
      position: box({ x: card.x + 0.3, y: card.y + 0.78, w: card.w - 0.6, h: card.h - 1.0 }),
      style: { color: card.active ? 'var(--flazz-ppt-bg)' : 'var(--flazz-ppt-secondary)', fontSize: '2.15%', lineHeight: 1.2, whiteSpace: 'pre-wrap' },
    });
  });

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}

export function buildHeroImageOverlaySlide(options: HeroImageOverlayOptions): PresentationPreviewSlide {
  const layout = mergeLayout({ x: 0, y: 0, w: SLIDE_W, h: SLIDE_H }, options.layout);
  const elements: PresentationPreviewElement[] = [
    {
      type: 'image',
      id: 'hero-image',
      src: options.imagePath,
      alt: options.headline,
      position: box(layout),
    },
    {
      type: 'backgroundRect',
      id: 'hero-scrim',
      position: box(layout),
      style: { background: 'rgba(0, 0, 0, 0.36)' },
    },
    {
      type: 'text',
      id: 'hero-headline',
      text: options.headline,
      position: box({ x: 0.75, y: 3.25, w: 7.8, h: 0.72 }),
      style: { color: 'FFFFFF', fontFamily: 'var(--flazz-ppt-font-heading)', fontSize: '6.2%', fontWeight: 700, lineHeight: 1.02 },
    },
  ];

  if (options.subtitle) {
    elements.push({
      type: 'text',
      id: 'hero-subtitle',
      text: options.subtitle,
      position: box({ x: 0.78, y: 4.1, w: 6.9, h: 0.46 }),
      style: { color: 'FFFFFF', fontSize: '2.7%', lineHeight: 1.15 },
    });
  }

  elements.push(...pageBadgeElement(slideNumberFromId(options.id)));
  return { id: options.id, backgroundColor: options.backgroundColor, elements };
}
