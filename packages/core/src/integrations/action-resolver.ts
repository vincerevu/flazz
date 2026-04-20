import { listToolkitTools } from "../composio/client.js";
import { providerMapper } from "../di/container.js";
import type { IntegrationCapability, IntegrationResourceType } from "./types.js";

export type ResolvedTool = {
  slug: string;
  name: string;
  description: string;
  inputParameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

const resolvedToolCache = new Map<string, ResolvedTool | null>();

const OPERATION_QUERIES: Record<IntegrationResourceType, Partial<Record<IntegrationCapability, string[]>>> = {
  message: {
    list: ["recent messages", "fetch emails", "conversation history", "recent threads"],
    search: ["search messages", "search emails", "find message", "message search"],
    read: ["get message", "read message", "fetch message", "get email"],
    reply: ["reply to message", "reply email", "send message"],
  },
  document: {
    list: ["list documents", "list pages", "list docs"],
    search: ["search documents", "find document", "query docs"],
    read: ["get document", "read page", "document content"],
    create: ["create document", "create page"],
    update: ["update document", "update page"],
  },
  ticket: {
    list: ["list issues", "list tickets", "assigned issues"],
    search: ["search issues", "find ticket", "query issues"],
    read: ["get issue", "read ticket", "issue details"],
    create: ["create issue", "create ticket"],
    update: ["update issue", "update ticket"],
    comment: ["comment issue", "add comment ticket"],
  },
  event: {
    list: ["list events", "calendar events", "today events"],
    read: ["get event", "event details", "read calendar event"],
    create: ["create event", "schedule event"],
    update: ["update event", "reschedule event"],
  },
  file: {
    list: ["list files", "recent files"],
    search: ["search files", "find file"],
    read: ["get file", "read file", "download file"],
  },
  record: {
    list: ["list records"],
    search: ["search records", "find record"],
    read: ["get record", "record details"],
    update: ["update record"],
  },
  code: {
    search: ["search code", "find file"],
    read: ["read file", "get file content"],
  },
  spreadsheet: {
    list: ["list rows", "sheet rows"],
    search: ["query rows", "search rows"],
    read: ["get row", "read sheet"],
  },
};

const KEYWORD_HINTS: Record<IntegrationCapability, string[]> = {
  list: ["list", "fetch", "recent", "all"],
  search: ["search", "find", "query"],
  read: ["get", "read", "fetch", "detail"],
  create: ["create", "new", "add"],
  update: ["update", "edit", "modify"],
  reply: ["reply", "respond", "send"],
  comment: ["comment", "note"],
};

function scoreTool(tool: ResolvedTool, capability: IntegrationCapability, resourceType: IntegrationResourceType): number {
  const text = `${tool.slug} ${tool.name} ${tool.description}`.toLowerCase();
  let score = 0;

  for (const hint of KEYWORD_HINTS[capability] ?? []) {
    if (text.includes(hint)) score += 3;
  }

  if (text.includes(resourceType)) score += 3;
  if (resourceType === "message" && /mail|message|thread|conversation/.test(text)) score += 3;
  if (resourceType === "document" && /doc|page|notion|wiki|content/.test(text)) score += 3;
  if (resourceType === "ticket" && /issue|ticket|task|linear|jira/.test(text)) score += 3;
  if (resourceType === "event" && /event|calendar|meeting/.test(text)) score += 3;
  if (resourceType === "file" && /file|drive|attachment/.test(text)) score += 3;
  return score;
}

export function selectBestTool(
  tools: ResolvedTool[],
  capability: IntegrationCapability,
  resourceType: IntegrationResourceType,
): ResolvedTool | null {
  const deduped = Array.from(new Map(tools.map((tool) => [tool.slug, tool])).values());
  deduped.sort((a, b) => scoreTool(b, capability, resourceType) - scoreTool(a, capability, resourceType));
  return deduped[0] ?? null;
}

export async function resolveToolForOperation(
  app: string,
  resourceType: IntegrationResourceType,
  capability: IntegrationCapability,
  preferredActionOverride?: string,
): Promise<ResolvedTool | null> {
  const cacheKey = `${app}:${resourceType}:${capability}`;
  if (!preferredActionOverride && resolvedToolCache.has(cacheKey)) {
    return resolvedToolCache.get(cacheKey) ?? null;
  }
  const preferredActions = preferredActionOverride
    ? [preferredActionOverride]
    : providerMapper.getPreferredActions(app)[capability] ?? [];

  if (preferredActions.length > 0) {
    for (const preferredAction of preferredActions) {
      const searched = await listToolkitTools(app, preferredAction);
      const preferred = searched.items.find((tool) => tool.slug === preferredAction);
      if (preferred) {
        console.log(`[Integrations] Resolved ${app}:${capability} via preferred action map -> ${preferred.slug}`);
        if (!preferredActionOverride) {
          resolvedToolCache.set(cacheKey, preferred);
        }
        return preferred;
      }
    }
  }

  const queries = OPERATION_QUERIES[resourceType]?.[capability] ?? [];

  const candidates: ResolvedTool[] = [];
  for (const query of queries) {
    const result = await listToolkitTools(app, query);
    candidates.push(...result.items);
    if (candidates.length >= 12) {
      break;
    }
  }

  if (!candidates.length) {
    const fallback = await listToolkitTools(app, null);
    candidates.push(...fallback.items);
  }
  const resolved = selectBestTool(candidates, capability, resourceType);
  if (resolved) {
    console.log(`[Integrations] Resolved ${app}:${capability} heuristically -> ${resolved.slug}`);
  } else {
    console.warn(`[Integrations] Failed to resolve ${app}:${capability}`);
  }
  if (!preferredActionOverride) {
    resolvedToolCache.set(cacheKey, resolved ?? null);
  }
  return resolved;
}
