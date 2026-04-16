import { z } from "zod";
import { composioAccountsRepo } from "../../../composio/repo.js";
import { executeAction as executeComposioAction, isConfigured as isComposioConfigured } from "../../../composio/client.js";
import { integrationService } from "../../../integrations/service.js";

export const integrationTools = {
  "composio-checkConnection": {
    description: "Check whether a connected app is available for normalized integration operations.",
    inputSchema: z.object({
      app: z.string().describe('App name to check (for example "slack", "gmail", "jira")'),
    }),
    execute: async ({ app }: { app: string }) => {
      if (!isComposioConfigured()) {
        return {
          connected: false,
          normalizedSupported: false,
          error: "Composio is not configured. Please set up your Composio API key first.",
        };
      }
      const account = composioAccountsRepo.getAccount(app);
      if (!account || account.status !== "ACTIVE") {
        return {
          connected: false,
          normalizedSupported: false,
          error: `${app} is not connected. Please connect ${app} from settings first.`,
        };
      }
      const status = integrationService.listProviders().find((provider) => provider.app === app);
      return {
        connected: true,
        normalizedSupported: status?.normalizedSupported ?? false,
        normalizedSupport: status?.normalizedSupport ?? "none",
        wave: status?.wave,
        app,
        accountId: account.id,
        resourceType: status?.resourceType,
        capabilities: status?.capabilities ?? [],
        note: status?.note,
      };
    },
  },

  "integration-listProviders": {
    description: "List connected integrations with their normalized support level, resource type, and supported capabilities. Some connected apps may be available in Composio but not yet supported by normalized tools.",
    inputSchema: z.object({}).optional(),
    execute: async () => {
      const providers = integrationService.listProviders();
      return {
        success: true,
        providers,
        count: providers.length,
        normalizedSupportedCount: providers.filter((provider) => provider.normalizedSupported).length,
        fullSupportCount: providers.filter((provider) => provider.normalizedSupport === "full").length,
        readOnlySupportCount: providers.filter((provider) => provider.normalizedSupport === "read_only").length,
      };
    },
  },

  "integration-listItemsCompact": {
    description: "List recent items from a connected integration using normalized schemas. Returns compact items only, never raw full payloads.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "gmail", "slack", "notion", or "jira"'),
      limit: z.number().int().positive().max(20).optional(),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific hints only when the integration needs extra fields."),
    }),
    execute: async (input: unknown) => integrationService.listItemsCompact(input),
  },

  "integration-searchItemsCompact": {
    description: "Search connected integrations using normalized schemas. Use this for messages, documents, tickets, events, or files without exposing raw Composio tool slugs.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "gmail", "slack", "notion", or "jira"'),
      query: z.string().describe("Search query"),
      limit: z.number().int().positive().max(20).optional(),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific hints only when the integration needs extra fields."),
    }),
    execute: async (input: unknown) => integrationService.searchItemsCompact(input),
  },

  "integration-getItemFull": {
    description: "Fetch one full integration item by ID after selecting it from a compact list or search result. Full reads must be explicit.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "gmail", "slack", "notion", or "jira"'),
      itemId: z.string().describe("Item ID returned by integration-listItemsCompact or integration-searchItemsCompact"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific hints only when the integration needs extra fields."),
    }),
    execute: async (input: unknown) => integrationService.getItemFull(input),
  },

  "integration-getItemSummary": {
    description: "Fetch a concise summary of one integration item by ID. Use this before full reads when you need a lightweight overview.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "gmail", "slack", "notion", or "jira"'),
      itemId: z.string().describe("Item ID returned by integration-listItemsCompact or integration-searchItemsCompact"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific hints only when the integration needs extra fields."),
    }),
    execute: async (input: unknown) => integrationService.getItemSummary(input),
  },

  "integration-getItemDetailed": {
    description: "Fetch one item as a detailed structured payload. Prefer this over full raw reads whenever possible.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "gmail", "slack", "notion", or "jira"'),
      itemId: z.string().describe("Item ID returned by integration-listItemsCompact or integration-searchItemsCompact"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific hints only when the integration needs extra fields."),
    }),
    execute: async (input: unknown) => integrationService.getItemDetailed(input),
  },

  "integration-getItemSlices": {
    description: "Fetch one item as a set of content slices. Use this when the body may be too large for a full read but snippets are insufficient.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "gmail", "slack", "notion", or "jira"'),
      itemId: z.string().describe("Item ID returned by integration-listItemsCompact or integration-searchItemsCompact"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific hints only when the integration needs extra fields."),
    }),
    execute: async (input: unknown) => integrationService.getItemSlices(input),
  },

  "integration-replyToItem": {
    description: "Reply to a message or thread using a normalized integration write path. Use only after the user has reviewed and approved the draft.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "gmail" or "slack"'),
      itemId: z.string().describe("Item ID returned by normalized integration read/search tools"),
      content: z.string().describe("Reply content to send"),
      confirmed: z.boolean().describe("Must be true only after the user has explicitly approved the reply"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific fields only when required."),
    }),
    execute: async (input: unknown) => integrationService.replyToItem(input),
  },

  "integration-createItem": {
    description: "Create a document, ticket, or event using the normalized integration write path.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "notion", "jira", or "googlecalendar"'),
      title: z.string().optional().describe("Title or subject for the new item"),
      content: z.string().optional().describe("Body, description, or main content for the new item"),
      confirmed: z.boolean().describe("Must be true only after the user has explicitly approved the create action"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific fields only when required."),
    }),
    execute: async (input: unknown) => integrationService.createItem(input),
  },

  "integration-updateItem": {
    description: "Update an existing document, ticket, or event using the normalized integration write path.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "notion", "jira", or "googlecalendar"'),
      itemId: z.string().describe("Item ID returned by normalized integration read/search tools"),
      title: z.string().optional().describe("Updated title or subject"),
      content: z.string().optional().describe("Updated body or description"),
      confirmed: z.boolean().describe("Must be true only after the user has explicitly approved the update"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific fields only when required."),
    }),
    execute: async (input: unknown) => integrationService.updateItem(input),
  },

  "integration-commentOnItem": {
    description: "Add a comment to a ticket-style item using the normalized integration write path.",
    inputSchema: z.object({
      app: z.string().describe('Connected app name such as "jira" or "linear"'),
      itemId: z.string().describe("Item ID returned by normalized integration read/search tools"),
      content: z.string().describe("Comment body"),
      confirmed: z.boolean().describe("Must be true only after the user has explicitly approved the comment"),
      additionalInput: z.record(z.string(), z.unknown()).optional().describe("Optional provider-specific fields only when required."),
    }),
    execute: async (input: unknown) => integrationService.commentOnItem(input),
  },

  "composio-executeAction": {
    description: "Advanced fallback only. Execute a specific raw Composio action slug when normalized integration tools are insufficient. Avoid this unless a skill explicitly requires it.",
    inputSchema: z.object({
      app: z.string().describe('App name (e.g., "slack", "gmail", "github")'),
      toolSlug: z.string().describe("Exact Composio tool slug"),
      input: z.record(z.string(), z.unknown()).describe("Raw action input"),
    }),
    execute: async ({ app, toolSlug, input }: { app: string; toolSlug: string; input: Record<string, unknown> }) => {
      const account = composioAccountsRepo.getAccount(app);
      if (!account || account.status !== "ACTIVE") {
        return {
          success: false,
          error: `${app} is not connected. Use composio-checkConnection to verify connection status.`,
        };
      }

      try {
        const result = await executeComposioAction(toolSlug, account.id, input);
        return {
          success: true,
          app,
          toolSlug,
          result,
          warning: "Raw Composio fallback used. Prefer normalized integration tools whenever possible.",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },
};
