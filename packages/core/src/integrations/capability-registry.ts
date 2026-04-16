import { ProviderMapper } from "./provider-mapper.js";

export class CapabilityRegistry {
  constructor(private providerMapper: ProviderMapper) {}

  supports(app: string, capability: string): boolean {
    const descriptor = this.providerMapper.getDescriptor(app);
    return !!descriptor?.capabilities.includes(capability as never);
  }
}

