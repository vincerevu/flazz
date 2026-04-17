import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompactionReferenceMessage,
  deriveActiveTaskState,
  estimateMessagesTokens,
  estimateMessageTokens,
  parseCarryover,
  prepareCompactedContext,
} from "../context-compaction.js";

test("buildCompactionReferenceMessage creates a system reference note", () => {
  const message = buildCompactionReferenceMessage("Summary body");
  assert.equal(message.role, "system");
  assert.match(message.content, /\[COMPACTED CONTEXT/);
  assert.match(message.content, /Summary body/);
});

test("estimateMessageTokens counts assistant tool payloads", () => {
  const estimate = estimateMessageTokens({
    role: "assistant",
    content: [
      { type: "text", text: "hello world" },
      { type: "tool-call", toolCallId: "tc1", toolName: "search", arguments: { query: "token budget" } },
    ],
  });
  assert.ok(estimate > 0);
});

test("prepareCompactedContext prepends a summary system message when history exceeds window", async () => {
  const model = {} as never;
  const original = [
    { role: "user", content: "old request" },
    { role: "assistant", content: [{ type: "text", text: "old answer" }] },
    { role: "user", content: "new request" },
    { role: "assistant", content: [{ type: "text", text: "new answer" }] },
  ] as const;

  const result = await prepareCompactedContext({
    messages: original as never,
    model,
    maxHistory: 2,
    previousSummary: "Prior work summary",
    previousAnchorHash: undefined,
  });

  assert.equal(result.messages[0]?.role, "system");
  assert.ok(result.snapshot);
  assert.equal(result.snapshot?.summary, "Prior work summary");
  assert.equal(result.snapshot?.reused, true);
});

test("prepareCompactedContext reuses prior summary when anchor is unchanged", async () => {
  const model = {} as never;
  const messages = [
    { role: "user", content: "first" },
    { role: "assistant", content: [{ type: "text", text: "first answer" }] },
    { role: "user", content: "second" },
  ] as const;

  const first = await prepareCompactedContext({
    messages: messages as never,
    model,
    maxHistory: 2,
    previousSummary: "Reusable summary",
  });

  const second = await prepareCompactedContext({
    messages: messages as never,
    model,
    maxHistory: 2,
    previousSummary: first.snapshot?.summary,
    previousAnchorHash: first.snapshot?.anchorHash,
  });

  assert.ok(second.snapshot);
  assert.equal(second.snapshot?.reused, true);
  assert.equal(second.snapshot?.summary, "Reusable summary");
  assert.ok(estimateMessagesTokens(second.messages) > 0);
  assert.ok((second.snapshot?.provenanceRefs.length ?? 0) >= 0);
});

test("parseCarryover extracts structured sections from a compacted summary", () => {
  const carryover = parseCarryover([
    "## Goal",
    "- Finish the GitHub integration audit",
    "## Instructions",
    "- Keep responses concise",
    "## Decisions",
    "- Notifications inbox is unsupported",
    "## Progress",
    "- Provider matrix cleaned",
    "## Relevant Files and Tools",
    "- packages/core/src/integrations/provider-catalog.ts",
    "## Open Questions / Next Steps",
    "- Verify p1 providers",
  ].join("\n"));

  assert.deepEqual(carryover.goal, ["Finish the GitHub integration audit"]);
  assert.deepEqual(carryover.decisions, ["Notifications inbox is unsupported"]);
  assert.equal(carryover.relevantFilesAndTools.length, 1);
});

test("deriveActiveTaskState maps carryover into a smaller runtime task state", () => {
  const taskState = deriveActiveTaskState({
    goal: ["Ship the compaction rewrite"],
    instructions: ["Keep UI minimal", "Preserve task state"],
    decisions: ["Use trigger/target thresholds"],
    progress: ["Phase 1 complete", "Phase 2 complete"],
    relevantFilesAndTools: ["D:\\flazz\\packages\\core\\src\\agents\\runtime.ts", "tool:web-search"],
    openQuestionsNextSteps: ["Add richer metrics"],
  });

  assert.deepEqual(taskState.objective, ["Ship the compaction rewrite"]);
  assert.equal(taskState.references.length, 2);
  assert.equal(taskState.nextSteps[0], "Add richer metrics");
});

test("prepareCompactedContext includes provenance references from omitted messages", async () => {
  const model = {} as never;
  const messages = [
    {
      role: "user",
      content: [
        { type: "attachment", path: "D:\\flazz\\notes\\plan.md", filename: "plan.md", mimeType: "text/markdown" },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: "call-1", toolName: "web-search", arguments: { query: "OpenAI news" } },
      ],
    },
    { role: "user", content: "recent" },
  ] as const;

  const result = await prepareCompactedContext({
    messages: messages as never,
    model,
    maxHistory: 1,
    previousSummary: [
      "## Goal",
      "- Goal",
      "## Instructions",
      "- Instruction",
      "## Decisions",
      "- Decision",
      "## Progress",
      "- Progress",
      "## Relevant Files and Tools",
      "- D:\\flazz\\notes\\plan.md",
      "## Open Questions / Next Steps",
      "- Next",
    ].join("\n"),
  });

  assert.ok(result.snapshot);
  assert.ok(result.snapshot?.provenanceRefs.some((ref) => ref.includes("plan.md")));
  assert.ok(result.snapshot?.provenanceRefs.some((ref) => ref.includes("tool:web-search")));
});
