import { z } from "zod";

export const GraphSignalSource = z.enum([
  "github",
  "jira",
  "linear",
  "googlecalendar",
  "record",
  "file",
  "spreadsheet",
  "run-memory",
  "conversation",
  "document",
  "email",
]);

export const GraphSignalKind = z.enum([
  "assignment",
  "status-change",
  "review-request",
  "meeting",
  "meeting-relationship",
  "project-link",
  "decision-candidate",
  "action-item-candidate",
  "preference",
  "correction",
]);

export const GraphSignal = z.object({
  id: z.string(),
  source: GraphSignalSource,
  kind: GraphSignalKind,
  objectId: z.string(),
  objectType: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  occurredAt: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  entityRefs: z.array(z.string()).default([]),
  topicRefs: z.array(z.string()).default([]),
  projectRefs: z.array(z.string()).default([]),
  relationRefs: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  provenance: z.string(),
  fingerprint: z.string(),
});

export const GraphSignalState = z.object({
  signals: z.array(GraphSignal).default([]),
  lastUpdatedAt: z.string().optional(),
});

export const GraphSignalSummary = GraphSignal.pick({
  id: true,
  source: true,
  kind: true,
  objectId: true,
  objectType: true,
  title: true,
  summary: true,
  occurredAt: true,
  confidence: true,
  entityRefs: true,
  topicRefs: true,
  projectRefs: true,
  relationRefs: true,
  provenance: true,
});
