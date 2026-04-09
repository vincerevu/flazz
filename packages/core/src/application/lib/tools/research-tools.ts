import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { WorkDir } from "../../../config/config.js";

export const researchTools = {
    'web-search': {
        description: 'Search the web using Brave Search. Returns web results with titles, URLs, and descriptions.',
        inputSchema: z.object({
            query: z.string().describe('The search query'),
            count: z.number().optional().describe('Number of results to return (default: 5, max: 20)'),
            freshness: z.string().optional().describe('Filter by freshness: pd (past day), pw (past week), pm (past month), py (past year)'),
        }),
        isAvailable: async () => {
            try {
                const braveConfigPath = path.join(WorkDir, 'config', 'brave-search.json');
                const raw = await fs.readFile(braveConfigPath, 'utf8');
                const config = JSON.parse(raw);
                return !!config.apiKey;
            } catch {
                return false;
            }
        },
        execute: async ({ query, count, freshness }: { query: string; count?: number; freshness?: string }) => {
            try {
                // Read API key from config
                const braveConfigPath = path.join(WorkDir, 'config', 'brave-search.json');

                let apiKey: string;
                try {
                    const raw = await fs.readFile(braveConfigPath, 'utf8');
                    const config = JSON.parse(raw);
                    apiKey = config.apiKey;
                } catch {
                    return {
                        success: false,
                        error: 'Brave Search API key not configured. Create ~/Flazz/config/brave-search.json with { "apiKey": "<your-key>" }',
                    };
                }

                if (!apiKey) {
                    return {
                        success: false,
                        error: 'Brave Search API key is empty. Set "apiKey" in ~/Flazz/config/brave-search.json',
                    };
                }

                // Build query params
                const resultCount = Math.min(Math.max(count || 5, 1), 20);
                const params = new URLSearchParams({
                    q: query,
                    count: String(resultCount),
                });
                if (freshness) {
                    params.set('freshness', freshness);
                }

                const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;
                const response = await fetch(url, {
                    headers: {
                        'X-Subscription-Token': apiKey,
                        'Accept': 'application/json',
                    },
                });

                if (!response.ok) {
                    const body = await response.text();
                    return {
                        success: false,
                        error: `Brave Search API error (${response.status}): ${body}`,
                    };
                }

                const data = await response.json() as {
                    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
                };

                const results = (data.web?.results || []).map((r: { title?: string; url?: string; description?: string }) => ({
                    title: r.title || '',
                    url: r.url || '',
                    description: r.description || '',
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

    'research-search': {
        description: 'Use this for finding articles, blog posts, papers, companies, people, or exploring a topic in depth. Best for discovery and research where you need quality sources, not a quick fact.',
        inputSchema: z.object({
            query: z.string().describe('The search query'),
            numResults: z.number().optional().describe('Number of results to return (default: 5, max: 20)'),
            category: z.enum(['company', 'research paper', 'news', 'tweet', 'personal site', 'financial report', 'people']).optional().describe('Filter results by category'),
        }),
        isAvailable: async () => {
            try {
                const exaConfigPath = path.join(WorkDir, 'config', 'exa-search.json');
                const raw = await fs.readFile(exaConfigPath, 'utf8');
                const config = JSON.parse(raw);
                return !!config.apiKey;
            } catch {
                return false;
            }
        },
        execute: async ({ query, numResults, category }: { query: string; numResults?: number; category?: string }) => {
            try {
                const exaConfigPath = path.join(WorkDir, 'config', 'exa-search.json');

                let apiKey: string;
                try {
                    const raw = await fs.readFile(exaConfigPath, 'utf8');
                    const config = JSON.parse(raw);
                    apiKey = config.apiKey;
                } catch {
                    return {
                        success: false,
                        error: 'Exa Search API key not configured. Create ~/Flazz/config/exa-search.json with { "apiKey": "<your-key>" }',
                    };
                }

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
