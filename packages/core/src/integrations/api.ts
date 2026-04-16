import { z } from "zod";
import { providerMapper } from "../di/container.js";
import { composioAccountsRepo } from "../composio/repo.js";
import { IntegrationProviderStatus } from "@flazz/shared/dist/integration-resources.js";

type ProviderStatusRecord = z.infer<typeof IntegrationProviderStatus>;

export function listIntegrationResourceCatalog() {
  const connectedApps = composioAccountsRepo.getConnectedToolkits();
  const providers = IntegrationProviderStatus.array().parse(providerMapper.listStatuses(connectedApps));
  return {
    providers,
    count: providers.length,
    normalizedSupportedCount: providers.filter((provider: ProviderStatusRecord) => provider.normalizedSupported).length,
    fullSupportCount: providers.filter((provider: ProviderStatusRecord) => provider.normalizedSupport === "full").length,
    readOnlySupportCount: providers.filter((provider: ProviderStatusRecord) => provider.normalizedSupport === "read_only").length,
  };
}
