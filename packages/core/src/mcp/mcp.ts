import container from "../di/container.js";
import z from "zod";
import { IMcpConfigRepo } from "./repo.js";
import {
    ListToolsResponse,
    McpServerList,
} from "@flazz/shared";
import { McpClientAdapter, DefaultMcpClientAdapter } from "./adapter.js";

const clients: Record<string, McpClientAdapter> = {};

async function getClient(serverName: string): Promise<McpClientAdapter> {
    if (clients[serverName] && clients[serverName].getState() === "connected") {
        return clients[serverName];
    }

    const repo = container.resolve<IMcpConfigRepo>('mcpConfigRepo');
    const { mcpServers } = await repo.getConfig();
    const config = mcpServers[serverName];
    if (!config) {
        throw new Error(`MCP server ${serverName} not found`);
    }

    if (!clients[serverName]) {
        clients[serverName] = new DefaultMcpClientAdapter();
    }

    await clients[serverName].connect(serverName, config);
    return clients[serverName];
}

export async function cleanup() {
    for (const [serverName, client] of Object.entries(clients)) {
        await client.disconnect();
        delete clients[serverName];
    }
}

/**
 * Force-close all MCP client connections.
 * Used during force abort to immediately reject any pending MCP tool calls.
 * Clients will be lazily reconnected on next use.
 */
export async function forceCloseAllMcpClients(): Promise<void> {
    for (const [serverName, client] of Object.entries(clients)) {
        try {
            await client.disconnect();
        } catch {
            // Ignore errors during force close
        }
        delete clients[serverName];
    }
}

export async function listServers(): Promise<z.infer<typeof McpServerList>> {
    const repo = container.resolve<IMcpConfigRepo>('mcpConfigRepo');
    const { mcpServers } = await repo.getConfig();
    const result: z.infer<typeof McpServerList> = {
        mcpServers: {},
    };
    for (const [serverName, config] of Object.entries(mcpServers)) {
        const client = clients[serverName];
        result.mcpServers[serverName] = {
            config,
            state: client ? client.getState() : "disconnected",
            error: client ? client.getError() : null,
        };
    }
    return result;
}

export async function listTools(serverName: string, cursor?: string): Promise<z.infer<typeof ListToolsResponse>> {
    const client = await getClient(serverName);
    return await client.listTools(cursor);
}

export async function executeTool(serverName: string, toolName: string, input: Record<string, unknown>): Promise<unknown> {
    const client = await getClient(serverName);
    return await client.callTool(toolName, input);
}
