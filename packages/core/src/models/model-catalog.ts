import { getModelsDevData, ModelsDevResponse } from "./models-dev.js";
import z from "zod";

type ProviderSummary = {
  id: string;
  name: string;
  models: Array<{
    id: string;
    name?: string;
    release_date?: string;
  }>;
};

function scoreProvider(flavor: string, id: string, name: string): number {
  const normalizedId = id.toLowerCase();
  const normalizedName = name.toLowerCase();
  let score = 0;
  if (normalizedId === flavor) score += 100;
  if (normalizedName.includes(flavor)) score += 20;
  if (flavor === "google") {
    if (normalizedName.includes("gemini")) score += 10;
    if (normalizedName.includes("vertex")) score -= 5;
  }
  return score;
}

function pickProvider(
  data: z.infer<typeof ModelsDevResponse>,
  flavor: "openai" | "anthropic" | "google" | "openrouter",
) {
  if (data[flavor]) return data[flavor];
  let best: { score: number; provider: z.infer<typeof ModelsDevResponse>[string] } | null = null;
  for (const [id, provider] of Object.entries(data)) {
    const s = scoreProvider(flavor, id, provider.name);
    if (s <= 0) continue;
    if (!best || s > best.score) {
      best = { score: s, provider };
    }
  }
  return best?.provider ?? null;
}

function isStableModel(model: z.infer<typeof ModelsDevResponse>[string]["models"][string]): boolean {
  if (model.experimental) return false;
  if (model.status && ["alpha", "beta", "deprecated", "preview", "experimental"].includes(model.status.toLowerCase())) {
    return false;
  }
  return true;
}

function supportsToolCall(model: z.infer<typeof ModelsDevResponse>[string]["models"][string]): boolean {
  if (typeof model.tool_call === "boolean") return model.tool_call;
  if (model.tool_call && typeof model.tool_call === "object") return true;
  return false;
}

function normalizeModels(
  models: z.infer<typeof ModelsDevResponse>[string]["models"],
): ProviderSummary["models"] {
  const list = Object.entries(models)
    .map(([id, model]) => ({
      id: model.id ?? id,
      name: model.name,
      release_date: model.release_date,
      tool_call: model.tool_call,
      experimental: model.experimental,
      status: model.status,
    }))
    .filter((model) => isStableModel(model) && supportsToolCall(model))
    .map(({ id, name, release_date }) => ({ id, name, release_date }));

  list.sort((a, b) => {
    const aDate = a.release_date ? Date.parse(a.release_date) : 0;
    const bDate = b.release_date ? Date.parse(b.release_date) : 0;
    return bDate - aDate;
  });
  return list;
}

export async function listOnboardingModels(): Promise<{ providers: ProviderSummary[]; lastUpdated?: string }> {
  const { data, fetchedAt } = await getModelsDevData();
  const providers: ProviderSummary[] = [];
  const flavors: Array<"openai" | "anthropic" | "google" | "openrouter"> = ["openai", "anthropic", "google", "openrouter"];

  for (const flavor of flavors) {
    const provider = pickProvider(data, flavor);
    if (!provider) continue;
    providers.push({
      id: flavor,
      name: provider.name,
      models: normalizeModels(provider.models),
    });
  }

  return { providers, lastUpdated: fetchedAt };
}

