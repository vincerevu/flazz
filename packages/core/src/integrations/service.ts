import { z } from "zod";
import { composioAccountsRepo } from "../composio/repo.js";
import { executeAction, isConfigured } from "../composio/client.js";
import { capabilityRegistry, graphSignalService, graphSyncService, integrationIdempotencyRepo, integrationRetrievalController, providerMapper } from "../di/container.js";
import { buildSlicesView, buildStructuredView, buildSummaryView, normalizeResource } from "./provider-transformers.js";
import { resolveToolForOperation, type ResolvedTool } from "./action-resolver.js";
import type { IntegrationCapability, IntegrationResourceType, IntegrationRetrievalMode } from "./types.js";
import { enforceWritePolicy } from "./write-policy.js";
import { integrationError, type IntegrationErrorResult } from "./errors.js";
import { getFieldAliases } from "./family-field-aliases.js";
import type { GraphSignalService } from "../memory-graph/graph-signal-service.js";
import { buildSyncWindowPlan } from "./sync-window.js";

type ItemId = string;
type OperationFailure = {
  success: false;
  code: IntegrationErrorResult["code"];
  error: string;
  resolvedTool?: string;
};
type OperationSuccess = {
  success: true;
  resourceType: IntegrationResourceType;
  result: unknown;
  resolvedTool: string;
};

const CommonItemInput = z.object({
  app: z.string(),
  limit: z.number().int().positive().max(50).optional(),
  cursor: z.string().optional(),
  additionalInput: z.record(z.string(), z.unknown()).optional(),
});

const SyncListInput = CommonItemInput.extend({
  windowDays: z.number().int().positive().max(30).optional(),
  nowIso: z.string().datetime().optional(),
});

const SearchItemInput = CommonItemInput.extend({
  query: z.string().min(1),
});

const ReadItemInput = z.object({
  app: z.string(),
  itemId: z.string().min(1),
  additionalInput: z.record(z.string(), z.unknown()).optional(),
});

const ReplyItemInput = z.object({
  app: z.string(),
  itemId: z.string().min(1),
  content: z.string().min(1),
  confirmed: z.boolean().optional(),
  additionalInput: z.record(z.string(), z.unknown()).optional(),
});

const CreateItemInput = z.object({
  app: z.string(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  confirmed: z.boolean().optional(),
  additionalInput: z.record(z.string(), z.unknown()).optional(),
});

const UpdateItemInput = z.object({
  app: z.string(),
  itemId: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  confirmed: z.boolean().optional(),
  additionalInput: z.record(z.string(), z.unknown()).optional(),
});

const CommentItemInput = z.object({
  app: z.string(),
  itemId: z.string().min(1),
  content: z.string().min(1),
  confirmed: z.boolean().optional(),
  additionalInput: z.record(z.string(), z.unknown()).optional(),
});

function hasProperty(tool: ResolvedTool, propertyNames: string[]) {
  return propertyNames.find((name) => name in tool.inputParameters.properties);
}

function assignFirst(input: Record<string, unknown>, tool: ResolvedTool, propertyNames: string[], value: unknown) {
  const key = hasProperty(tool, propertyNames);
  if (key) {
    input[key] = value;
  }
}

function assignCursor(input: Record<string, unknown>, tool: ResolvedTool, cursor: string | undefined) {
  if (!cursor) return;
  assignFirst(input, tool, ["page_token", "pageToken", "next_page_token", "nextPageToken", "cursor", "next_cursor", "offset"], cursor);
}

function getMissingRequiredFields(tool: ResolvedTool, input: Record<string, unknown>) {
  const required = tool.inputParameters.required ?? [];
  return required.filter((field) => !(field in input));
}

function buildOperationInput(
  tool: ResolvedTool,
  app: string,
  resourceType: IntegrationResourceType,
  operation: IntegrationCapability,
  params: { query?: string; limit?: number; cursor?: string; itemId?: ItemId; title?: string; content?: string; additionalInput?: Record<string, unknown> },
) {
  const input: Record<string, unknown> = {
    ...(params.additionalInput ?? {}),
  };

  if (params.query) {
    assignFirst(input, tool, getFieldAliases(app, resourceType, "query", operation), params.query);
  }
  if (typeof params.limit === "number") {
    assignFirst(input, tool, getFieldAliases(app, resourceType, "limit", operation), params.limit);
  }
  assignCursor(input, tool, params.cursor);
  if (params.itemId) {
    assignFirst(
      input,
      tool,
      getFieldAliases(app, resourceType, "itemId", operation),
      params.itemId,
    );
  }
  if (params.title) {
    assignFirst(input, tool, getFieldAliases(app, resourceType, "title", operation), params.title);
  }
  if (params.content) {
    assignFirst(
      input,
      tool,
      getFieldAliases(app, resourceType, "content", operation),
      params.content,
    );
  }

  const missing = getMissingRequiredFields(tool, input);
  const missingSafe = missing.filter((field) => !["cursor", "page"].includes(field));
  if (missingSafe.length > 0) {
    return {
      ok: false as const,
      error: `Resolved integration tool '${tool.slug}' still requires unsupported fields: ${missingSafe.join(", ")}.`,
      input,
    };
  }

  return {
    ok: true as const,
    input,
  };
}

function extractCollection(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;
  const keys = ["items", "messages", "emails", "threads", "results", "documents", "pages", "issues", "tickets", "events", "files", "records", "rows", "entries", "data"];
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [record];
}

function extractNextCursor(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const directKeys = ["nextPageToken", "next_page_token", "nextCursor", "next_cursor", "pageToken", "cursor"];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  const nested = typeof record.pagination === "object" && record.pagination !== null
    ? (record.pagination as Record<string, unknown>)
    : typeof record.paging === "object" && record.paging !== null
      ? (record.paging as Record<string, unknown>)
      : null;
  if (!nested) {
    return null;
  }

  for (const key of directKeys) {
    const value = nested[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  if (typeof nested.next === "string" && nested.next.trim()) {
    return nested.next;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function pickStringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

async function enrichGoogleMeetReadResult(
  item: unknown,
  itemId: string,
  additionalInput?: Record<string, unknown>,
) {
  const base = asRecord(item);
  if (!Object.keys(base).length) {
    return item;
  }

  const account = composioAccountsRepo.getAccount("googlemeet");
  if (!account || account.status !== "ACTIVE") {
    return item;
  }

  const scopeInput = { ...(additionalInput ?? {}) };
  const meetingCode =
    pickStringValue(base, ["meeting_code", "meetingCode"]) ??
    (typeof scopeInput.meeting_code === "string" ? scopeInput.meeting_code : undefined) ??
    (typeof scopeInput.meetingCode === "string" ? scopeInput.meetingCode : undefined);
  const spaceName =
    pickStringValue(base, ["space_name", "name", "space"]) ??
    (typeof scopeInput.space_name === "string" ? scopeInput.space_name : undefined) ??
    (typeof scopeInput.spaceName === "string" ? scopeInput.spaceName : undefined) ??
    itemId;
  const startTime =
    pickStringValue(base, ["start_time", "startTime", "startAt"]) ??
    (typeof scopeInput.start_time === "string" ? scopeInput.start_time : undefined) ??
    (typeof scopeInput.startTime === "string" ? scopeInput.startTime : undefined);
  const endTime =
    pickStringValue(base, ["end_time", "endTime", "endAt"]) ??
    (typeof scopeInput.end_time === "string" ? scopeInput.end_time : undefined) ??
    (typeof scopeInput.endTime === "string" ? scopeInput.endTime : undefined);

  const conferenceLookupInput: Record<string, unknown> = {};
  if (spaceName) {
    conferenceLookupInput.space_name = spaceName;
  }
  if (meetingCode) {
    conferenceLookupInput.meeting_code = meetingCode;
  }
  if (startTime) {
    conferenceLookupInput.start_time = startTime;
  }
  if (endTime) {
    conferenceLookupInput.end_time = endTime;
  }

  if (!Object.keys(conferenceLookupInput).length) {
    return item;
  }

  const conferenceLookup = await executeAction(
    "GOOGLEMEET_GET_CONFERENCE_RECORD_FOR_MEET",
    account.id,
    conferenceLookupInput,
  );
  if (!conferenceLookup.success) {
    return item;
  }

  const conferenceRecord = extractCollection(conferenceLookup.data)[0] ?? conferenceLookup.data;
  const conferenceRecordRecord = asRecord(conferenceRecord);
  const conferenceRecordId = pickStringValue(conferenceRecordRecord, [
    "conferenceRecord_id",
    "conferenceRecordId",
    "name",
    "id",
  ]);
  if (!conferenceRecordId) {
    return {
      ...base,
      conferenceRecord,
    };
  }

  const [recordingsResult, transcriptsResult] = await Promise.all([
    executeAction("GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID", account.id, {
      conferenceRecord_id: conferenceRecordId,
    }),
    executeAction("GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID", account.id, {
      conferenceRecord_id: conferenceRecordId,
    }),
  ]);

  const recordings = recordingsResult.success ? extractCollection(recordingsResult.data) : [];
  const transcripts = transcriptsResult.success ? extractCollection(transcriptsResult.data) : [];

  return {
    ...base,
    conferenceRecord,
    conferenceRecordId,
    recordings,
    transcripts,
    recordingCount: recordings.length,
    transcriptCount: transcripts.length,
  };
}

export function ingestNormalizedGraphSignals(
  app: string,
  resourceType: IntegrationResourceType,
  items: unknown[],
  signalService: Pick<GraphSignalService, "ingestNormalizedItem"> = graphSignalService,
) {
  for (const item of items) {
    try {
      signalService.ingestNormalizedItem(app, resourceType, item);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown graph signal error";
      console.warn(`[Integrations] Failed to ingest graph signal for ${app}:${resourceType}: ${message}`);
    }
  }
}

function recordGraphSyncRead(
  app: string,
  resourceType: IntegrationResourceType,
  itemCount: number,
  syncService: Pick<typeof graphSyncService, "recordRead"> = graphSyncService,
) {
  try {
    syncService.recordRead(app, resourceType, itemCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown graph sync error";
    console.warn(`[Integrations] Failed to record graph sync read for ${app}:${resourceType}: ${message}`);
  }
}

function withReadDefaults(app: string, additionalInput?: Record<string, unknown>) {
  const merged = { ...(additionalInput ?? {}) };
  if (
    app === "googlecalendar" &&
    merged.calendarId === undefined &&
    merged.calendar_id === undefined
  ) {
    merged.calendarId = "primary";
  }
  return merged;
}

function withGitHubScopeDefaults(
  capability: IntegrationCapability,
  itemId: string | undefined,
  additionalInput?: Record<string, unknown>,
) {
  const merged = { ...(additionalInput ?? {}) };

  const repository =
    typeof merged.repository === "string" ? merged.repository :
    typeof merged.repoFullName === "string" ? merged.repoFullName :
    typeof merged.full_name === "string" ? merged.full_name :
    undefined;

  if (repository && !merged.owner && !merged.repo) {
    const [owner, repo] = repository.split("/", 2);
    if (owner && repo) {
      merged.owner = owner;
      merged.repo = repo;
    }
  }

  if (itemId && merged.issue_number === undefined && /^\d+$/.test(itemId)) {
    merged.issue_number = itemId;
  }

  if (
    (capability === "read" || capability === "update" || capability === "comment") &&
    merged.issue_number === undefined &&
    typeof merged.number === "string" &&
    /^\d+$/.test(merged.number)
  ) {
    merged.issue_number = merged.number;
  }

  return merged;
}

function parseSpreadsheetValues(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return [[content]];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      if (parsed.every((row) => Array.isArray(row))) {
        return parsed.map((row) => row.map((cell) => String(cell ?? "")));
      }
      return [parsed.map((cell) => String(cell ?? ""))];
    }
    if (parsed && typeof parsed === "object") {
      return [Object.values(parsed as Record<string, unknown>).map((cell) => String(cell ?? ""))];
    }
  } catch {
    // Fall through to text parsing.
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [[content]];
  return lines.map((line) => line.split(",").map((cell) => cell.trim()));
}

function withGoogleSheetsDefaults(
  capability: IntegrationCapability,
  content: string | undefined,
  additionalInput?: Record<string, unknown>,
) {
  const merged = { ...(additionalInput ?? {}) };

  if (merged.spreadsheet_id && merged.spreadsheetId === undefined) {
    merged.spreadsheetId = merged.spreadsheet_id;
  }
  if (merged.spreadsheetId && merged.spreadsheet_id === undefined) {
    merged.spreadsheet_id = merged.spreadsheetId;
  }

  if (capability === "create") {
    if (merged.valueInputOption === undefined) {
      merged.valueInputOption = "USER_ENTERED";
    }
    if (merged.values === undefined && content) {
      merged.values = parseSpreadsheetValues(content);
    }
    if (merged.range === undefined && typeof merged.sheet_name === "string") {
      merged.range = `${merged.sheet_name}!A1`;
    }
    if (merged.range === undefined && typeof merged.sheetName === "string") {
      merged.range = `${merged.sheetName}!A1`;
    }
  }

  return merged;
}

function withOperationDefaults(
  app: string,
  capability: IntegrationCapability,
  params: { itemId?: string; content?: string; additionalInput?: Record<string, unknown> },
) {
  let merged = { ...(params.additionalInput ?? {}) };

  if (app === "googlecalendar" && capability === "read") {
    merged = withReadDefaults(app, merged);
  }

  if (app === "github") {
    merged = withGitHubScopeDefaults(capability, params.itemId, merged);
  }

  if (app === "googlesheets") {
    merged = withGoogleSheetsDefaults(capability, params.content, merged);
  }

  return merged;
}

async function executeNormalizedOperation(
  app: string,
  capability: IntegrationCapability,
  params: { query?: string; limit?: number; cursor?: string; itemId?: string; title?: string; content?: string; additionalInput?: Record<string, unknown> },
): Promise<OperationFailure | OperationSuccess> {
  if (!isConfigured()) {
    return integrationError("not_configured", "Composio is not configured.");
  }

  const account = composioAccountsRepo.getAccount(app);
  if (!account || account.status !== "ACTIVE") {
    return integrationError("not_connected", `${app} is not connected.`);
  }

  const descriptor = providerMapper.getDescriptor(app);
  if (!descriptor) {
    const status = providerMapper.getStatus(app, true);
    return integrationError(
      "missing_descriptor",
      status.note || `No normalized integration descriptor registered for '${app}'.`,
    );
  }
  if (!capabilityRegistry.supports(app, capability)) {
    return integrationError("unsupported_capability", `${app} does not support normalized '${capability}' operations.`);
  }

  const tool = await resolveToolForOperation(app, descriptor.resourceType, capability);
  if (!tool) {
    return integrationError("resolution_failed", `Could not resolve a Composio tool for ${app}:${capability}.`);
  }

  const additionalInput = withOperationDefaults(app, capability, {
    itemId: params.itemId,
    content: params.content,
    additionalInput: params.additionalInput,
  });

  const built = buildOperationInput(tool, app, descriptor.resourceType, capability, {
    ...params,
    additionalInput,
  });
  if (!built.ok) {
    console.warn(`[Integrations] Input build failed for ${app}:${capability} via ${tool.slug}: ${built.error}`);
    return integrationError("input_mapping_failed", built.error, { resolvedTool: tool.slug });
  }

  console.log(
    `[Integrations] Executing ${app}:${capability} via ${tool.slug} with fields: ${Object.keys(built.input).sort().join(", ") || "(none)"}`,
  );
  const result = await executeAction(tool.slug, account.id, built.input);
  if (!result.success) {
    console.warn(`[Integrations] ${app}:${capability} failed via ${tool.slug}: ${result.error || "unknown error"}`);
    return integrationError("provider_execution_failed", result.error || `Failed to execute ${tool.slug}.`, { resolvedTool: tool.slug });
  }

  return {
    success: true as const,
    resourceType: descriptor.resourceType,
    result: result.data,
    resolvedTool: tool.slug,
  };
}

async function buildCollectionResult(
  app: string,
  resourceType: IntegrationResourceType,
  operationResult: unknown,
  modeLimit?: number,
) {
  const items = extractCollection(operationResult)
    .map((item) => normalizeResource(app, resourceType, item))
    .filter((item): item is NonNullable<typeof item> => !!item);

  const budgeted = integrationRetrievalController.applyBudget(items, "compact", modeLimit);
  if (budgeted.downgraded) {
    console.warn(`[Integrations] Downgraded ${app} collection result to ${budgeted.mode} due to budget policy`);
  }
  recordGraphSyncRead(app, resourceType, budgeted.items.length);
  ingestNormalizedGraphSignals(app, resourceType, budgeted.items);
  return budgeted;
}

export const integrationService = {
  listProviders() {
    const connected = composioAccountsRepo.getConnectedToolkits();
    return providerMapper.listStatuses(connected);
  },

  async listItemsCompact(rawInput: unknown) {
    const input = CommonItemInput.parse(rawInput);
    const operation = await executeNormalizedOperation(input.app, "list", {
      limit: input.limit ?? 10,
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }

    const budgeted = await buildCollectionResult(input.app, operation.resourceType, operation.result, input.limit);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: budgeted.mode,
      downgraded: budgeted.downgraded,
      items: budgeted.items,
      resolvedTool: operation.resolvedTool,
      count: budgeted.items.length,
    };
  },

  async listItemsForSync(rawInput: unknown) {
    const input = SyncListInput.parse(rawInput);
    const descriptor = providerMapper.getDescriptor(input.app);
    const now = input.nowIso ? new Date(input.nowIso) : new Date();
    let capability: IntegrationCapability = "list";
    let query: string | undefined;
    let additionalInput = { ...(input.additionalInput ?? {}) };

    if (descriptor && input.windowDays) {
      const listTool = await resolveToolForOperation(input.app, descriptor.resourceType, "list");
      const searchTool = capabilityRegistry.supports(input.app, "search")
        ? await resolveToolForOperation(input.app, descriptor.resourceType, "search")
        : null;
      if (listTool) {
        const plan = buildSyncWindowPlan({
          app: input.app,
          resourceType: descriptor.resourceType,
          listTool,
          searchTool,
          windowDays: input.windowDays,
          now,
        });
        if (plan) {
          capability = plan.capability;
          query = plan.query;
          additionalInput = {
            ...additionalInput,
            ...(plan.additionalInput ?? {}),
          };
        }
      }
    }

    const operation = await executeNormalizedOperation(input.app, capability, {
      query,
      limit: input.limit ?? 10,
      cursor: input.cursor,
      additionalInput,
    });
    if (!operation.success) {
      return operation;
    }

    const budgeted = await buildCollectionResult(input.app, operation.resourceType, operation.result, input.limit);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: budgeted.mode,
      downgraded: budgeted.downgraded,
      items: budgeted.items,
      resolvedTool: operation.resolvedTool,
      count: budgeted.items.length,
      syncWindowDays: input.windowDays ?? null,
      resolvedCapability: capability,
      nextCursor: extractNextCursor(operation.result),
    };
  },

  async searchItemsCompact(rawInput: unknown) {
    const input = SearchItemInput.parse(rawInput);
    const operation = await executeNormalizedOperation(input.app, "search", {
      query: input.query,
      limit: input.limit ?? 10,
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }

    const budgeted = await buildCollectionResult(input.app, operation.resourceType, operation.result, input.limit);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: budgeted.mode,
      downgraded: budgeted.downgraded,
      items: budgeted.items,
      resolvedTool: operation.resolvedTool,
      count: budgeted.items.length,
    };
  },

  async getItemFull(rawInput: unknown) {
    const input = ReadItemInput.parse(rawInput);
    const operation = await executeNormalizedOperation(input.app, "read", {
      itemId: input.itemId,
      additionalInput: withReadDefaults(input.app, input.additionalInput),
    });
    if (!operation.success) {
      return operation;
    }

    const collection = extractCollection(operation.result);
    const baseFirst = collection[0] ?? operation.result;
    const first = input.app === "googlemeet"
      ? await enrichGoogleMeetReadResult(baseFirst, input.itemId, input.additionalInput)
      : baseFirst;
    const item = normalizeResource(input.app, operation.resourceType, first);
    if (item) {
      recordGraphSyncRead(input.app, operation.resourceType, 1);
      ingestNormalizedGraphSignals(input.app, operation.resourceType, [item]);
    }
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: "full" as IntegrationRetrievalMode,
      item,
      raw: first,
      resolvedTool: operation.resolvedTool,
    };
  },

  async getItemSummary(rawInput: unknown) {
    const input = ReadItemInput.parse(rawInput);
    const operation = await executeNormalizedOperation(input.app, "read", {
      itemId: input.itemId,
      additionalInput: withReadDefaults(input.app, input.additionalInput),
    });
    if (!operation.success) {
      return operation;
    }
    const collection = extractCollection(operation.result);
    const baseFirst = collection[0] ?? operation.result;
    const first = input.app === "googlemeet"
      ? await enrichGoogleMeetReadResult(baseFirst, input.itemId, input.additionalInput)
      : baseFirst;
    const normalized = normalizeResource(input.app, operation.resourceType, first);
    if (normalized) {
      recordGraphSyncRead(input.app, operation.resourceType, 1);
      ingestNormalizedGraphSignals(input.app, operation.resourceType, [normalized]);
    }
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: "summary" as IntegrationRetrievalMode,
      item: buildSummaryView(input.app, operation.resourceType, first),
      resolvedTool: operation.resolvedTool,
    };
  },

  async getItemDetailed(rawInput: unknown) {
    const input = ReadItemInput.parse(rawInput);
    const operation = await executeNormalizedOperation(input.app, "read", {
      itemId: input.itemId,
      additionalInput: withReadDefaults(input.app, input.additionalInput),
    });
    if (!operation.success) {
      return operation;
    }
    const collection = extractCollection(operation.result);
    const baseFirst = collection[0] ?? operation.result;
    const first = input.app === "googlemeet"
      ? await enrichGoogleMeetReadResult(baseFirst, input.itemId, input.additionalInput)
      : baseFirst;
    const normalized = normalizeResource(input.app, operation.resourceType, first);
    if (normalized) {
      recordGraphSyncRead(input.app, operation.resourceType, 1);
      ingestNormalizedGraphSignals(input.app, operation.resourceType, [normalized]);
    }
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: "detailed_structured" as IntegrationRetrievalMode,
      item: buildStructuredView(input.app, operation.resourceType, first),
      resolvedTool: operation.resolvedTool,
    };
  },

  async getItemSlices(rawInput: unknown) {
    const input = ReadItemInput.parse(rawInput);
    const operation = await executeNormalizedOperation(input.app, "read", {
      itemId: input.itemId,
      additionalInput: withReadDefaults(input.app, input.additionalInput),
    });
    if (!operation.success) {
      return operation;
    }
    const collection = extractCollection(operation.result);
    const baseFirst = collection[0] ?? operation.result;
    const first = input.app === "googlemeet"
      ? await enrichGoogleMeetReadResult(baseFirst, input.itemId, input.additionalInput)
      : baseFirst;
    const normalized = normalizeResource(input.app, operation.resourceType, first);
    if (normalized) {
      recordGraphSyncRead(input.app, operation.resourceType, 1);
      ingestNormalizedGraphSignals(input.app, operation.resourceType, [normalized]);
    }
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: "slices" as IntegrationRetrievalMode,
      item: buildSlicesView(input.app, operation.resourceType, first),
      resolvedTool: operation.resolvedTool,
    };
  },

  async replyToItem(rawInput: unknown) {
    const input = ReplyItemInput.parse(rawInput);
    const policy = enforceWritePolicy({ app: input.app, capability: "reply", confirmed: input.confirmed });
    if (!policy.ok) {
      return integrationError("write_confirmation_required", policy.error);
    }
    const idempotencyPayload = { app: input.app, capability: "reply", itemId: input.itemId, content: input.content };
    if (integrationIdempotencyRepo.wasRecentlySeen(idempotencyPayload)) {
      return integrationError("duplicate_write_prevented", `Duplicate reply prevented for ${input.app}:${input.itemId}.`);
    }
    const operation = await executeNormalizedOperation(input.app, "reply", {
      itemId: input.itemId,
      content: input.content,
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }
    integrationIdempotencyRepo.record(idempotencyPayload);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      action: "reply",
      resolvedTool: operation.resolvedTool,
      result: operation.result,
    };
  },

  async createItem(rawInput: unknown) {
    const input = CreateItemInput.parse(rawInput);
    const policy = enforceWritePolicy({ app: input.app, capability: "create", confirmed: input.confirmed });
    if (!policy.ok) {
      return integrationError("write_confirmation_required", policy.error);
    }
    const idempotencyPayload = { app: input.app, capability: "create", title: input.title ?? "", content: input.content ?? "" };
    if (integrationIdempotencyRepo.wasRecentlySeen(idempotencyPayload)) {
      return integrationError("duplicate_write_prevented", `Duplicate create prevented for ${input.app}.`);
    }
    const operation = await executeNormalizedOperation(input.app, "create", {
      title: input.title,
      content: input.content,
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }
    integrationIdempotencyRepo.record(idempotencyPayload);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      action: "create",
      resolvedTool: operation.resolvedTool,
      result: operation.result,
    };
  },

  async updateItem(rawInput: unknown) {
    const input = UpdateItemInput.parse(rawInput);
    const policy = enforceWritePolicy({ app: input.app, capability: "update", confirmed: input.confirmed });
    if (!policy.ok) {
      return integrationError("write_confirmation_required", policy.error);
    }
    const idempotencyPayload = { app: input.app, capability: "update", itemId: input.itemId, title: input.title ?? "", content: input.content ?? "" };
    if (integrationIdempotencyRepo.wasRecentlySeen(idempotencyPayload)) {
      return integrationError("duplicate_write_prevented", `Duplicate update prevented for ${input.app}:${input.itemId}.`);
    }
    const operation = await executeNormalizedOperation(input.app, "update", {
      itemId: input.itemId,
      title: input.title,
      content: input.content,
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }
    integrationIdempotencyRepo.record(idempotencyPayload);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      action: "update",
      resolvedTool: operation.resolvedTool,
      result: operation.result,
    };
  },

  async commentOnItem(rawInput: unknown) {
    const input = CommentItemInput.parse(rawInput);
    const policy = enforceWritePolicy({ app: input.app, capability: "comment", confirmed: input.confirmed });
    if (!policy.ok) {
      return integrationError("write_confirmation_required", policy.error);
    }
    const idempotencyPayload = { app: input.app, capability: "comment", itemId: input.itemId, content: input.content };
    if (integrationIdempotencyRepo.wasRecentlySeen(idempotencyPayload)) {
      return integrationError("duplicate_write_prevented", `Duplicate comment prevented for ${input.app}:${input.itemId}.`);
    }
    const operation = await executeNormalizedOperation(input.app, "comment", {
      itemId: input.itemId,
      content: input.content,
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }
    integrationIdempotencyRepo.record(idempotencyPayload);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      action: "comment",
      resolvedTool: operation.resolvedTool,
      result: operation.result,
    };
  },
};
