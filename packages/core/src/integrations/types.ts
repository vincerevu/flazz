import {
  IntegrationCapability,
  IntegrationResourceType,
  IntegrationRetrievalMode,
  ProviderResourceDescriptor,
} from "@flazz/shared";
import { z } from "zod";

export type IntegrationCapability = z.infer<typeof IntegrationCapability>;
export type IntegrationResourceType = z.infer<typeof IntegrationResourceType>;
export type IntegrationRetrievalMode = z.infer<typeof IntegrationRetrievalMode>;
export type ProviderResourceDescriptor = z.infer<typeof ProviderResourceDescriptor>;

