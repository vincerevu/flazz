import { z } from "zod";
import * as fs from "fs/promises";
import { search as ddgSearch } from "ddg-search";
import {
    BRAVE_SEARCH_CONFIG_PATH,
    EXA_SEARCH_CONFIG_PATH,
    getSearchConfig,
    type QuickSearchProvider,
} from "../../../config/search-config.js";

function mapFreshnessToDdgTime(freshness?: string): string {
    switch (freshness) {
        case "pd":
            return "d";
        case "pw":
            return "w";
        case "pm":
            return "m";
        case "py":
            return "y";
        default:
            return "";
    }
}

async function readApiKey(configPath: string): Promise<string | null> {
    try {
        const raw = await fs.readFile(configPath, "utf8");
        const config = JSON.parse(raw) as { apiKey?: unknown };
        return typeof config.apiKey === "string" && config.apiKey.trim() ? config.apiKey.trim() : null;
    } catch {
        return null;
    }
}

async function executeBraveSearch({
    query,
    count,
    freshness,
    apiKey,
}: {
    query: string;
    count?: number;
    freshness?: string;
    apiKey: string;
}) {
    const resultCount = Math.min(Math.max(count || 5, 1), 20);
    const params = new URLSearchParams({
        q: query,
        count: String(resultCount),
    });
    if (freshness) {
        params.set("freshness", freshness);
    }

    const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;
    const response = await fetch(url, {
        headers: {
            "X-Subscription-Token": apiKey,
            "Accept": "application/json",
        },
    });

    if (!response.ok) {
        const body = await response.text();
        return {
            success: false,
            provider: "brave-search",
            error: `Brave Search API error (${response.status}): ${body}`,
        };
    }

    const data = await response.json() as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };

    const results = (data.web?.results || []).map((r) => ({
        title: r.title || "",
        url: r.url || "",
        description: r.description || "",
    }));

    return {
        success: true,
        provider: "brave-search",
        query,
        results,
        count: results.length,
    };
}

async function executeDdgFallback({
    query,
    count,
    freshness,
    fallbackFrom,
}: {
    query: string;
    count?: number;
    freshness?: string;
    fallbackFrom?: QuickSearchProvider;
}) {
    try {
        const response = await ddgSearch(query, {
            maxPages: 1,
            maxResults: Math.min(Math.max(count || 5, 1), 20),
            region: "wt-wt",
            time: mapFreshnessToDdgTime(freshness),
        });

        const results = response.results.map((result) => ({
            title: result.title,
            url: result.url,
            description: result.description,
        }));

        return {
            success: true,
            provider: "ddg-search",
            query,
            results,
            count: results.length,
            fallbackFrom,
        };
    } catch (error) {
        return {
            success: false,
            provider: "ddg-search",
            error: error instanceof Error ? error.message : "DuckDuckGo search failed",
            fallbackFrom,
        };
    }
}

export const researchTools = {
    'web-search': {
        description: 'Quick web search using the configured provider. DuckDuckGo is available by default without an API key, and Brave Search can be selected when configured. Returns titles, URLs, and descriptions.',
        inputSchema: z.object({
            query: z.string().describe('The search query'),
            count: z.number().optional().describe('Number of results to return (default: 5, max: 20)'),
            freshness: z.string().optional().describe('Filter by freshness: pd (past day), pw (past week), pm (past month), py (past year)'),
        }),
        isAvailable: async () => true,
        execute: async ({ query, count, freshness }: { query: string; count?: number; freshness?: string }) => {
            try {
                const searchConfig = getSearchConfig();
                const braveApiKey = await readApiKey(BRAVE_SEARCH_CONFIG_PATH);

                if (searchConfig.defaultQuickSearchProvider === "brave-search" && braveApiKey) {
                    return await executeBraveSearch({ query, count, freshness, apiKey: braveApiKey });
                }
                if (searchConfig.defaultQuickSearchProvider === "brave-search" && !braveApiKey) {
                    return await executeDdgFallback({
                        query,
                        count,
                        freshness,
                        fallbackFrom: "brave-search",
                    });
                }
                return await executeDdgFallback({ query, count, freshness });
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'research-search': {
        description: 'Use this for finding articles, blog posts, papers, companies, people, or exploring a topic in depth. Best for discovery and research where you need quality sources, not a quick fact.',
        inputSchema: z.object({
            query: z.string().describe('The search query'),
            numResults: z.number().optional().describe('Number of results to return (default: 5, max: 20)'),
            category: z.enum(['company', 'research paper', 'news', 'tweet', 'personal site', 'financial report', 'people']).optional().describe('Filter results by category'),
        }),
        isAvailable: async () => {
            return Boolean(await readApiKey(EXA_SEARCH_CONFIG_PATH));
        },
        execute: async ({ query, numResults, category }: { query: string; numResults?: number; category?: string }) => {
            try {
                const apiKey = await readApiKey(EXA_SEARCH_CONFIG_PATH);
                if (!apiKey) {
                    return {
                        success: false,
                        error: 'Exa Search API key is empty. Set "apiKey" in ~/Flazz/config/exa-search.json',
                    };
                }

                const resultCount = Math.min(Math.max(numResults || 5, 1), 20);

                const body: Record<string, unknown> = {
                    query,
                    numResults: resultCount,
                    type: 'auto',
                    contents: {
                        text: { maxCharacters: 1000 },
                        highlights: true,
                    },
                };
                if (category) {
                    body.category = category;
                }

                const response = await fetch('https://api.exa.ai/search', {
                    method: 'POST',
                    headers: {
                        'x-api-key': apiKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const text = await response.text();
                    return {
                        success: false,
                        error: `Exa Search API error (${response.status}): ${text}`,
                    };
                }

                const data = await response.json() as {
                    results?: Array<{
                        title?: string;
                        url?: string;
                        publishedDate?: string;
                        author?: string;
                        highlights?: string[];
                        text?: string;
                    }>;
                };

                const results = (data.results || []).map((r) => ({
                    title: r.title || '',
                    url: r.url || '',
                    publishedDate: r.publishedDate || '',
                    author: r.author || '',
                    highlights: r.highlights || [],
                    text: r.text || '',
                }));

                return {
                    success: true,
                    query,
                    results,
                    count: results.length,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },


};
