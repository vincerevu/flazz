export function buildRepairSuggestion(input: {
  skillName: string;
  failureSummary: string;
  category: string;
}) {
  return [
    `Target skill: ${input.skillName}`,
    `Failure category: ${input.category}`,
    `Suggested next step: inspect the workflow and add a missing validation, sequencing, or guardrail step tied to: ${input.failureSummary}`,
  ].join("\n");
}
