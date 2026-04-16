import type { IntegrationCapability, IntegrationResourceType } from "./types.js";

export type ProviderCatalogEntry = {
  app: string;
  resourceType?: IntegrationResourceType;
  capabilities: IntegrationCapability[];
  normalizedSupport: "none" | "read_only" | "full";
  wave: "p0" | "p1" | "p2";
  note?: string;
};

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  { app: "gmail", resourceType: "message", capabilities: ["list", "search", "read", "reply"], normalizedSupport: "full", wave: "p0" },
  { app: "outlook", resourceType: "message", capabilities: ["list", "search", "read", "reply"], normalizedSupport: "full", wave: "p0" },
  { app: "slack", resourceType: "message", capabilities: ["list", "search", "read", "reply"], normalizedSupport: "full", wave: "p0" },
  { app: "teams", resourceType: "message", capabilities: ["list", "search", "read", "reply"], normalizedSupport: "read_only", wave: "p0" },
  { app: "discord", resourceType: "message", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p0" },
  { app: "zendesk", resourceType: "message", capabilities: ["list", "search", "read", "reply"], normalizedSupport: "read_only", wave: "p0" },
  { app: "intercom", resourceType: "message", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p1" },
  { app: "front", resourceType: "message", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "helpscout", resourceType: "message", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "basecamp", resourceType: "message", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },

  { app: "notion", resourceType: "document", capabilities: ["list", "search", "read", "create", "update"], normalizedSupport: "full", wave: "p0" },
  { app: "googledocs", resourceType: "document", capabilities: ["list", "search", "read", "create", "update"], normalizedSupport: "full", wave: "p0" },
  { app: "confluence", resourceType: "document", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p0" },
  { app: "coda", resourceType: "document", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p1" },
  { app: "dropboxpaper", resourceType: "document", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "clickupdocs", resourceType: "document", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "miro", resourceType: "document", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "figma", resourceType: "document", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },

  { app: "jira", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"], normalizedSupport: "full", wave: "p0" },
  { app: "linear", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"], normalizedSupport: "full", wave: "p0" },
  { app: "github", resourceType: "ticket", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p0" },
  { app: "asana", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"], normalizedSupport: "read_only", wave: "p1" },
  { app: "clickup", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"], normalizedSupport: "read_only", wave: "p1" },
  { app: "trello", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"], normalizedSupport: "read_only", wave: "p1" },
  { app: "monday", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update"], normalizedSupport: "read_only", wave: "p1" },
  { app: "shortcut", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"], normalizedSupport: "read_only", wave: "p2" },
  { app: "wrike", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"], normalizedSupport: "read_only", wave: "p2" },
  { app: "freshdesk", resourceType: "ticket", capabilities: ["list", "search", "read", "comment"], normalizedSupport: "read_only", wave: "p1" },
  { app: "servicenow", resourceType: "ticket", capabilities: ["list", "search", "read", "comment", "update"], normalizedSupport: "read_only", wave: "p1" },
  { app: "sentry", resourceType: "ticket", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "pagerduty", resourceType: "ticket", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },

  { app: "googlecalendar", resourceType: "event", capabilities: ["list", "read", "create", "update"], normalizedSupport: "full", wave: "p0" },
  { app: "outlookcalendar", resourceType: "event", capabilities: ["list", "read", "create", "update"], normalizedSupport: "read_only", wave: "p0" },
  { app: "calendly", resourceType: "event", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "zoom", resourceType: "event", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },

  { app: "googledrive", resourceType: "file", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p0" },
  { app: "dropbox", resourceType: "file", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p0" },
  { app: "onedrive", resourceType: "file", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p0" },
  { app: "box", resourceType: "file", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "awss3", resourceType: "file", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },

  { app: "hubspot", resourceType: "record", capabilities: ["list", "search", "read", "create", "update"], normalizedSupport: "read_only", wave: "p1" },
  { app: "salesforce", resourceType: "record", capabilities: ["list", "search", "read", "create", "update"], normalizedSupport: "read_only", wave: "p1" },
  { app: "pipedrive", resourceType: "record", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p1" },
  { app: "zohocrm", resourceType: "record", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p2" },
  { app: "copper", resourceType: "record", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p2" },
  { app: "freshsales", resourceType: "record", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p2" },
  { app: "keap", resourceType: "record", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p2" },
  { app: "mailchimp", resourceType: "record", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "brevo", resourceType: "record", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "bigquery", resourceType: "record", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "snowflake", resourceType: "record", capabilities: ["list", "search", "read"], normalizedSupport: "read_only", wave: "p2" },
  { app: "postgres", resourceType: "record", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p2" },

  { app: "gitlab", resourceType: "code", capabilities: ["list", "search", "read", "comment"], normalizedSupport: "read_only", wave: "p2" },
  { app: "bitbucket", resourceType: "code", capabilities: ["list", "search", "read", "comment"], normalizedSupport: "read_only", wave: "p2" },

  { app: "googlesheets", resourceType: "spreadsheet", capabilities: ["list", "search", "read", "create", "update"], normalizedSupport: "read_only", wave: "p1" },
  { app: "airtable", resourceType: "spreadsheet", capabilities: ["list", "search", "read", "create", "update"], normalizedSupport: "read_only", wave: "p1" },
  { app: "excel", resourceType: "spreadsheet", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p2" },
  { app: "smartsheet", resourceType: "spreadsheet", capabilities: ["list", "search", "read", "update"], normalizedSupport: "read_only", wave: "p2" },
];

export function getProviderCatalogEntry(app: string) {
  return PROVIDER_CATALOG.find((entry) => entry.app === app) ?? null;
}
