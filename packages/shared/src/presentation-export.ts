import { z } from 'zod';

export const PresentationDomPosition = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  aspectRatio: z.number().positive().optional(),
  aspectRatioBase: z.enum(['width', 'height']).optional(),
});

export const PresentationDomTextStyle = z.object({
  color: z.string().optional(),
  fontFace: z.string().optional(),
  fontSize: z.number().positive().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  valign: z.enum(['top', 'mid', 'bottom']).optional(),
});

export const PresentationDomShapeStyle = z.object({
  fill: z.string().optional(),
  line: z.string().optional(),
  lineWidth: z.number().nonnegative().optional(),
  radius: z.number().nonnegative().optional(),
  background: z.string().optional(),
});

export const PresentationDomTextElement = z.object({
  type: z.literal('text'),
  id: z.string().optional(),
  text: z.string(),
  position: PresentationDomPosition,
  style: PresentationDomTextStyle.optional(),
});

export const PresentationDomImageElement = z.object({
  type: z.literal('image'),
  id: z.string().optional(),
  src: z.string(),
  alt: z.string().optional(),
  position: PresentationDomPosition,
});

export const PresentationDomShapeElement = z.object({
  type: z.literal('shape'),
  id: z.string().optional(),
  shape: z.enum(['rect', 'ellipse', 'line', 'arrow', 'pill', 'parallelogram']).default('rect'),
  position: PresentationDomPosition,
  style: PresentationDomShapeStyle.optional(),
});

export const PresentationDomTableCell = z.object({
  text: z.string(),
  isHeader: z.boolean().optional(),
  colSpan: z.number().int().positive().optional(),
  rowSpan: z.number().int().positive().optional(),
  backgroundColor: z.string().optional(),
  style: PresentationDomTextStyle.optional(),
});

export const PresentationDomTableElement = z.object({
  type: z.literal('table'),
  id: z.string().optional(),
  position: PresentationDomPosition,
  rows: z.array(z.array(PresentationDomTableCell)),
  headerRowCount: z.number().int().nonnegative().optional(),
});

export const PresentationDomDecorElement = z.object({
  type: z.literal('decor'),
  id: z.string().optional(),
  src: z.string(),
  decorType: z.string().optional(),
  position: PresentationDomPosition,
});

export const PresentationDomBackgroundRectElement = z.object({
  type: z.literal('backgroundRect'),
  id: z.string().optional(),
  position: PresentationDomPosition,
  style: PresentationDomShapeStyle.optional(),
});

export const PresentationDomRootImage = z.object({
  src: z.string(),
  originalSrc: z.string().optional(),
  position: PresentationDomPosition,
  isBase64: z.boolean().optional(),
});

export const PresentationDomExportElement = z.discriminatedUnion('type', [
  PresentationDomTextElement,
  PresentationDomImageElement,
  PresentationDomShapeElement,
  PresentationDomTableElement,
  PresentationDomDecorElement,
  PresentationDomBackgroundRectElement,
]);

export const PresentationDomScanResult = z.object({
  slideId: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  backgroundColor: z.string().optional(),
  backgroundImageUrl: z.string().optional(),
  rootImage: PresentationDomRootImage.optional(),
  elements: z.array(PresentationDomExportElement),
});

export const PresentationDomExportRequest = z.object({
  outputPath: z.string().min(1),
  title: z.string().optional(),
  slides: z.array(PresentationDomScanResult).min(1),
});

export const PresentationDomExportResponse = z.object({
  path: z.string(),
  slideCount: z.number().int().nonnegative(),
});

export type PresentationDomPosition = z.infer<typeof PresentationDomPosition>;
export type PresentationDomTextStyle = z.infer<typeof PresentationDomTextStyle>;
export type PresentationDomShapeStyle = z.infer<typeof PresentationDomShapeStyle>;
export type PresentationDomTextElement = z.infer<typeof PresentationDomTextElement>;
export type PresentationDomImageElement = z.infer<typeof PresentationDomImageElement>;
export type PresentationDomShapeElement = z.infer<typeof PresentationDomShapeElement>;
export type PresentationDomTableCell = z.infer<typeof PresentationDomTableCell>;
export type PresentationDomTableElement = z.infer<typeof PresentationDomTableElement>;
export type PresentationDomDecorElement = z.infer<typeof PresentationDomDecorElement>;
export type PresentationDomBackgroundRectElement = z.infer<typeof PresentationDomBackgroundRectElement>;
export type PresentationDomRootImage = z.infer<typeof PresentationDomRootImage>;
export type PresentationDomExportElement = z.infer<typeof PresentationDomExportElement>;
export type PresentationDomScanResult = z.infer<typeof PresentationDomScanResult>;
export type PresentationDomExportRequest = z.infer<typeof PresentationDomExportRequest>;
export type PresentationDomExportResponse = z.infer<typeof PresentationDomExportResponse>;
