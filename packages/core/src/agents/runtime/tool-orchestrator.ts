import { jsonSchema } from "ai";
import { z } from "zod";
import { Agent, ToolAttachment } from "@flazz/shared";
import { ToolCallPart, ToolMessage } from "@flazz/shared";
import { tool, Tool, ToolSet } from "ai";
import { BuiltinTools } from "../../application/lib/builtin-tools.js";
import { RunEvent } from "@flazz/shared";
import { execTool } from "../../application/lib/exec-tool.js";
import { IAbortRegistry } from "../../runs/abort-registry.js";
import { loadAgent } from "../runtime.js";

export const MappedToolCall = z.object({
    toolCall: ToolCallPart,
    agentTool: ToolAttachment,
});

export async function mapAgentTool(t: z.infer<typeof ToolAttachment>): Promise<Tool> {
    switch (t.type) {
        case "mcp":
            return tool({
                name: t.name,
                description: t.description,
                inputSchema: jsonSchema(t.inputSchema),
            });
        case "agent": {
            const agent = await loadAgent(t.name);
            if (!agent) {
                throw new Error(`Agent ${t.name} not found`);
            }
            return tool({
                name: t.name,
                description: agent.description,
                inputSchema: z.object({
                    message: z.string().describe("The message to send to the workflow"),
                }),
            });
        }
        case "builtin": {
            if (t.name === "ask-human") {
                return tool({
                    description: "Ask a human before proceeding",
                    inputSchema: z.object({
                        question: z.string().describe("The question to ask the human"),
                    }),
                });
            }
            const match = BuiltinTools[t.name];
            if (!match) {
                throw new Error(`Unknown builtin tool: ${t.name}`);
            }
            return tool({
                description: match.description,
                inputSchema: match.inputSchema,
            });
        }
    }
}

/**
 * Extract keywords from text for tool filtering
 */
function extractKeywords(text: string): Set<string> {
    return new Set(
        text.toLowerCase()
            .split(/\W+/)
            .filter(w => w.length > 3)
    );
}

/**
 * Build tools for agent, with smart filtering for MCP tools
 * Only loads MCP tools that are relevant to the user message.
 * NOTE: Filtering is only applied when agent has many tools (>5).
 * For small agents, always include all tools to prevent model hallucination.
 */
export async function buildTools(
    agent: z.infer<typeof Agent>,
    userMessage?: string
): Promise<ToolSet> {
    const tools: ToolSet = {};
    const allTools = Object.entries(agent.tools ?? {});
    const mcpToolCount = allTools.filter(([, t]) => t.type === 'mcp').length;

    // Only apply keyword filtering if agent has many MCP tools (>5)
    // For small agents, always include all tools to avoid model calling non-existent tools
    const shouldFilter = mcpToolCount > 5;
    const messageKeywords = (shouldFilter && userMessage) ? extractKeywords(userMessage) : null;
    
    for (const [name, agentTool] of allTools) {
        try {
            if (agentTool.type === 'mcp' && messageKeywords) {
                const toolKeywords = extractKeywords(agentTool.description);
                const hasMatch = Array.from(messageKeywords).some(k => 
                    toolKeywords.has(k)
                );
                
                if (!hasMatch) {
                    console.log(`[Tools] Skipping MCP tool ${name} (not relevant to message)`);
                    continue;
                }
            }
            
            // Skip builtin tools that declare themselves unavailable
            if (agentTool.type === 'builtin') {
                const builtin = BuiltinTools[agentTool.name];
                if (builtin?.isAvailable && !(await builtin.isAvailable())) {
                    continue;
                }
            }
            tools[name] = await mapAgentTool(agentTool);
        } catch (error) {
            console.error(`Error mapping tool ${name}:`, error);
            continue;
        }
    }
    return tools;
}

export async function* executeToolOrchestrator({
    toolCall,
    toolCallId,
    agent,
    runId,
    signal,
    abortRegistry,
    emitLog,
    processEvent,
    idGenerator,
}: {
    toolCall: z.infer<typeof ToolCallPart>;
    toolCallId: string;
    agent: z.infer<typeof Agent>;
    runId: string;
    signal: AbortSignal;
    abortRegistry: IAbortRegistry;
    emitLog: (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;
    processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
    idGenerator: { next: () => Promise<string> };
}): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
    emitLog("info", "tool call start", { toolCallId, toolName: toolCall.toolName, arguments: toolCall.arguments });
    yield* processEvent({
        runId,
        type: "tool-invocation",
        toolCallId,
        toolName: toolCall.toolName,
        input: JSON.stringify(toolCall.arguments ?? {}),
        subflow: [],
    });

    let result: unknown = null;
    try {
        result = await execTool(agent.tools![toolCall.toolName], toolCall.arguments, { runId, signal, abortRegistry });
    } catch (err) {
        emitLog("error", "tool call error", { toolCallId, toolName: toolCall.toolName, error: err instanceof Error ? err.message : String(err) });
        throw err;
    }

    const resultPayload = result === undefined ? null : result;
    emitLog("info", "tool call end", { toolCallId, toolName: toolCall.toolName, result: resultPayload });
    const resultMsg: z.infer<typeof ToolMessage> = {
        role: "tool",
        content: JSON.stringify(resultPayload),
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
    };
    yield* processEvent({
        runId,
        type: "tool-result",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: resultPayload,
        subflow: [],
    });
    yield* processEvent({
        runId,
        messageId: await idGenerator.next(),
        type: "message",
        message: resultMsg,
        subflow: [],
    });
}
