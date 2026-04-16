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

export const ProviderResourceDescriptor = z.object({
  app: z.string(),
  resourceType: IntegrationResourceType,
  capabilities: z.array(IntegrationCapability),
});

