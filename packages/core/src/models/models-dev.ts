import fs from "node:fs/promises";
import path from "node:path";
import z from "zod";
import { WorkDir } from "../config/config.js";

const CACHE_PATH = path.join(WorkDir, "config", "models.dev.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ModelsDevFlag = z.union([z.boolean(), z.record(z.string(), z.unknown())]);

const ModelsDevModel = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  release_date: z.string().optional(),
  tool_call: ModelsDevFlag.optional(),
  experimental: ModelsDevFlag.optional(),
  status: z.string().optional(),
  limit: z.object({
    context: z.number().int().nonnegative().optional(),
    input: z.number().int().nonnegative().optional(),
    output: z.number().int().nonnegative().optional(),
  }).optional(),
}).passthrough();

const ModelsDevProvider = z.object({
  id: z.string().optional(),
  name: z.string(),
  models: z.record(z.string(), ModelsDevModel),
}).passthrough();

export const ModelsDevResponse = z.record(z.string(), ModelsDevProvider);

type CacheFile = {
  fetchedAt: string;
  data: unknown;
};

async function readCache(): Promise<CacheFile | null> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

async function writeCache(data: unknown): Promise<void> {
  const payload: CacheFile = {
    fetchedAt: new Date().toISOString(),
    data,
  };
  await fs.writeFile(CACHE_PATH, JSON.stringify(payload, null, 2));
}

async function fetchModelsDev(): Promise<unknown> {
  const response = await fetch("https://models.dev/api.json", {
    headers: { "User-Agent": "Flazz" },
  });
  if (!response.ok) {
    throw new Error(`models.dev fetch failed: ${response.status}`);
  }
  return response.json();
}

function isCacheFresh(fetchedAt: string): boolean {
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age < CACHE_TTL_MS;
}

export async function getModelsDevData(): Promise<{ data: z.infer<typeof ModelsDevResponse>; fetchedAt?: string }> {
  const cached = await readCache();
  if (cached?.fetchedAt && isCacheFresh(cached.fetchedAt)) {
    const parsed = ModelsDevResponse.safeParse(cached.data);
    if (parsed.success) {
      return { data: parsed.data, fetchedAt: cached.fetchedAt };
    }
  }

  try {
    const fresh = await fetchModelsDev();
    const parsed = ModelsDevResponse.parse(fresh);
    await writeCache(parsed);
    return { data: parsed, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (cached) {
      const parsed = ModelsDevResponse.safeParse(cached.data);
      if (parsed.success) {
        return { data: parsed.data, fetchedAt: cached.fetchedAt };
      }
    }
    throw error;
  }
}
