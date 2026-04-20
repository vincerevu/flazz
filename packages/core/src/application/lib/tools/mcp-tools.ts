import { z } from "zod";
import { executeTool, listServers, listTools } from "../../../mcp/mcp.js";
import container from "../../../di/container.js";
import { IMcpConfigRepo } from "../../../mcp/repo.js";
import { McpServerDefinition } from "@flazz/shared";

const MAX_MCP_RESULT_STRING_CHARS = 4_000;
const MAX_MCP_RESULT_ARRAY_ITEMS = 8;
const MAX_MCP_RESULT_OBJECT_KEYS = 24;
const MAX_MCP_RESULT_JSON_CHARS = 12_000;

function truncateString(value: string): string {
    if (value.length <= MAX_MCP_RESULT_STRING_CHARS) {
        return value;
    }

    return `${value.slice(0, MAX_MCP_RESULT_STRING_CHARS)}\n...[truncated]`;
}

function summarizeLargeValue(value: unknown, depth = 0): unknown {
    if (value == null) {
        return value;
    }

    if (typeof value === "string") {
        return truncateString(value);
    }

    if (typeof value !== "object") {
        return value;
    }

    if (depth >= 4) {
        return "[truncated nested value]";
    }

    if (Array.isArray(value)) {
        const items = value.slice(0, MAX_MCP_RESULT_ARRAY_ITEMS).map((item) =>
            summarizeLargeValue(item, depth + 1)
        );

        if (value.length > MAX_MCP_RESULT_ARRAY_ITEMS) {
            items.push(`[${value.length - MAX_MCP_RESULT_ARRAY_ITEMS} more items truncated]`);
        }

        return items;
    }

    const entries = Object.entries(value);
    const limitedEntries = entries.slice(0, MAX_MCP_RESULT_OBJECT_KEYS);
    const summarized = Object.fromEntries(
        limitedEntries.map(([key, entryValue]) => [key, summarizeLargeValue(entryValue, depth + 1)])
    );

    if (entries.length > MAX_MCP_RESULT_OBJECT_KEYS) {
        summarized.__truncatedKeys = entries.length - MAX_MCP_RESULT_OBJECT_KEYS;
    }

    return summarized;
}

function safeJsonLength(value: unknown): number {
    try {
        return JSON.stringify(value).length;
    } catch {
        return Number.MAX_SAFE_INTEGER;
    }
}

function compressMcpToolResult(result: unknown): { payload: unknown; truncated: boolean } {
    if (safeJsonLength(result) <= MAX_MCP_RESULT_JSON_CHARS) {
        return { payload: result, truncated: false };
    }

    const summarized = summarizeLargeValue(result);
    if (safeJsonLength(summarized) <= MAX_MCP_RESULT_JSON_CHARS) {
        return { payload: summarized, truncated: true };
    }

    return {
        payload: {
            summary: "Large MCP tool result omitted from conversation history.",
            preview: truncateString(
                (() => {
                    try {
                        return JSON.stringify(summarized);
                    } catch {
                        return String(summarized);
                    }
                })()
            ),
        },
        truncated: true,
    };
}

export const mcpTools = {
    addMcpServer: {
        description: 'Add or update an MCP server in the configuration with validation. This ensures the server definition is valid before saving.',
        inputSchema: z.object({
            serverName: z.string().describe('Name/alias for the MCP server'),
            config: McpServerDefinition,
        }),
        execute: async ({ serverName, config }: {
            serverName: string;
            config: z.infer<typeof McpServerDefinition>;
        }) => {
            try {
                const validationResult = McpServerDefinition.safeParse(config);
                if (!validationResult.success) {
                    return {
                        success: false,
                        message: 'Server definition failed validation. Check the errors below.',
                        validationErrors: validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
                        providedDefinition: config,
                    };
                }

                const repo = container.resolve<IMcpConfigRepo>('mcpConfigRepo');
                await repo.upsert(serverName, config);

                return {
                    success: true,
                    serverName,
                };
            } catch (error) {
                return {
                    error: `Failed to update MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
                };
            }
        },
    },

    listMcpServers: {
        description: 'List all configured MCP servers. IMPORTANT: a server with state "disconnected" may still be usable and simply not connected yet. If error is null, call listMcpTools to test and lazy-connect it before concluding it is unavailable.',
        inputSchema: z.object({}),
        execute: async () => {
            try {
                const result = await listServers();

                return {
                    result,
                    count: Object.keys(result.mcpServers).length,
                    hint: 'Treat disconnected + error=null as "configured but not connected yet". Try listMcpTools before saying the server is unavailable.',
                };
            } catch (error) {
                return {
                    error: `Failed to list MCP servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
                };
            }
        },
    },

    listMcpTools: {
        description: 'List all available tools from a specific MCP server. This will attempt to connect the server if it is configured but not connected yet.',
        inputSchema: z.object({
            serverName: z.string().describe('Name of the MCP server to query'),
            cursor: z.string().optional(),
        }),
        execute: async ({ serverName, cursor }: { serverName: string, cursor?: string }) => {
            try {
                const result = await listTools(serverName, cursor);
                return {
                    serverName,
                    result,
                    count: result.tools.length,
                };
            } catch (error) {
                return {
                    error: `Failed to list MCP tools: ${error instanceof Error ? error.message : 'Unknown error'}`,
                };
            }
        },
    },

    executeMcpTool: {
        description: 'Execute a specific tool from an MCP server. Use this to run MCP tools on behalf of the user. IMPORTANT: Always use listMcpTools first to get the tool\'s inputSchema, then match the required parameters exactly in the arguments field.',
        inputSchema: z.object({
            serverName: z.string().describe('Name of the MCP server that provides the tool'),
            toolName: z.string().describe('Name of the tool to execute'),
            arguments: z.record(z.string(), z.any()).optional().describe('Arguments to pass to the tool (as key-value pairs matching the tool\'s input schema). MUST include all required parameters from the tool\'s inputSchema.'),
        }),
        execute: async ({ serverName, toolName, arguments: args = {} }: { serverName: string, toolName: string, arguments?: Record<string, unknown> }) => {
            try {
                const result = await executeTool(serverName, toolName, args);
                const compressed = compressMcpToolResult(result);
                return {
                    success: true,
                    serverName,
                    toolName,
                    result: compressed.payload,
                    truncated: compressed.truncated,
                    message: `Successfully executed tool '${toolName}' from server '${serverName}'`,
                };
            } catch (error) {
                return {
                    success: false,
                    error: `Failed to execute MCP tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    hint: 'Use listMcpTools to verify the tool exists and check its schema. Ensure all required parameters are provided in the arguments field.',
                };
            }
        },
    },


};
