import type { IntegrationCapability } from "./types.js";

export type WritePolicyInput = {
  app: string;
  capability: IntegrationCapability;
  confirmed?: boolean;
};

export function enforceWritePolicy(input: WritePolicyInput) {
  const writeCapabilities: IntegrationCapability[] = ["reply", "create", "update", "comment"];
  if (!writeCapabilities.includes(input.capability)) {
    return { ok: true as const };
  }

  if (!input.confirmed) {
    return {
      ok: false as const,
      error: `Write action '${input.capability}' for ${input.app} requires explicit confirmation. Pass confirmed=true only after user approval.`,
    };
  }

  return { ok: true as const };
}
