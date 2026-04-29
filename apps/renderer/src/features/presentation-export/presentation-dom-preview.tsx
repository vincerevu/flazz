import type { CSSProperties } from 'react';
import type {
  PresentationPreviewBackgroundRectElement,
  PresentationPreviewDeck,
  PresentationPreviewDecorElement,
  PresentationPreviewElement,
  PresentationPreviewImageElement,
  PresentationPreviewPosition,
  PresentationPreviewShapeElement,
  PresentationPreviewSlide,
  PresentationPreviewTableElement,
  PresentationPreviewTextElement,
  PresentationPreviewTheme,
} from './types';

const DEFAULT_THEME: Required<PresentationPreviewTheme> = {
  primary: '#22223b',
  secondary: '#4a4e69',
  accent: '#9a8c98',
  light: '#c9ada7',
  bg: '#f8f7f2',
  fontHeading: 'Georgia',
  fontBody: 'Calibri',
};

function percentBox(position: PresentationPreviewPosition): CSSProperties {
  return {
    position: 'absolute',
    left: `${position.x}%`,
    top: `${position.y}%`,
    width: `${position.width}%`,
    height: `${position.height}%`,
  };
}

function themeVars(theme?: PresentationPreviewTheme): CSSProperties {
  const merged = { ...DEFAULT_THEME, ...theme };
  return {
    '--flazz-ppt-primary': merged.primary,
    '--flazz-ppt-secondary': merged.secondary,
    '--flazz-ppt-accent': merged.accent,
    '--flazz-ppt-light': merged.light,
    '--flazz-ppt-bg': merged.bg,
    '--flazz-ppt-font-heading': merged.fontHeading,
    '--flazz-ppt-font-body': merged.fontBody,
  } as CSSProperties;
}

function renderText(element: PresentationPreviewTextElement) {
  return (
    <div
      key={element.id ?? element.text}
      data-pptx-text
      data-pptx-id={element.id}
      style={{
        ...percentBox(element.position),
        color: 'var(--flazz-ppt-secondary)',
        fontFamily: 'var(--flazz-ppt-font-body)',
        fontSize: '3.2%',
        lineHeight: 1.2,
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        ...element.style,
      }}
    >
      {element.text}
    </div>
  );
}

function renderImage(element: PresentationPreviewImageElement) {
  const attrs = element.rootImage
    ? { 'data-pptx-root-image': true }
    : { 'data-pptx-image': true };

  return (
    <img
      key={element.id ?? element.src}
      {...attrs}
      data-pptx-id={element.id}
      data-pptx-capture={element.capture ? 'true' : undefined}
      src={element.src}
      alt={element.alt ?? ''}
      style={{
        ...percentBox(element.position),
        objectFit: 'cover',
        display: 'block',
        ...element.style,
      }}
    />
  );
}

function renderShape(element: PresentationPreviewShapeElement) {
  return (
    <div
      key={element.id ?? `${element.shape}-${element.position.x}-${element.position.y}`}
      data-pptx-shape={element.shape ?? 'rect'}
      data-pptx-id={element.id}
      style={{
        ...percentBox(element.position),
        background: 'var(--flazz-ppt-light)',
        border: '1px solid var(--flazz-ppt-secondary)',
        borderRadius: element.shape === 'pill' ? 999 : element.shape === 'ellipse' ? '50%' : undefined,
        ...element.style,
      }}
    />
  );
}

function normalizeCell(cell: PresentationPreviewTableElement['rows'][number][number]) {
  return typeof cell === 'string' ? { text: cell } : cell;
}

function renderTable(element: PresentationPreviewTableElement) {
  return (
    <table
      key={element.id ?? `table-${element.position.x}-${element.position.y}`}
      data-pptx-table
      data-pptx-id={element.id}
      style={{
        ...percentBox(element.position),
        borderCollapse: 'collapse',
        color: 'var(--flazz-ppt-secondary)',
        fontFamily: 'var(--flazz-ppt-font-body)',
        fontSize: '2.4%',
        tableLayout: 'fixed',
        ...element.style,
      }}
    >
      <tbody>
        {element.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((rawCell, cellIndex) => {
              const cell = normalizeCell(rawCell);
              const Tag = cell.isHeader ? 'th' : 'td';
              return (
                <Tag
                  key={cellIndex}
                  style={{
                    border: '1px solid rgba(74, 78, 105, 0.28)',
                    padding: '0.55em 0.65em',
                    textAlign: 'left',
                    verticalAlign: 'top',
                    background: cell.isHeader ? 'var(--flazz-ppt-light)' : 'transparent',
                    fontWeight: cell.isHeader ? 700 : 400,
                    ...(cell.isHeader ? element.headerCellStyle : element.cellStyle),
                    ...cell.style,
                  }}
                >
                  {cell.text}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderBackgroundRect(element: PresentationPreviewBackgroundRectElement) {
  return (
    <div
      key={element.id ?? `background-${element.position.x}-${element.position.y}`}
      data-pptx-background-rect
      data-pptx-id={element.id}
      style={{
        ...percentBox(element.position),
        background: 'var(--flazz-ppt-light)',
        borderRadius: 8,
        ...element.style,
      }}
    />
  );
}

function renderDecor(element: PresentationPreviewDecorElement) {
  return (
    <div
      key={element.id ?? `decor-${element.position.x}-${element.position.y}`}
      data-pptx-decor={element.decorType ?? 'decor'}
      data-pptx-id={element.id}
      data-pptx-capture={element.capture ? 'true' : undefined}
      style={{
        ...percentBox(element.position),
        ...element.style,
      }}
    >
      {element.children}
    </div>
  );
}

function renderElement(element: PresentationPreviewElement) {
  switch (element.type) {
    case 'text':
      return renderText(element);
    case 'image':
      return renderImage(element);
    case 'shape':
      return renderShape(element);
    case 'table':
      return renderTable(element);
    case 'backgroundRect':
      return renderBackgroundRect(element);
    case 'decor':
      return renderDecor(element);
  }
}

export type PresentationDomPreviewProps = {
  deck: PresentationPreviewDeck;
  className?: string;
  slideClassName?: string;
  slideStyle?: CSSProperties;
};

export function PresentationDomPreview({
  deck,
  className,
  slideClassName,
  slideStyle,
}: PresentationDomPreviewProps) {
  return (
    <div className={className} style={themeVars(deck.theme)}>
      {deck.slides.map((slide) => (
        <PresentationDomSlide
          key={slide.id}
          slide={slide}
          className={slideClassName}
          style={slideStyle}
        />
      ))}
    </div>
  );
}

export type PresentationDomSlideProps = {
  slide: PresentationPreviewSlide;
  className?: string;
  style?: CSSProperties;
};

export function PresentationDomSlide({ slide, className, style }: PresentationDomSlideProps) {
  return (
    <section
      data-flazz-slide={slide.id}
      className={className}
      style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: slide.backgroundColor ?? 'var(--flazz-ppt-bg)',
        backgroundImage: slide.backgroundImageUrl ? `url("${slide.backgroundImageUrl}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: 'var(--flazz-ppt-secondary)',
        ...style,
      }}
    >
      {slide.elements.map(renderElement)}
    </section>
  );
}
