import fs from "node:fs/promises";
import path from "node:path";
import { LlmModelLimits, LlmProvider } from "@flazz/shared";
import z from "zod";
import { WorkDir } from "../config/config.js";
import { getModelsDevData } from "./models-dev.js";
import {
  buildCapabilityRegistryFromModelsDev,
  ModelCapabilityRegistry,
  resolveModelLimitsFromCapabilityRegistry,
} from "./model-capability-registry.js";

type ProviderConfig = z.infer<typeof LlmProvider>;
type ExplicitModelLimits = z.infer<typeof LlmModelLimits>;
type RegistryData = z.infer<typeof ModelCapabilityRegistry>;

export interface IModelCapabilityRepo {
  ensureRegistry(): Promise<void>;
  getRegistry(): Promise<RegistryData>;
  refreshRegistry(): Promise<RegistryData>;
  getStatus(): Promise<{
    syncedAt: string;
    source: "models.dev";
    sourceFetchedAt?: string;
    providerCount: number;
  }>;
  resolveLimits(provider: ProviderConfig, modelId: string): Promise<ExplicitModelLimits | null>;
}

const REGISTRY_PATH = path.join(WorkDir, "config", "model-capabilities.json");
const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;

function isFresh(syncedAt: string): boolean {
  const age = Date.now() - new Date(syncedAt).getTime();
  return age < REGISTRY_TTL_MS;
}

export class FSModelCapabilityRepo implements IModelCapabilityRepo {
  private cache?: RegistryData;

  private async readRegistryFile(): Promise<RegistryData | null> {
    try {
      const raw = await fs.readFile(REGISTRY_PATH, "utf8");
      const parsed = ModelCapabilityRegistry.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async writeRegistryFile(registry: RegistryData): Promise<void> {
    await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  }

  private async syncFromModelsDev(): Promise<RegistryData> {
    const { data, fetchedAt } = await getModelsDevData();
    const registry = buildCapabilityRegistryFromModelsDev({
      data,
      fetchedAt,
      syncedAt: new Date().toISOString(),
    });
    await this.writeRegistryFile(registry);
    this.cache = registry;
    return registry;
  }

  async ensureRegistry(): Promise<void> {
    const existing = this.cache ?? await this.readRegistryFile();
    if (existing && isFresh(existing.syncedAt)) {
      this.cache = existing;
      return;
    }

    try {
      await this.syncFromModelsDev();
    } catch (error) {
      if (existing) {
        this.cache = existing;
        return;
      }
      throw error;
    }
  }

  async getRegistry(): Promise<RegistryData> {
    await this.ensureRegistry();
    if (this.cache) {
      return this.cache;
    }
    const existing = await this.readRegistryFile();
    if (existing) {
      this.cache = existing;
      return existing;
    }
    return this.syncFromModelsDev();
  }

  async refreshRegistry(): Promise<RegistryData> {
    return this.syncFromModelsDev();
  }

  async getStatus(): Promise<{
    syncedAt: string;
    source: "models.dev";
    sourceFetchedAt?: string;
    providerCount: number;
  }> {
    const registry = await this.getRegistry();
    return {
      syncedAt: registry.syncedAt,
      source: registry.source,
      sourceFetchedAt: registry.sourceFetchedAt,
      providerCount: Object.keys(registry.providers).length,
    };
  }

  async resolveLimits(provider: ProviderConfig, modelId: string): Promise<ExplicitModelLimits | null> {
    const registry = await this.getRegistry();
    return resolveModelLimitsFromCapabilityRegistry({
      registry,
      provider,
      modelId,
    });
  }
}
