import { Run } from "@flazz/shared";
import { z } from "zod";

type RunRecord = z.infer<typeof Run>;

export function classifyRunFailure(run: RunRecord): {
  category:
    | "missing-context"
    | "wrong-tool"
    | "wrong-sequence"
    | "missing-validation"
    | "missing-guardrail"
    | "output-formatting"
    | "permission-flow"
    | "execution-error"
    | "user-stopped"
    | "unknown";
  summary: string;
} {
  if (run.log.some((event) => event.type === "run-stopped")) {
    return {
      category: "user-stopped",
      summary: "The run was stopped before completion.",
    };
  }

  if (run.log.some((event) => event.type === "tool-permission-request")) {
    return {
      category: "permission-flow",
      summary: "The run hit a permission or confirmation boundary.",
    };
  }

  const errorEvent = run.log.find((event) => event.type === "error");
  if (errorEvent && errorEvent.type === "error") {
    const lower = errorEvent.error.toLowerCase();
    if (lower.includes("format")) {
      return {
        category: "output-formatting",
        summary: errorEvent.error,
      };
    }
    if (lower.includes("validation")) {
      return {
        category: "missing-validation",
        summary: errorEvent.error,
      };
    }
    return {
      category: "execution-error",
      summary: errorEvent.error,
    };
  }

  return {
    category: "unknown",
    summary: "The run failed without a more specific classified reason.",
  };
}

