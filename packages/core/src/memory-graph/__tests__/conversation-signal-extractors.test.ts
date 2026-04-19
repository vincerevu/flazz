import test from "node:test";
import assert from "node:assert/strict";
import { extractConversationSignalsFromRunMemory } from "../conversation-signal-extractors.js";

test("extractConversationSignalsFromRunMemory emits preference and correction signals", () => {
  const signals = extractConversationSignalsFromRunMemory({
    id: "runmem-1",
    runId: "run-1",
    agentId: "copilot",
    taskType: "integration-listItemsCompact",
    summary: "Daily check run.",
    firstUserMessage: "For next time, prefer GitHub and Google Calendar for daily checks.",
    entityRefs: ["GitHub", "Google", "Calendar"],
    topicRefs: [],
    projectRefs: [],
    skillRefs: ["daily-check"],
    toolRefs: ["integration-listItemsCompact", "integration-getItemSummary"],
    artifactRefs: [],
    outcome: "success",
    failureCategory: undefined,
    corrections: ["Không phải Outlook nữa, use Google Calendar instead."],
    createdAt: "2026-04-18T14:00:00.000Z",
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.kind, "preference");
  assert.equal(signals[1]?.kind, "correction");
  assert.equal(signals[1]?.confidence, 0.82);
});

test("extractConversationSignalsFromRunMemory skips filler conversations", () => {
  const signals = extractConversationSignalsFromRunMemory({
    id: "runmem-2",
    runId: "run-2",
    agentId: "copilot",
    taskType: "workspace-readFile",
    summary: "Tiny run.",
    firstUserMessage: "ok",
    entityRefs: [],
    topicRefs: [],
    projectRefs: [],
    skillRefs: [],
    toolRefs: ["workspace-readFile"],
    artifactRefs: [],
    outcome: "success",
    failureCategory: undefined,
    corrections: ["thanks"],
    createdAt: "2026-04-18T14:00:00.000Z",
  });

  assert.equal(signals.length, 0);
});
