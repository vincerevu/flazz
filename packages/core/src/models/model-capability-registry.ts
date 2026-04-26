import { LlmModelLimits, LlmProvider } from "@flazz/shared";
import z from "zod";

type ProviderConfig = z.infer<typeof LlmProvider>;
type ExplicitModelLimits = z.infer<typeof LlmModelLimits>;

const ModelsDevModel = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
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

export const ModelCapabilityModel = z.object({
  id: z.string(),
  aliases: z.array(z.string()),
  limits: LlmModelLimits,
});

export const ModelCapabilityProvider = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  models: z.record(z.string(), ModelCapabilityModel),
});

export const ModelCapabilityRegistry = z.object({
  syncedAt: z.iso.datetime(),
  source: z.literal("models.dev"),
  sourceFetchedAt: z.iso.datetime().optional(),
  providers: z.record(z.string(), ModelCapabilityProvider),
});

type CapabilityRegistryData = z.infer<typeof ModelCapabilityRegistry>;

function uniqueNormalized(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter(Boolean).map((value) => value!.toLowerCase()))];
}

function buildStringVariants(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const withoutProviderPrefix = lower.includes("/")
    ? lower.slice(lower.lastIndexOf("/") + 1)
    : lower;
  const hyphenated = lower.replace(/[\s_/.:]+/g, "-");
  const compact = lower.replace(/[\s_/.:]+/g, "");
  const withoutProviderPrefixHyphenated = withoutProviderPrefix.replace(/[\s_/.:]+/g, "-");
  const withoutProviderPrefixCompact = withoutProviderPrefix.replace(/[\s_/.:]+/g, "");

  return uniqueNormalized([
    raw,
    lower,
    withoutProviderPrefix,
    hyphenated,
    compact,
    withoutProviderPrefixHyphenated,
    withoutProviderPrefixCompact,
  ]);
}

function stripKnownModelSuffixes(value: string): string[] {
  const patterns = [
    /[-_:/.]free$/i,
    /[-_:/.]public$/i,
    /[-_:/.]latest$/i,
    /[-_:/.]preview$/i,
    /[-_:/.]beta$/i,
    /[-_:/.]thinking$/i,
    /[-_:/.]highspeed$/i,
    /[-_:/.]fast$/i,
  ];

  const outputs = new Set<string>([value]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of Array.from(outputs)) {
      for (const pattern of patterns) {
        const next = candidate.replace(pattern, "");
        if (next !== candidate && next.trim()) {
          if (!outputs.has(next)) {
            outputs.add(next);
            changed = true;
          }
        }
      }
    }
  }

  return Array.from(outputs);
}

function inferProviderAliasesFromBaseUrl(baseURL?: string): string[] {
  if (!baseURL) return [];
  const normalized = baseURL.toLowerCase();
  const aliases: string[] = [];

  if (normalized.includes("minimax")) aliases.push("minimax");
  if (normalized.includes("openrouter")) aliases.push("openrouter");
  if (normalized.includes("anthropic")) aliases.push("anthropic");
  if (normalized.includes("openai")) aliases.push("openai");
  if (normalized.includes("googleapis") || normalized.includes("gemini") || normalized.includes("vertex")) {
    aliases.push("google", "google-vertex");
  }

  return aliases;
}

function buildModelIdCandidates(modelId: string): string[] {
  const raw = modelId.trim();
  const seedCandidates = buildStringVariants(raw);
  const strippedCandidates = seedCandidates.flatMap(stripKnownModelSuffixes);
  const canonicalBase = uniqueNormalized(strippedCandidates).flatMap((candidate) => {
    const minimaxCanonical = candidate.replace(/^minimax[-_/]?/i, "");
    return uniqueNormalized([
      candidate,
      minimaxCanonical,
    ]);
  });
  const canonical = canonicalBase[0] ?? raw.toLowerCase();

  const minimaxCandidates = canonical.startsWith("m")
    ? [
        `minimax-${canonical}`,
        `minimax-${canonical}-highspeed`,
        `minimax-${canonical}-free`,
        `MiniMax-${canonical.toUpperCase()}`,
        `MiniMax-${canonical.toUpperCase()}-highspeed`,
      ]
    : [];

  return uniqueNormalized([
    raw,
    ...seedCandidates,
    ...strippedCandidates,
    ...canonicalBase,
    canonical,
    ...minimaxCandidates,
  ]);
}

function normalizeModelKey(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildProviderAliases(id: string, name: string, providerId?: string): string[] {
  return uniqueNormalized([
    id,
    name,
    providerId,
    id.replace(/\s+/g, "-"),
    providerId?.replace(/\s+/g, "-"),
  ]);
}

function buildModelAliases(id: string, model: z.infer<typeof ModelsDevModel>): string[] {
  return uniqueNormalized([
    id,
    model.id,
    model.name,
    ...buildStringVariants(id),
    ...(model.id ? buildStringVariants(model.id) : []),
    ...(model.name ? buildStringVariants(model.name) : []),
  ]);
}

export function providerAliasCandidates(provider: ProviderConfig): string[] {
  const aliases: Record<z.infer<typeof LlmProvider>["flavor"], string[]> = {
    openai: ["openai"],
    anthropic: ["anthropic"],
    google: ["google"],
    openrouter: ["openrouter"],
    aigateway: ["gateway", "aigateway"],
    ollama: ["ollama", "ollama-cloud"],
    "openai-compatible": ["openai-compatible"],
    deepseek: ["deepseek"],
    groq: ["groq"],
    mistral: ["mistral"],
    xai: ["xai", "x-ai"],
    togetherai: ["togetherai", "together"],
    perplexity: ["perplexity"],
    azure: ["azure", "openai"],
    "amazon-bedrock": ["amazon-bedrock", "bedrock"],
    cohere: ["cohere"],
    "google-vertex": ["google-vertex", "google", "vertex"],
    "fireworks-ai": ["fireworks-ai", "fireworks"],
    deepinfra: ["deepinfra"],
    "github-models": ["github-models", "github"],
    "cloudflare-workers-ai": ["cloudflare-workers-ai", "cloudflare"],
    lmstudio: ["lmstudio"],
    zhipuai: ["zhipuai"],
    moonshotai: ["moonshotai", "moonshot"],
    siliconflow: ["siliconflow"],
    requesty: ["requesty"],
  };
  return uniqueNormalized([
    ...(aliases[provider.flavor] ?? [provider.flavor]),
    ...inferProviderAliasesFromBaseUrl(provider.baseURL),
  ]);
}

export function normalizeResolvedLimits(model: z.infer<typeof ModelsDevModel>): ExplicitModelLimits | null {
  const context = model.limit?.context;
  if (!context || context <= 0) {
    return null;
  }
  return LlmModelLimits.parse({
    context,
    input: model.limit?.input && model.limit.input > 0 ? model.limit.input : undefined,
    output: model.limit?.output && model.limit.output > 0 ? model.limit.output : undefined,
  });
}

export function buildCapabilityRegistryFromModelsDev(args: {
  data: z.infer<typeof ModelsDevResponse>;
  fetchedAt?: string;
  syncedAt?: string;
}): CapabilityRegistryData {
  const providers = Object.fromEntries(
    Object.entries(args.data).map(([providerKey, provider]) => {
      const models = Object.fromEntries(
        Object.entries(provider.models)
          .map(([modelKey, model]) => {
            const limits = normalizeResolvedLimits(model);
            if (!limits) return null;
            const normalizedId = model.id ?? modelKey;
            return [
              normalizeModelKey(normalizedId),
              {
                id: normalizedId,
                aliases: buildModelAliases(modelKey, model),
                limits,
              },
            ] as const;
          })
          .filter((entry): entry is readonly [string, z.infer<typeof ModelCapabilityModel>] => Boolean(entry)),
      );

      return [
        providerKey.toLowerCase(),
        {
          id: provider.id ?? providerKey,
          name: provider.name,
          aliases: buildProviderAliases(providerKey, provider.name, provider.id),
          models,
        },
      ] as const;
    }),
  );

  return ModelCapabilityRegistry.parse({
    syncedAt: args.syncedAt ?? new Date().toISOString(),
    source: "models.dev",
    sourceFetchedAt: args.fetchedAt,
    providers,
  });
}

export function resolveModelLimitsFromCapabilityRegistry(args: {
  registry: CapabilityRegistryData;
  provider: ProviderConfig;
  modelId: string;
}): ExplicitModelLimits | null {
  const providerAliases = new Set(providerAliasCandidates(args.provider));
  const modelIdCandidates = buildModelIdCandidates(args.modelId);
  const normalizedCandidates = new Set(modelIdCandidates.map(normalizeModelKey));

  const providerEntries = Object.values(args.registry.providers);
  const prioritizedProviders = providerEntries.filter((entry) =>
    entry.aliases.some((alias) => providerAliases.has(alias)),
  );
  const candidateProviders = prioritizedProviders.length > 0 ? prioritizedProviders : providerEntries;

  for (const providerEntry of candidateProviders) {
    for (const [modelKey, model] of Object.entries(providerEntry.models)) {
      if (
        model.aliases.some((alias) => modelIdCandidates.includes(alias.toLowerCase()))
        || normalizedCandidates.has(modelKey)
        || normalizedCandidates.has(normalizeModelKey(model.id))
      ) {
        return model.limits;
      }
    }
  }

  return null;
}
