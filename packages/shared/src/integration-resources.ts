import { z } from "zod";

export const IntegrationResourceType = z.enum([
  "message",
  "document",
  "ticket",
  "event",
  "file",
  "record",
  "code",
  "spreadsheet",
]);

export const IntegrationCapability = z.enum([
  "list",
  "search",
  "read",
  "create",
  "update",
  "reply",
  "comment",
]);

export const IntegrationRetrievalMode = z.enum([
  "compact",
  "summary",
  "detailed_structured",
  "slices",
  "full",
]);

export const NormalizedSupportLevel = z.enum([
  "none",
  "read_only",
  "full",
]);

export const IntegrationProviderWave = z.enum([
  "p0",
  "p1",
  "p2",
]);

export const GenericRequestPolicy = z.enum([
  "list_recent_first",
  "search_first",
  "needs_explicit_scope",
]);

const SizeMetadata = z.object({
  estimatedChars: z.number().optional(),
  estimatedTokens: z.number().optional(),
  itemCount: z.number().optional(),
  hasAttachment: z.boolean().optional(),
  threadLength: z.number().optional(),
});

export const MessageItem = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  title: z.string(),
  author: z.string().optional(),
  timestamp: z.string().optional(),
  snippet: z.string().optional(),
  hasAttachment: z.boolean().optional(),
  sizeEstimate: z.number().optional(),
  source: z.string(),
}).merge(SizeMetadata);

export const DocumentItem = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string().optional(),
  preview: z.string().optional(),
  source: z.string(),
  sizeEstimate: z.number().optional(),
}).merge(SizeMetadata);

export const TicketItem = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string().optional(),
  assignee: z.string().optional(),
  updatedAt: z.string().optional(),
  preview: z.string().optional(),
  source: z.string(),
}).merge(SizeMetadata);

export const EventItem = z.object({
  id: z.string(),
  title: z.string(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  source: z.string(),
}).merge(SizeMetadata);

export const FileItem = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string().optional(),
  mimeType: z.string().optional(),
  preview: z.string().optional(),
  source: z.string(),
}).merge(SizeMetadata);

export const RecordItem = z.object({
  id: z.string(),
  title: z.string(),
  recordType: z.string().optional(),
  owner: z.string().optional(),
  updatedAt: z.string().optional(),
  preview: z.string().optional(),
  source: z.string(),
}).merge(SizeMetadata);

export const CodeItem = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string().optional(),
  repository: z.string().optional(),
  preview: z.string().optional(),
  source: z.string(),
}).merge(SizeMetadata);

export const SpreadsheetItem = z.object({
  id: z.string(),
  title: z.string(),
  sheetName: z.string().optional(),
  rowLabel: z.string().optional(),
  preview: z.string().optional(),
  source: z.string(),
}).merge(SizeMetadata);

export const ProviderResourceDescriptor = z.object({
  app: z.string(),
  resourceType: IntegrationResourceType,
  capabilities: z.array(IntegrationCapability),
});

export const IntegrationProviderStatus = z.object({
  app: z.string(),
  connected: z.boolean(),
  normalizedSupported: z.boolean(),
  normalizedSupport: NormalizedSupportLevel,
  wave: IntegrationProviderWave.optional(),
  genericRequestPolicy: GenericRequestPolicy.optional(),
  genericRequestTarget: z.string().optional(),
  resourceType: IntegrationResourceType.optional(),
  capabilities: z.array(IntegrationCapability),
  note: z.string().optional(),
});

export type ProviderResourceDescriptorRecord = z.infer<typeof ProviderResourceDescriptor>;
export type IntegrationProviderStatusRecord = z.infer<typeof IntegrationProviderStatus>;

