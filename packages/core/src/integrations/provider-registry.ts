import { z } from "zod";
import { IntegrationProviderStatus, ProviderResourceDescriptor } from "@flazz/shared/dist/integration-resources.js";
import { PROVIDER_CATALOG, getProviderCatalogEntry } from "./provider-catalog.js";

type ProviderStatusRecord = z.infer<typeof IntegrationProviderStatus>;
type ProviderDescriptorRecord = z.infer<typeof ProviderResourceDescriptor>;

const SUPPORTED_PROVIDER_DESCRIPTORS: ProviderDescriptorRecord[] = ProviderResourceDescriptor.array().parse(
  PROVIDER_CATALOG.filter((entry) => entry.normalizedSupport !== "none" && entry.resourceType)
    .map((entry) => ({
      app: entry.app,
      resourceType: entry.resourceType!,
      capabilities: entry.capabilities,
    })),
);
const UNSUPPORTED_CONNECTED_PROVIDERS: ProviderStatusRecord[] = IntegrationProviderStatus.array().parse(
  PROVIDER_CATALOG.filter((entry) => entry.normalizedSupport === "none").map((entry) => ({
    app: entry.app,
    connected: false,
    normalizedSupported: false,
    normalizedSupport: "none",
    wave: entry.wave,
    capabilities: entry.capabilities,
    note: entry.note,
  })),
);

const PROVIDER_STATUS_INDEX = new Map<string, ProviderStatusRecord>(
  [
    ...SUPPORTED_PROVIDER_DESCRIPTORS.map((descriptor): [string, ProviderStatusRecord] => [
      descriptor.app,
      {
        app: descriptor.app,
        connected: false,
        normalizedSupported: true,
        normalizedSupport: getProviderCatalogEntry(descriptor.app)?.normalizedSupport ?? "read_only",
        wave: getProviderCatalogEntry(descriptor.app)?.wave,
        resourceType: descriptor.resourceType,
        capabilities: descriptor.capabilities,
        note: getProviderCatalogEntry(descriptor.app)?.note,
      },
    ]),
    ...UNSUPPORTED_CONNECTED_PROVIDERS.map((provider): [string, ProviderStatusRecord] => [provider.app, provider]),
  ],
);

export function getSupportedProviderDescriptor(app: string) {
  return SUPPORTED_PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.app === app) ?? null;
}

export function listSupportedProviderDescriptors() {
  return [...SUPPORTED_PROVIDER_DESCRIPTORS];
}

export function getProviderStatus(app: string, connected: boolean) {
  const base = PROVIDER_STATUS_INDEX.get(app);
  if (base) {
    return {
      ...base,
      connected,
    };
  }

  const catalogEntry = getProviderCatalogEntry(app);
  if (catalogEntry) {
    return IntegrationProviderStatus.parse({
      app,
      connected,
      normalizedSupported: catalogEntry.normalizedSupport !== "none",
      normalizedSupport: catalogEntry.normalizedSupport,
      wave: catalogEntry.wave,
      resourceType: catalogEntry.resourceType,
      capabilities: catalogEntry.capabilities,
      note: catalogEntry.note,
    });
  }

  return IntegrationProviderStatus.parse({
    app,
    connected,
    normalizedSupported: false,
    normalizedSupport: "none",
    wave: undefined,
    capabilities: [],
    note: "Connected through Composio, but no normalized provider registry entry exists yet.",
  });
}

export function listProviderStatuses(apps: string[]) {
  return apps.map((app) => getProviderStatus(app, true));
}
