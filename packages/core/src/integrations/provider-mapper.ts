import {
  getProviderActionPreferences,
  type ProviderActionPreferences,
} from "./provider-action-map.js";
import {
  getProviderStatus,
  getSupportedProviderDescriptor,
  listProviderStatuses,
  listSupportedProviderDescriptors,
} from "./provider-registry.js";

export class ProviderMapper {
  getDescriptor(app: string) {
    return getSupportedProviderDescriptor(app);
  }

  getStatus(app: string, connected = false) {
    return getProviderStatus(app, connected);
  }

  getPreferredActions(app: string): ProviderActionPreferences {
    return getProviderActionPreferences(app);
  }

  listDescriptors() {
    return listSupportedProviderDescriptors();
  }

  listStatuses(apps: string[]) {
    return listProviderStatuses(apps);
  }
}
