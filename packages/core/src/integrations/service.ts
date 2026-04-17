import { z } from "zod";
import { composioAccountsRepo } from "../composio/repo.js";
import { executeAction, isConfigured } from "../composio/client.js";
import { capabilityRegistry, integrationIdempotencyRepo, integrationRetrievalController, providerMapper } from "../di/container.js";
import { buildSlicesView, buildStructuredView, buildSummaryView, normalizeResource } from "./provider-transformers.js";
import { resolveToolForOperation, type ResolvedTool } from "./action-resolver.js";
import type { IntegrationCapability, IntegrationResourceType, IntegrationRetrievalMode } from "./types.js";
import { enforceWritePolicy } from "./write-policy.js";
import { integrationError, type IntegrationErrorResult } from "./errors.js";
import { getFieldAliases } from "./family-field-aliases.js";

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
  additionalInput: z.record(z.string(), z.unknown()).optional(),
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

function getMissingRequiredFields(tool: ResolvedTool, input: Record<string, unknown>) {
  const required = tool.inputParameters.required ?? [];
  return required.filter((field) => !(field in input));
}

function buildOperationInput(
  tool: ResolvedTool,
  app: string,
  resourceType: IntegrationResourceType,
  operation: IntegrationCapability,
  params: { query?: string; limit?: number; itemId?: ItemId; title?: string; content?: string; additionalInput?: Record<string, unknown> },
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

async function executeNormalizedOperation(
  app: string,
  capability: IntegrationCapability,
  params: { query?: string; limit?: number; itemId?: string; title?: string; content?: string; additionalInput?: Record<string, unknown> },
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

  const built = buildOperationInput(tool, app, descriptor.resourceType, capability, params);
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

    const items = extractCollection(operation.result)
      .map((item) => normalizeResource(input.app, operation.resourceType, item))
      .filter((item): item is NonNullable<typeof item> => !!item);

    const budgeted = integrationRetrievalController.applyBudget(items, "compact", input.limit);
    if (budgeted.downgraded) {
      console.warn(`[Integrations] Downgraded ${input.app}:list to ${budgeted.mode} due to budget policy`);
    }
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

    const items = extractCollection(operation.result)
      .map((item) => normalizeResource(input.app, operation.resourceType, item))
      .filter((item): item is NonNullable<typeof item> => !!item);

    const budgeted = integrationRetrievalController.applyBudget(items, "compact", input.limit);
    if (budgeted.downgraded) {
      console.warn(`[Integrations] Downgraded ${input.app}:search to ${budgeted.mode} due to budget policy`);
    }
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
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }

    const collection = extractCollection(operation.result);
    const first = collection[0] ?? operation.result;
    const item = normalizeResource(input.app, operation.resourceType, first);
    return {
      success: true,
      app: input.app,
      resourceType: operation.resourceType,
      mode: "full" as IntegrationRetrievalMode,
      item,
      raw: operation.result,
      resolvedTool: operation.resolvedTool,
    };
  },

  async getItemSummary(rawInput: unknown) {
    const input = ReadItemInput.parse(rawInput);
    const operation = await executeNormalizedOperation(input.app, "read", {
      itemId: input.itemId,
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }
    const collection = extractCollection(operation.result);
    const first = collection[0] ?? operation.result;
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
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }
    const collection = extractCollection(operation.result);
    const first = collection[0] ?? operation.result;
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
      additionalInput: input.additionalInput,
    });
    if (!operation.success) {
      return operation;
    }
    const collection = extractCollection(operation.result);
    const first = collection[0] ?? operation.result;
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
