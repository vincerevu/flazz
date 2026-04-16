import type { IntegrationRetrievalMode } from "./types.js";

export function getModeLimit(mode: IntegrationRetrievalMode) {
  switch (mode) {
    case "compact":
      return 20;
    case "summary":
      return 10;
    case "detailed_structured":
      return 10;
    case "slices":
      return 5;
    case "full":
      return 3;
    default:
      return 10;
  }
}

export function downgradeMode(mode: IntegrationRetrievalMode): IntegrationRetrievalMode {
  switch (mode) {
    case "full":
      return "slices";
    case "slices":
      return "summary";
    case "summary":
    case "detailed_structured":
      return "compact";
    default:
      return "compact";
  }
}

