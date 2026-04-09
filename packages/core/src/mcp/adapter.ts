import { Client } from "@modelcontextprotocol/sdk/client";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ListToolsResponse } from "@flazz/shared";
import z from "zod";
import { McpServerDefinition } from "@flazz/shared";

export interface McpClientAdapter {
    connect(serverName: string, config: z.infer<typeof McpServerDefinition>): Promise<void>;
    disconnect(): Promise<void>;
    listTools(cursor?: string): Promise<z.infer<typeof ListToolsResponse>>;
    callTool(toolName: string, input: Record<string, unknown>): Promise<unknown>;
    getState(): "connected" | "disconnected" | "error";
    getError(): string | null;
}

export class DefaultMcpClientAdapter implements McpClientAdapter {
    private client: Client | null = null;
    private transport: Transport | null = null;
    private state: "connected" | "disconnected" | "error" = "disconnected";
    private error: string | null = null;

    async connect(serverName: string, config: z.infer<typeof McpServerDefinition>): Promise<void> {
        if (this.state === "connected" && this.client) {
            return;
        }

        try {
            if ("command" in config) {
                this.transport = new StdioClientTransport({
                    command: config.command,
                    args: config.args,
                    env: config.env,
                });
            } else {
                try {
                    this.transport = new StreamableHTTPClientTransport(new URL(config.url));
                } catch {
                    this.transport = new SSEClientTransport(new URL(config.url));
                }
            }

            if (!this.transport) {
                throw new Error(`No transport found for ${serverName}`);
            }

            this.client = new Client({
                name: 'Flazz',
                version: '1.0.0',
            });
            await this.client.connect(this.transport);

            this.state = "connected";
            this.error = null;
        } catch (error) {
            this.state = "error";
            this.error = error instanceof Error ? error.message : "Unknown error";
            this.client = null;
            await this.transport?.close();
            this.transport = null;
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.client?.close();
            await this.transport?.close();
        } catch {
            // Ignore
        } finally {
            this.client = null;
            this.transport = null;
            this.state = "disconnected";
            this.error = null;
        }
    }

    async listTools(cursor?: string): Promise<z.infer<typeof ListToolsResponse>> {
        if (!this.client || this.state !== "connected") {
            throw new Error("Client not connected");
        }
        const { tools, nextCursor } = await this.client.listTools({ cursor });
        return { tools, nextCursor };
    }

    async callTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
        if (!this.client || this.state !== "connected") {
            throw new Error("Client not connected");
        }
        return await this.client.callTool({
            name: toolName,
            arguments: input,
        });
    }

    getState(): "connected" | "disconnected" | "error" {
        return this.state;
    }

    getError(): string | null {
        return this.error;
    }
}
