import { Run } from "@flazz/shared";
import { z } from "zod";

type RunRecord = z.infer<typeof Run>;

export function buildRepairEvidence(
  run: RunRecord,
  loadedSkillName: string,
  failure: { category: string; summary: string }
) {
  const recentToolCalls = run.log
    .filter((event) => event.type === "tool-invocation")
    .slice(-5)
    .map((event) => event.toolName);

  const lastAssistantMessage = [...run.log]
    .reverse()
    .find((event) => event.type === "message" && event.message.role === "assistant");

  const assistantExcerpt =
    lastAssistantMessage && lastAssistantMessage.type === "message"
      ? JSON.stringify(lastAssistantMessage.message.content).slice(0, 500)
      : "";

  const evidenceSummary = [
    `Skill: ${loadedSkillName}`,
    `Failure category: ${failure.category}`,
    `Summary: ${failure.summary}`,
    recentToolCalls.length ? `Recent tools: ${recentToolCalls.join(", ")}` : "",
    assistantExcerpt ? `Assistant excerpt: ${assistantExcerpt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    evidenceSummary,
    proposedPatch: `Review the procedure in '${loadedSkillName}' for a missing step or guardrail related to: ${failure.summary}`,
  };
}

