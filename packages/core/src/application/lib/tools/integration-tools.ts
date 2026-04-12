import { z } from "zod";
import { composioAccountsRepo } from "../../../composio/repo.js";
import { executeAction as executeComposioAction, isConfigured as isComposioConfigured, listToolkitTools } from "../../../composio/client.js";
export const integrationTools = {
    'composio-checkConnection': {
        description: 'Check if a Composio app (slack, gmail, github, etc.) is connected and ready to use. Use this before other operations with that app.',
        inputSchema: z.object({
            app: z.string().describe('App name to check (e.g., "slack", "gmail", "github")'),
        }),
        execute: async ({ app }: { app: string }) => {
            if (!isComposioConfigured()) {
                return {
                    connected: false,
                    error: 'Composio is not configured. Please set up your Composio API key first.',
                };
            }
            const account = composioAccountsRepo.getAccount(app);
            if (!account || account.status !== 'ACTIVE') {
                return {
                    connected: false,
                    error: `${app} is not connected. Please connect ${app} from the settings.`,
                };
            }
            return {
                connected: true,
                app,
                accountId: account.id,
            };
        },
    },

    'composio-listTools': {
        description: 'List available tools from any Composio app (slack, gmail, github, etc.). Use this to discover available actions and their tool slugs before executing. IMPORTANT: Always call this first to understand what tools are available and their required parameters.',
        inputSchema: z.object({
            app: z.string().describe('App name to list tools from (e.g., "slack", "gmail", "github")'),
            search: z.string().optional().describe('Optional search query to filter tools (e.g., "message", "channel", "user", "email", "issue")'),
        }),
        execute: async ({ app, search }: { app: string; search?: string }) => {
            if (!isComposioConfigured()) {
                return { success: false, error: 'Composio is not configured' };
            }

            try {
                const result = await listToolkitTools(app, search || null);
                return {
                    success: true,
                    app,
                    tools: result.items,
                    count: result.items.length,
                    hint: 'Each tool has a slug (e.g., "SLACK_SEND_MESSAGE") and inputSchema. Use composio-executeAction with the exact slug and required parameters.',
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'composio-executeAction': {
        description: 'Execute any action from any Composio app (slack, gmail, github, etc.). IMPORTANT: Always use composio-listTools first to discover the correct tool slug and required parameters. Pass the exact slug and all required input parameters.',
        inputSchema: z.object({
            app: z.string().describe('App name (e.g., "slack", "gmail", "github")'),
            toolSlug: z.string().describe('The exact Composio tool slug from composio-listTools (e.g., "SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL", "GITHUB_CREATE_ISSUE")'),
            input: z.record(z.string(), z.unknown()).describe('Input parameters for the tool. MUST match the tool\'s inputSchema from composio-listTools. Include all required fields.'),
        }),
        execute: async ({ app, toolSlug, input }: { app: string; toolSlug: string; input: Record<string, unknown> }) => {
            const account = composioAccountsRepo.getAccount(app);
            if (!account || account.status !== 'ACTIVE') {
                return { 
                    success: false, 
                    error: `${app} is not connected. Use composio-checkConnection to verify connection status.` 
                };
            }

            try {
                const result = await executeComposioAction(toolSlug, account.id, input);
                return {
                    success: true,
                    app,
                    toolSlug,
                    result,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    hint: 'Use composio-listTools to verify the tool slug and check required parameters in the inputSchema.',
                };
            }
        },
    },
};
