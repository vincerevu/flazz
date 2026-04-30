import { z } from "zod";
import * as fs from "fs/promises";
import { search as ddgSearch } from "ddg-search";
import { imageSearch as ddgImageSearch } from "@mudbill/duckduckgo-images-api";
import {
    BRAVE_SEARCH_CONFIG_PATH,
    EXA_SEARCH_CONFIG_PATH,
    getSearchConfig,
    type QuickSearchProvider,
} from "../../../config/search-config.js";

const IMAGE_SEARCH_TIMEOUT_MS = 15_000;
const IMAGE_PREFLIGHT_TIMEOUT_MS = 4_000;
const IMAGE_SEARCH_MAX_RESULTS = 50;
const IMAGE_SEARCH_MAX_PER_DOMAIN = 2;
const WATERMARKED_IMAGE_DOMAINS = [
    "alamy.com",
    "alamyimages.fr",
    "shutterstock.com",
    "gettyimages.com",
    "istockphoto.com",
    "dreamstime.com",
    "depositphotos.com",
    "123rf.com",
    "freepik.com",
    "vecteezy.com",
    "stock.adobe.com",
    "adobestock.com",
    "bigstockphoto.com",
    "agefotostock.com",
    "pond5.com",
    "pixta.jp",
    "canstockphoto.com",
    "colourbox.com",
    "pinterest.com",
    "pinimg.com",
];
const PREFERRED_IMAGE_DOMAINS = [
    "wikimedia.org",
    "wikipedia.org",
    "unsplash.com",
    "images.unsplash.com",
    "pexels.com",
    "pixabay.com",
    "flickr.com",
    "staticflickr.com",
    "nasa.gov",
    "loc.gov",
    "europeana.eu",
];
const WATERMARK_TERMS = [
    "alamy",
    "shutterstock",
    "getty images",
    "gettyimages",
    "istock",
    "dreamstime",
    "depositphotos",
    "123rf",
    "freepik",
    "vecteezy",
    "adobe stock",
    "stock photo",
    "watermark",
    "pinterest",
    "pinimg",
];
const LOW_QUALITY_IMAGE_TERMS = [
    "wallpaper",
    "background",
    "free download",
    "hd wallpapers",
    "4k wallpapers",
];

type RawImageSearchResult = {
    height?: number;
    width?: number;
    image?: string;
    source?: string;
    thumbnail?: string;
    title?: string;
    url?: string;
};

type ImageSearchResult = {
    title: string;
    imageUrl: string;
    thumbnailUrl: string;
    sourceUrl: string;
    width?: number;
    height?: number;
    source?: string;
    sourceDomain?: string;
};

type ImageSearchFilterSummary = {
    invalid: number;
    duplicate: number;
    duplicateSource: number;
    nearDuplicate: number;
    domainLimit: number;
    preflightFailed: number;
    blockedDomain: number;
    watermarkedSource: number;
    outsideAllowedDomains: number;
};

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

function getDomain(url: string): string | undefined {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return undefined;
    }
}

function normalizeDomain(value: string): string {
    return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
}

function domainMatches(domain: string | undefined, patterns: string[]): boolean {
    if (!domain) return false;
    const normalized = normalizeDomain(domain);
    return patterns.map(normalizeDomain).some((pattern) => {
        if (!pattern) return false;
        return normalized === pattern || normalized.endsWith(`.${pattern}`);
    });
}

function isUnstableImageProxyUrl(url: string): boolean {
    const domain = getDomain(url);
    return domainMatches(domain, ["mm.bing.net", "bing.net", "bing.com"])
        && /\/th\/id\//i.test(url);
}

function normalizeImageUrlForDedupe(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.hash = "";
        for (const key of [...parsed.searchParams.keys()]) {
            if (/^(utm_|fbclid|gclid|w|width|h|height|q|quality|fit|crop|auto|format|fm|ixlib|ixid|dl)$/i.test(key)) {
                parsed.searchParams.delete(key);
            }
        }
        return parsed.toString().toLowerCase();
    } catch {
        return url.trim().toLowerCase();
    }
}

function normalizeSourceUrlForDedupe(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.hash = "";
        parsed.search = "";
        return parsed.toString().replace(/\/$/, "").toLowerCase();
    } catch {
        return url.trim().replace(/\/$/, "").toLowerCase();
    }
}

function normalizeTitleForDedupe(value: string): string {
    return value
        .toLowerCase()
        .replace(/\b(stock photo|stock image|free download|wallpaper|hd|4k|image|photo|picture|vector|illustration)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function titleSimilarity(a: string, b: string): number {
    const aTokens = new Set(normalizeTitleForDedupe(a).split(" ").filter((token) => token.length > 2));
    const bTokens = new Set(normalizeTitleForDedupe(b).split(" ").filter((token) => token.length > 2));
    if (aTokens.size === 0 || bTokens.size === 0) return 0;
    const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
    return intersection / Math.max(aTokens.size, bTokens.size);
}

function isNearDuplicateImage(a: ImageSearchResult, b: ImageSearchResult): boolean {
    if (a.sourceDomain && b.sourceDomain && normalizeDomain(a.sourceDomain) === normalizeDomain(b.sourceDomain)) {
        return titleSimilarity(a.title, b.title) >= 0.8;
    }
    return normalizeImageUrlForDedupe(a.imageUrl) === normalizeImageUrlForDedupe(b.imageUrl)
        || normalizeImageUrlForDedupe(a.thumbnailUrl) === normalizeImageUrlForDedupe(b.thumbnailUrl);
}

function includesWatermarkTerm(result: ImageSearchResult): boolean {
    const haystack = [
        result.title,
        result.source,
        result.sourceDomain,
        result.sourceUrl,
        result.imageUrl,
        result.thumbnailUrl,
    ].filter(Boolean).join(" ").toLowerCase();
    return WATERMARK_TERMS.some((term) => haystack.includes(term));
}

function isLikelyWatermarkedSource(result: ImageSearchResult): boolean {
    return domainMatches(result.sourceDomain, WATERMARKED_IMAGE_DOMAINS) || includesWatermarkTerm(result);
}

function scoreImageResult(result: ImageSearchResult): number {
    let score = 0;
    const haystack = [result.title, result.source, result.sourceDomain, result.sourceUrl].filter(Boolean).join(" ").toLowerCase();
    if (domainMatches(result.sourceDomain, PREFERRED_IMAGE_DOMAINS)) score += 50;
    if (result.width && result.height) {
        score += 5;
        const largestSide = Math.max(result.width, result.height);
        if (largestSide >= 1200) score += 10;
        if (largestSide < 400) score -= 12;
    }
    if (result.thumbnailUrl && result.thumbnailUrl !== result.imageUrl) score += 3;
    if (isLikelyWatermarkedSource(result)) score -= 100;
    if (LOW_QUALITY_IMAGE_TERMS.some((term) => haystack.includes(term))) score -= 20;
    return score;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeout) {
            clearTimeout(timeout);
        }
    });
}

async function isUsableRemoteImage(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), IMAGE_PREFLIGHT_TIMEOUT_MS);
        const response = await fetch(url, {
            method: "GET",
            headers: { "Range": "bytes=0-4095" },
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (!response.ok) return false;
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("image/")) return false;
        const contentLength = Number(response.headers.get("content-length") || "0");
        if (contentLength > 0 && contentLength < 1_500) return false;
        return true;
    } catch {
        return false;
    }
}

function normalizeImageResult(raw: RawImageSearchResult): ImageSearchResult | null {
    const imageUrl = typeof raw.image === "string" ? raw.image.trim() : "";
    const sourceUrl = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!imageUrl || !sourceUrl || isUnstableImageProxyUrl(imageUrl)) {
        return null;
    }

    const rawThumbnailUrl = typeof raw.thumbnail === "string" ? raw.thumbnail.trim() : "";
    const thumbnailUrl = rawThumbnailUrl && !isUnstableImageProxyUrl(rawThumbnailUrl)
        ? rawThumbnailUrl
        : imageUrl;
    const title = typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : sourceUrl;
    const source = typeof raw.source === "string" && raw.source.trim()
        ? raw.source.trim()
        : undefined;
    const width = Number.isFinite(raw.width) ? raw.width : undefined;
    const height = Number.isFinite(raw.height) ? raw.height : undefined;

    return {
        title,
        imageUrl,
        thumbnailUrl,
        sourceUrl,
        width,
        height,
        source,
        sourceDomain: getDomain(sourceUrl),
    };
}

async function executeDuckDuckGoImageSearch({
    query,
    count,
    safe,
    avoidWatermark,
    allowedDomains,
    blockedDomains,
}: {
    query: string;
    count?: number;
    safe?: boolean;
    avoidWatermark?: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
}) {
    const requestedCount = Math.min(Math.max(count || 12, 1), IMAGE_SEARCH_MAX_RESULTS);
    const shouldAvoidWatermark = avoidWatermark ?? true;
    const normalizedAllowedDomains = (allowedDomains || []).map(normalizeDomain).filter(Boolean);
    const normalizedBlockedDomains = (blockedDomains || []).map(normalizeDomain).filter(Boolean);
    const rawResults = await withTimeout(
        ddgImageSearch({
            query,
            safe: safe ?? true,
            iterations: Math.max(1, Math.ceil(Math.min(requestedCount * 4, 200) / 100)),
            retries: 2,
        }) as Promise<RawImageSearchResult[]>,
        IMAGE_SEARCH_TIMEOUT_MS,
        "DuckDuckGo image search"
    );

    const seenImageUrls = new Set<string>();
    const candidates: ImageSearchResult[] = [];
    const filteredOut: ImageSearchFilterSummary = {
        invalid: 0,
        duplicate: 0,
        duplicateSource: 0,
        nearDuplicate: 0,
        domainLimit: 0,
        preflightFailed: 0,
        blockedDomain: 0,
        watermarkedSource: 0,
        outsideAllowedDomains: 0,
    };
    for (const raw of rawResults) {
        const normalized = normalizeImageResult(raw);
        if (!normalized) {
            filteredOut.invalid += 1;
            continue;
        }
        const normalizedImageUrl = normalizeImageUrlForDedupe(normalized.imageUrl);
        if (seenImageUrls.has(normalizedImageUrl)) {
            filteredOut.duplicate += 1;
            continue;
        }
        seenImageUrls.add(normalizedImageUrl);
        if (normalizedBlockedDomains.length > 0 && domainMatches(normalized.sourceDomain, normalizedBlockedDomains)) {
            filteredOut.blockedDomain += 1;
            continue;
        }
        if (normalizedAllowedDomains.length > 0 && !domainMatches(normalized.sourceDomain, normalizedAllowedDomains)) {
            filteredOut.outsideAllowedDomains += 1;
            continue;
        }
        if (shouldAvoidWatermark && isLikelyWatermarkedSource(normalized)) {
            filteredOut.watermarkedSource += 1;
            continue;
        }
        candidates.push(normalized);
    }

    const seenSourceUrls = new Set<string>();
    const domainCounts = new Map<string, number>();
    const dedupedResults: ImageSearchResult[] = [];
    for (const candidate of candidates.sort((a, b) => scoreImageResult(b) - scoreImageResult(a))) {
        const normalizedSourceUrl = normalizeSourceUrlForDedupe(candidate.sourceUrl);
        if (seenSourceUrls.has(normalizedSourceUrl)) {
            filteredOut.duplicateSource += 1;
            continue;
        }
        seenSourceUrls.add(normalizedSourceUrl);

        if (dedupedResults.some((result) => isNearDuplicateImage(result, candidate))) {
            filteredOut.nearDuplicate += 1;
            continue;
        }

        const sourceDomain = candidate.sourceDomain ? normalizeDomain(candidate.sourceDomain) : "";
        if (sourceDomain) {
            const currentDomainCount = domainCounts.get(sourceDomain) || 0;
            if (currentDomainCount >= IMAGE_SEARCH_MAX_PER_DOMAIN) {
                filteredOut.domainLimit += 1;
                continue;
            }
            domainCounts.set(sourceDomain, currentDomainCount + 1);
        }
        const hasUsableImage = await isUsableRemoteImage(candidate.thumbnailUrl)
            || (candidate.imageUrl !== candidate.thumbnailUrl && await isUsableRemoteImage(candidate.imageUrl));
        if (!hasUsableImage) {
            filteredOut.preflightFailed += 1;
            continue;
        }
        dedupedResults.push(candidate);
        if (dedupedResults.length >= requestedCount) break;
    }

    const results = dedupedResults;

    return {
        success: true,
        provider: "duckduckgo-images",
        query,
        safe: safe ?? true,
        avoidWatermark: shouldAvoidWatermark,
        results,
        count: results.length,
        filteredOut,
    };
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

    'image-search': {
        description: 'Search the web for image results using DuckDuckGo Images. Returns deduplicated, ranked image URLs, thumbnails, source pages, dimensions, and source domains. Defaults to avoiding stock/watermarked sources. Use this when the user needs visual references, logos, product/place/person images, or image URLs rather than normal web pages.',
        inputSchema: z.object({
            query: z.string().min(1).describe('The image search query'),
            count: z.number().min(1).max(IMAGE_SEARCH_MAX_RESULTS).optional().describe('Number of image results to return (default: 12, max: 50)'),
            safe: z.boolean().optional().describe('Enable DuckDuckGo safe search filtering (default: true)'),
            avoidWatermark: z.boolean().optional().describe('Avoid stock/watermarked image sources such as Alamy, Shutterstock, Getty, iStock, Freepik, and similar providers (default: true)'),
            allowedDomains: z.array(z.string().min(1)).optional().describe('Optional allowlist of source domains. When set, only images whose source page is on one of these domains are returned.'),
            blockedDomains: z.array(z.string().min(1)).optional().describe('Optional extra source domains to block in addition to the default watermark/stock filtering.'),
        }),
        isAvailable: async () => true,
        execute: async ({
            query,
            count,
            safe,
            avoidWatermark,
            allowedDomains,
            blockedDomains,
        }: {
            query: string;
            count?: number;
            safe?: boolean;
            avoidWatermark?: boolean;
            allowedDomains?: string[];
            blockedDomains?: string[];
        }) => {
            try {
                return await executeDuckDuckGoImageSearch({
                    query,
                    count,
                    safe,
                    avoidWatermark,
                    allowedDomains,
                    blockedDomains,
                });
            } catch (error) {
                return {
                    success: false,
                    provider: "duckduckgo-images",
                    query,
                    error: error instanceof Error ? error.message : 'DuckDuckGo image search failed',
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
