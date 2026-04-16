import { ProviderResourceDescriptor } from "@flazz/shared";

const PROVIDER_MAP = ProviderResourceDescriptor.array().parse([
  { app: "gmail", resourceType: "message", capabilities: ["list", "search", "read", "reply"] },
  { app: "outlook", resourceType: "message", capabilities: ["list", "search", "read", "reply"] },
  { app: "slack", resourceType: "message", capabilities: ["list", "search", "read", "reply"] },
  { app: "notion", resourceType: "document", capabilities: ["list", "search", "read", "create", "update"] },
  { app: "googledocs", resourceType: "document", capabilities: ["list", "search", "read", "create", "update"] },
  { app: "jira", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"] },
  { app: "linear", resourceType: "ticket", capabilities: ["list", "search", "read", "create", "update", "comment"] },
  { app: "googlecalendar", resourceType: "event", capabilities: ["list", "read", "create", "update"] },
  { app: "googledrive", resourceType: "file", capabilities: ["list", "search", "read"] },
]);

export class ProviderMapper {
  getDescriptor(app: string) {
    return PROVIDER_MAP.find((entry) => entry.app === app) ?? null;
  }

  listDescriptors() {
    return [...PROVIDER_MAP];
  }
}

