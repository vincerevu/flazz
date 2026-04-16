import { ProviderResourceDescriptor } from "@flazz/shared";
import { providerMapper } from "../di/container.js";

export function listIntegrationResourceCatalog() {
  const providers = ProviderResourceDescriptor.array().parse(providerMapper.listDescriptors());
  return {
    providers,
    count: providers.length,
  };
}
