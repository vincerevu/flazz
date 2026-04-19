import type { IntegrationCapability, IntegrationResourceType } from "./types.js";
import type { ResolvedTool } from "./action-resolver.js";
import { getFieldAliases } from "./family-field-aliases.js";

type SyncWindowPlan = {
  capability: Extract<IntegrationCapability, "list" | "search">;
  additionalInput?: Record<string, unknown>;
  query?: string;
  strategy: "provider_fields" | "query_on_list" | "query_on_search";
};

type SyncWindowPlanInput = {
  app: string;
  resourceType: IntegrationResourceType;
  listTool: ResolvedTool;
  searchTool?: ResolvedTool | null;
  windowDays: number;
  now: Date;
};

const RANGE_START_ALIASES = [
  "since",
  "updated_after",
  "updatedAfter",
  "modified_after",
  "modifiedAfter",
  "created_after",
  "createdAfter",
  "start_date",
  "startDate",
  "start_time",
  "startTime",
  "timeMin",
  "from",
  "from_date",
  "fromDate",
  "date_from",
  "after",
  "after_date",
  "afterDate",
  "min_last_modified_time",
  "lastmodifiedstart",
];

const RANGE_END_ALIASES = [
  "until",
  "updated_before",
  "updatedBefore",
  "modified_before",
  "modifiedBefore",
  "created_before",
  "createdBefore",
  "end_date",
  "endDate",
  "end_time",
  "endTime",
  "timeMax",
  "to",
  "to_date",
  "toDate",
  "date_to",
  "before",
  "before_date",
  "beforeDate",
  "max_last_modified_time",
  "lastmodifiedend",
];

const ISO_DATE_ONLY = /\.\d{3}Z$/;

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toGmailDate(value: Date) {
  return toDateOnly(value).replace(/-/g, "/");
}

function toDateTimeLocal(value: Date) {
  return value.toISOString().replace(ISO_DATE_ONLY, "Z");
}

function findProperty(tool: ResolvedTool, aliases: string[]) {
  return aliases.find((alias) => alias in tool.inputParameters.properties);
}

function buildRangeInput(tool: ResolvedTool, start: Date, end: Date) {
  const additionalInput: Record<string, unknown> = {};

  const startKey = findProperty(tool, RANGE_START_ALIASES);
  if (startKey) {
    additionalInput[startKey] = startKey.toLowerCase().includes("date") && !startKey.toLowerCase().includes("time")
      ? toDateOnly(start)
      : toDateTimeLocal(start);
  }

  const endKey = findProperty(tool, RANGE_END_ALIASES);
  if (endKey) {
    additionalInput[endKey] = endKey.toLowerCase().includes("date") && !endKey.toLowerCase().includes("time")
      ? toDateOnly(end)
      : toDateTimeLocal(end);
  }

  return Object.keys(additionalInput).length ? additionalInput : null;
}

function buildWindowQuery(app: string, resourceType: IntegrationResourceType, start: Date, end: Date) {
  const startDate = toDateOnly(start);
  const endDate = toDateOnly(end);
  const gmailStart = toGmailDate(start);
  const gmailEnd = toGmailDate(end);

  switch (app) {
    case "github":
      return `updated:>=${startDate} sort:updated-desc`;
    case "jira":
      return `updated >= "${startDate}" ORDER BY updated DESC`;
    case "linear":
      return `updated after ${startDate}`;
    case "gmail":
      return `after:${gmailStart} before:${gmailEnd}`;
    case "outlook":
      return `received>=${startDate} AND received<=${endDate}`;
    case "googlecalendar":
      return `events between ${startDate} and ${endDate}`;
    case "notion":
    case "googledocs":
    case "confluence":
      return `updated after ${startDate}`;
    case "googledrive":
    case "dropbox":
    case "box":
      return `modified after ${startDate}`;
    case "linkedin":
    case "hubspot":
    case "salesforce":
    case "pipedrive":
      return `updated after ${startDate}`;
    case "googlesheets":
    case "airtable":
      return `updated after ${startDate}`;
    default:
      switch (resourceType) {
        case "message":
          return `after ${startDate}`;
        case "document":
          return `updated after ${startDate}`;
        case "ticket":
          return `updated after ${startDate}`;
        case "event":
          return `between ${startDate} and ${endDate}`;
        case "file":
          return `modified after ${startDate}`;
        case "record":
          return `updated after ${startDate}`;
        case "spreadsheet":
          return `updated after ${startDate}`;
        default:
          return `updated after ${startDate}`;
      }
  }
}

function buildQueryPlan(
  tool: ResolvedTool,
  app: string,
  resourceType: IntegrationResourceType,
  start: Date,
  end: Date,
  capability: "list" | "search",
): SyncWindowPlan | null {
  const queryKey = findProperty(tool, getFieldAliases(app, resourceType, "query", capability));
  if (!queryKey) return null;
  return {
    capability,
    additionalInput: { [queryKey]: buildWindowQuery(app, resourceType, start, end) },
    query: buildWindowQuery(app, resourceType, start, end),
    strategy: capability === "list" ? "query_on_list" : "query_on_search",
  };
}

export function buildSyncWindowPlan(input: SyncWindowPlanInput): SyncWindowPlan | null {
  const end = input.now;
  const start = new Date(end.getTime() - input.windowDays * 24 * 60 * 60 * 1000);

  const providerFields = buildRangeInput(input.listTool, start, end);
  if (providerFields) {
    return {
      capability: "list",
      additionalInput: providerFields,
      strategy: "provider_fields",
    };
  }

  const listQueryPlan = buildQueryPlan(input.listTool, input.app, input.resourceType, start, end, "list");
  if (listQueryPlan) {
    return listQueryPlan;
  }

  if (input.searchTool) {
    const searchProviderFields = buildRangeInput(input.searchTool, start, end);
    if (searchProviderFields) {
      return {
        capability: "search",
        additionalInput: searchProviderFields,
        strategy: "provider_fields",
      };
    }

    const searchQueryPlan = buildQueryPlan(input.searchTool, input.app, input.resourceType, start, end, "search");
    if (searchQueryPlan) {
      return searchQueryPlan;
    }
  }

  return null;
}
