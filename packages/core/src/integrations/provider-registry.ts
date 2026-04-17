import { IntegrationProviderStatus, ProviderResourceDescriptor } from "@flazz/shared/dist/integration-resources.js";
import { PROVIDER_CATALOG, getProviderCatalogEntry } from "./provider-catalog.js";

type ProviderStatusRecord = {
  app: string;
  connected: boolean;
  normalizedSupported: boolean;
  normalizedSupport: "none" | "read_only" | "full";
  wave?: "p0" | "p1" | "p2";
  genericRequestPolicy?: "list_recent_first" | "search_first" | "needs_explicit_scope";
  genericRequestTarget?: string;
  resourceType?: "message" | "document" | "ticket" | "event" | "file" | "record" | "code" | "spreadsheet";
  capabilities: Array<"list" | "search" | "read" | "create" | "update" | "reply" | "comment">;
  note?: string;
};

type ProviderDescriptorRecord = {
  app: string;
  resourceType: NonNullable<ProviderStatusRecord["resourceType"]>;
  capabilities: ProviderStatusRecord["capabilities"];
};

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
    genericRequestPolicy: entry.genericRequestPolicy,
    genericRequestTarget: entry.genericRequestTarget,
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
        genericRequestPolicy: getProviderCatalogEntry(descriptor.app)?.genericRequestPolicy,
        genericRequestTarget: getProviderCatalogEntry(descriptor.app)?.genericRequestTarget,
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
      genericRequestPolicy: catalogEntry.genericRequestPolicy,
      genericRequestTarget: catalogEntry.genericRequestTarget,
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
    genericRequestPolicy: undefined,
    genericRequestTarget: undefined,
    capabilities: [],
    note: "Connected through Composio, but no normalized provider registry entry exists yet.",
  });
}

export function listProviderStatuses(apps: string[]) {
  return apps.map((app) => getProviderStatus(app, true));
}
