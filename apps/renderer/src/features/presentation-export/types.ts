import type { CSSProperties, ReactNode } from 'react';

export type PresentationPreviewTheme = {
  primary: string;
  secondary: string;
  accent: string;
  light: string;
  bg: string;
  fontHeading?: string;
  fontBody?: string;
};

export type PresentationPreviewPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PresentationPreviewTextElement = {
  type: 'text';
  id?: string;
  text: string;
  position: PresentationPreviewPosition;
  style?: CSSProperties;
};

export type PresentationPreviewImageElement = {
  type: 'image';
  id?: string;
  src: string;
  alt?: string;
  capture?: boolean;
  rootImage?: boolean;
  position: PresentationPreviewPosition;
  style?: CSSProperties;
};

export type PresentationPreviewShapeElement = {
  type: 'shape';
  id?: string;
  shape?: 'rect' | 'ellipse' | 'line' | 'arrow' | 'pill' | 'parallelogram';
  position: PresentationPreviewPosition;
  style?: CSSProperties;
};

export type PresentationPreviewTableElement = {
  type: 'table';
  id?: string;
  rows: Array<Array<string | { text: string; isHeader?: boolean; style?: CSSProperties }>>;
  position: PresentationPreviewPosition;
  style?: CSSProperties;
  cellStyle?: CSSProperties;
  headerCellStyle?: CSSProperties;
};

export type PresentationPreviewBackgroundRectElement = {
  type: 'backgroundRect';
  id?: string;
  position: PresentationPreviewPosition;
  style?: CSSProperties;
};

export type PresentationPreviewDecorElement = {
  type: 'decor';
  id?: string;
  decorType?: string;
  capture?: boolean;
  position: PresentationPreviewPosition;
  style?: CSSProperties;
  children: ReactNode;
};

export type PresentationPreviewElement =
  | PresentationPreviewTextElement
  | PresentationPreviewImageElement
  | PresentationPreviewShapeElement
  | PresentationPreviewTableElement
  | PresentationPreviewBackgroundRectElement
  | PresentationPreviewDecorElement;

export type PresentationPreviewSlide = {
  id: string;
  backgroundColor?: string;
  backgroundImageUrl?: string;
  elements: PresentationPreviewElement[];
};

export type PresentationPreviewDeck = {
  title?: string;
  theme?: PresentationPreviewTheme;
  slides: PresentationPreviewSlide[];
};
