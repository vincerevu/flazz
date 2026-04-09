import { z } from "zod";
import { composioAccountsRepo } from "../../../composio/repo.js";
import { executeAction as executeComposioAction, isConfigured as isComposioConfigured, listToolkitTools } from "../../../composio/client.js";
import { slackToolCatalog } from "../../assistant/skills/slack/tool-catalog.js";

type SlackToolHint = {
    search?: string;
    patterns: string[];
    fallbackSlugs?: string[];
    preferSlugIncludes?: string[];
    excludePatterns?: string[];
    minScore?: number;
};

const slackToolHints: Record<string, SlackToolHint> = {
    sendMessage: {
        search: "message",
        patterns: ["send", "message", "channel"],
        fallbackSlugs: [
            "SLACK_SEND_MESSAGE",
            "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
            "SLACK_SEND_A_MESSAGE",
        ],
    },
    listConversations: {
        search: "conversation",
        patterns: ["list", "conversation", "channel"],
        fallbackSlugs: [
            "SLACK_LIST_CONVERSATIONS",
            "SLACK_LIST_ALL_CHANNELS",
            "SLACK_LIST_ALL_SLACK_TEAM_CHANNELS_WITH_VARIOUS_FILTERS",
            "SLACK_LIST_CHANNELS",
            "SLACK_LIST_CHANNEL",
        ],
        preferSlugIncludes: ["list", "conversation"],
        minScore: 2,
    },
    getConversationHistory: {
        search: "history",
        patterns: ["history", "conversation", "message"],
        fallbackSlugs: [
            "SLACK_FETCH_CONVERSATION_HISTORY",
            "SLACK_FETCHES_CONVERSATION_HISTORY",
            "SLACK_GET_CONVERSATION_HISTORY",
            "SLACK_GET_CHANNEL_HISTORY",
        ],
        preferSlugIncludes: ["history"],
        minScore: 2,
    },
    listUsers: {
        search: "user",
        patterns: ["list", "user"],
        fallbackSlugs: [
            "SLACK_LIST_ALL_USERS",
            "SLACK_LIST_ALL_SLACK_TEAM_USERS_WITH_PAGINATION",
            "SLACK_LIST_USERS",
            "SLACK_GET_USERS",
            "SLACK_USERS_LIST",
        ],
        preferSlugIncludes: ["list", "user"],
        excludePatterns: ["find", "by name", "by email", "by_email", "by_name", "lookup", "profile", "info"],
        minScore: 2,
    },
    getUserInfo: {
        search: "user",
        patterns: ["user", "info", "profile"],
        fallbackSlugs: [
            "SLACK_GET_USER_INFO",
            "SLACK_GET_USER",
            "SLACK_USER_INFO",
        ],
        preferSlugIncludes: ["user", "info"],
        minScore: 1,
    },
    searchMessages: {
        search: "search",
        patterns: ["search", "message"],
        fallbackSlugs: [
            "SLACK_SEARCH_FOR_MESSAGES_WITH_QUERY",
            "SLACK_SEARCH_MESSAGES",
            "SLACK_SEARCH_MESSAGE",
        ],
        preferSlugIncludes: ["search"],
        minScore: 1,
    },
};

const slackToolSlugCache = new Map<string, string>();

const slackToolSlugOverrides: Partial<Record<keyof typeof slackToolHints, string>> = {
    sendMessage: "SLACK_SEND_MESSAGE",
    listConversations: "SLACK_LIST_CONVERSATIONS",
    getConversationHistory: "SLACK_FETCH_CONVERSATION_HISTORY",
    listUsers: "SLACK_LIST_ALL_USERS",
    getUserInfo: "SLACK_RETRIEVE_DETAILED_USER_INFORMATION",
    searchMessages: "SLACK_SEARCH_MESSAGES",
};

const compactObject = (input: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

type SlackToolResult = { success: boolean; data?: unknown; error?: string };

/** Helper to execute a Slack tool with consistent account validation and error handling */
async function executeSlackTool(
    hintKey: keyof typeof slackToolHints,
    params: Record<string, unknown>
): Promise<SlackToolResult> {
    const account = composioAccountsRepo.getAccount('slack');
    if (!account || account.status !== 'ACTIVE') {
        return { success: false, error: 'Slack is not connected' };
    }
    try {
        const toolSlug = await resolveSlackToolSlug(hintKey);
        return await executeComposioAction(toolSlug, account.id, compactObject(params));
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

const normalizeSlackTool = (tool: { slug: string; name?: string; description?: string }) =>
    `${tool.slug} ${tool.name || ""} ${tool.description || ""}`.toLowerCase();

const scoreSlackTool = (tool: { slug: string; name?: string; description?: string }, patterns: string[]) => {
    const slug = tool.slug.toLowerCase();
    const name = (tool.name || "").toLowerCase();
    const description = (tool.description || "").toLowerCase();

    let score = 0;
    for (const pattern of patterns) {
        const needle = pattern.toLowerCase();
        if (slug.includes(needle)) score += 3;
        if (name.includes(needle)) score += 2;
        if (description.includes(needle)) score += 1;
    }
    return score;
};

const pickSlackTool = (
    tools: Array<{ slug: string; name?: string; description?: string }>,
    hint: SlackToolHint,
) => {
    let candidates = tools;

    if (hint.excludePatterns && hint.excludePatterns.length > 0) {
        candidates = candidates.filter((tool) => {
            const haystack = normalizeSlackTool(tool);
            return !hint.excludePatterns!.some((pattern) => haystack.includes(pattern.toLowerCase()));
        });
    }

    if (hint.preferSlugIncludes && hint.preferSlugIncludes.length > 0) {
        const preferred = candidates.filter((tool) =>
            hint.preferSlugIncludes!.every((pattern) => tool.slug.toLowerCase().includes(pattern.toLowerCase()))
        );
        if (preferred.length > 0) {
            candidates = preferred;
        }
    }

    let best: { slug: string; name?: string; description?: string } | null = null;
    let bestScore = 0;

    for (const tool of candidates) {
        const score = scoreSlackTool(tool, hint.patterns);
        if (score > bestScore) {
            bestScore = score;
            best = tool;
        }
    }

    if (!best || (hint.minScore !== undefined && bestScore < hint.minScore)) {
        return null;
    }

    return best;
};

const resolveSlackToolSlug = async (hintKey: keyof typeof slackToolHints) => {
    const cached = slackToolSlugCache.get(hintKey);
    if (cached) return cached;

    const hint = slackToolHints[hintKey];

    const override = slackToolSlugOverrides[hintKey];
    if (override && slackToolCatalog.some((tool) => tool.slug === override)) {
        slackToolSlugCache.set(hintKey, override);
        return override;
    }
    const resolveFromTools = (tools: Array<{ slug: string; name?: string; description?: string }>) => {
        if (hint.fallbackSlugs && hint.fallbackSlugs.length > 0) {
            const fallbackSet = new Set(hint.fallbackSlugs.map((slug) => slug.toLowerCase()));
            const fallback = tools.find((tool) => fallbackSet.has(tool.slug.toLowerCase()));
            if (fallback) return fallback.slug;
        }

        const best = pickSlackTool(tools, hint);
        return best?.slug || null;
    };

    const initialTools = slackToolCatalog;

    if (!initialTools.length) {
        throw new Error("No Slack tools returned from Composio");
    }

    const initialSlug = resolveFromTools(initialTools);
    if (initialSlug) {
        slackToolSlugCache.set(hintKey, initialSlug);
        return initialSlug;
    }

    const allSlug = resolveFromTools(slackToolCatalog);

    if (!allSlug) {
        const fallback = await listToolkitTools("slack", hint.search || null);
        const fallbackSlug = resolveFromTools(fallback.items || []);
        if (!fallbackSlug) {
            throw new Error(`Unable to resolve Slack tool for ${hintKey}. Try slack-listAvailableTools.`);
        }
        slackToolSlugCache.set(hintKey, fallbackSlug);
        return fallbackSlug;
    }

    slackToolSlugCache.set(hintKey, allSlug);
    return allSlug;
};
export const integrationTools = {
    'slack-checkConnection': {
        description: 'Check if Slack is connected and ready to use. Use this before other Slack operations.',
        inputSchema: z.object({}),
        execute: async () => {
            if (!isComposioConfigured()) {
                return {
                    connected: false,
                    error: 'Composio is not configured. Please set up your Composio API key first.',
                };
            }
            const account = composioAccountsRepo.getAccount('slack');
            if (!account || account.status !== 'ACTIVE') {
                return {
                    connected: false,
                    error: 'Slack is not connected. Please connect Slack from the settings.',
                };
            }
            return {
                connected: true,
                accountId: account.id,
            };
        },
    },

    'slack-listAvailableTools': {
        description: 'List available Slack tools from Composio. Use this to discover the correct tool slugs before executing actions. Call this first if other Slack tools return errors.',
        inputSchema: z.object({
            search: z.string().optional().describe('Optional search query to filter tools (e.g., "message", "channel", "user")'),
        }),
        execute: async ({ search }: { search?: string }) => {
            if (!isComposioConfigured()) {
                return { success: false, error: 'Composio is not configured' };
            }

            try {
                const result = await listToolkitTools('slack', search || null);
                return {
                    success: true,
                    tools: result.items,
                    count: result.items.length,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'slack-executeAction': {
        description: 'Execute a Slack action by its Composio tool slug. Use slack-listAvailableTools first to discover correct slugs. Pass the exact slug and the required input parameters.',
        inputSchema: z.object({
            toolSlug: z.string().describe('The exact Composio tool slug (e.g., "SLACKBOT_SEND_A_MESSAGE_TO_A_SLACK_CHANNEL")'),
            input: z.record(z.string(), z.unknown()).describe('Input parameters for the tool (check the tool description for required fields)'),
        }),
        execute: async ({ toolSlug, input }: { toolSlug: string; input: Record<string, unknown> }) => {
            const account = composioAccountsRepo.getAccount('slack');
            if (!account || account.status !== 'ACTIVE') {
                return { success: false, error: 'Slack is not connected' };
            }

            try {
                const result = await executeComposioAction(toolSlug, account.id, input);
                return result;
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'slack-sendMessage': {
        description: 'Send a message to a Slack channel or user. Requires channel ID (starts with C for channels, D for DMs) or user ID.',
        inputSchema: z.object({
            channel: z.string().describe('Channel ID (e.g., C01234567) or user ID (e.g., U01234567) to send the message to'),
            text: z.string().describe('The message text to send'),
        }),
        execute: async ({ channel, text }: { channel: string; text: string }) => {
            return executeSlackTool("sendMessage", { channel, text });
        },
    },

    'slack-listChannels': {
        description: 'List Slack channels the user has access to. Returns channel IDs and names.',
        inputSchema: z.object({
            types: z.string().optional().describe('Comma-separated channel types: public_channel, private_channel, mpim, im (default: public_channel,private_channel)'),
            limit: z.number().optional().describe('Maximum number of channels to return (default: 100)'),
        }),
        execute: async ({ types, limit }: { types?: string; limit?: number }) => {
            return executeSlackTool("listConversations", {
                types: types || "public_channel,private_channel",
                limit: limit ?? 100,
            });
        },
    },

    'slack-getChannelHistory': {
        description: 'Get recent messages from a Slack channel. Returns message history with timestamps and user IDs.',
        inputSchema: z.object({
            channel: z.string().describe('Channel ID to get history from (e.g., C01234567)'),
            limit: z.number().optional().describe('Maximum number of messages to return (default: 20, max: 100)'),
        }),
        execute: async ({ channel, limit }: { channel: string; limit?: number }) => {
            return executeSlackTool("getConversationHistory", {
                channel,
                limit: limit !== undefined ? Math.min(limit, 100) : 20,
            });
        },
    },

    'slack-listUsers': {
        description: 'List users in the Slack workspace. Returns user IDs, names, and profile info.',
        inputSchema: z.object({
            limit: z.number().optional().describe('Maximum number of users to return (default: 100)'),
        }),
        execute: async ({ limit }: { limit?: number }) => {
            return executeSlackTool("listUsers", { limit: limit ?? 100 });
        },
    },

    'slack-getUserInfo': {
        description: 'Get detailed information about a specific Slack user by their user ID.',
        inputSchema: z.object({
            user: z.string().describe('User ID to get info for (e.g., U01234567)'),
        }),
        execute: async ({ user }: { user: string }) => {
            return executeSlackTool("getUserInfo", { user });
        },
    },

    'slack-searchMessages': {
        description: 'Search for messages in Slack. Find messages containing specific text across channels.',
        inputSchema: z.object({
            query: z.string().describe('Search query text'),
            count: z.number().optional().describe('Maximum number of results (default: 20)'),
        }),
        execute: async ({ query, count }: { query: string; count?: number }) => {
            return executeSlackTool("searchMessages", { query, count: count ?? 20 });
        },
    },

    'slack-getDirectMessages': {
        description: 'List direct message (DM) channels. Returns IDs of DM conversations with other users.',
        inputSchema: z.object({
            limit: z.number().optional().describe('Maximum number of DM channels to return (default: 50)'),
        }),
        execute: async ({ limit }: { limit?: number }) => {
            return executeSlackTool("listConversations", { types: "im", limit: limit ?? 50 });
        },
    },


};
