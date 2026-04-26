import test from "node:test";
import assert from "node:assert/strict";
import {
  pruneToolOutputs,
  PRUNE_PROTECT_BUDGET,
} from "../context-pruner.js";
import type { z } from "zod";
import type { MessageList } from "@flazz/shared";

type Msg = z.infer<typeof MessageList>[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a tool message with a given content size */
function toolMsg(toolName: string, chars: number, toolCallId = "call-1"): Msg {
  return {
    role: "tool",
    toolCallId,
    toolName,
    content: "x".repeat(chars),
  };
}

/** Build a user message */
function userMsg(text = "hello"): Msg {
  return { role: "user", content: text };
}

/** Build an assistant message */
function assistantMsg(text = "ok"): Msg {
  return { role: "assistant", content: text };
}

// PRUNE_PROTECT_BUDGET = 40_000 tokens = 160_000 chars (4 chars per token)
// PRUNE_MIN_SAVINGS    = 20_000 tokens
// A "big" tool result that is outside the protected window
const BIG_CHARS = 240_000; // ~60_000 tokens — well outside protect window and saves >20k
// Need enough chars to fill protect window (40_000 tokens × 4 chars/token = 160_000 chars)
const PROTECT_FILL_CHARS = PRUNE_PROTECT_BUDGET * 4; // 160_000 chars = exactly 40_000 tokens

// ─── Tests: no-op cases ───────────────────────────────────────────────────────

test("pruneToolOutputs: returns same reference when nothing to prune", () => {
  const messages: Msg[] = [
    userMsg("hi"),
    assistantMsg("hi back"),
  ];
  const result = pruneToolOutputs(messages);
  assert.equal(result.prunedCount, 0);
  assert.equal(result.tokensSaved, 0);
  assert.equal(result.messages, messages); // same reference — no copy
});

test("pruneToolOutputs: does not prune when savings < PRUNE_MIN_SAVINGS", () => {
  // Single old tool result with tiny content. Savings = (1000/4 - 200/4) ≈ 200 tokens < 20_000.
  const tinyOld = 1_000; // chars → ~250 tokens, saves ~200 tokens after prune — way below min
  const messages: Msg[] = [
    toolMsg("web-search", tinyOld, "call-old"),
    // Fill protect window so call-old is a candidate
    toolMsg("bash", PROTECT_FILL_CHARS, "call-fill"),
    userMsg(),
  ];
  const result = pruneToolOutputs(messages);
  assert.equal(result.prunedCount, 0);
  assert.equal(result.tokensSaved, 0);
});

// ─── Tests: pruning applied ───────────────────────────────────────────────────

test("pruneToolOutputs: prunes old tool results outside protected window", () => {
  // Pattern: big old tool result, then enough tool results to fill protect window,
  // then recent conversation
  const messages: Msg[] = [
    toolMsg("bash", BIG_CHARS, "call-old"),          // candidate — outside protect window
    toolMsg("bash", PROTECT_FILL_CHARS, "call-p1"),  // fills protect window (40k tokens)
    userMsg("continue"),
    assistantMsg("done"),
  ];

  const result = pruneToolOutputs(messages);
  assert.ok(result.prunedCount >= 1, `Expected at least 1 pruned, got ${result.prunedCount}`);
  assert.ok(result.tokensSaved > 0);
  // Pruned message should be shorter than original
  const oldMsg = result.messages[0];
  assert.ok(oldMsg.role === "tool");
  assert.ok(
    oldMsg.content.length < BIG_CHARS,
    `Expected pruned content shorter than ${BIG_CHARS}, got ${oldMsg.content.length}`
  );
  assert.ok(
    oldMsg.content.includes("[pruned for context budget]"),
    "Expected pruned marker in content"
  );
});

// ─── Tests: protected tools ───────────────────────────────────────────────────

test("pruneToolOutputs: never prunes protected tool names", () => {
  const PROTECTED = ["workspace-readfile", "skill", "read_knowledge", "list_workspace"];

  for (const protectedTool of PROTECTED) {
    const messages: Msg[] = [
      toolMsg(protectedTool, BIG_CHARS, "call-protected"), // big but protected
      toolMsg("bash", PROTECT_FILL_CHARS, "call-fill"),    // fills window
      userMsg(),
    ];
    const result = pruneToolOutputs(messages);
    // The protected tool should never be pruned
    const protectedMsgAfter = result.messages.find(
      (m) => m.role === "tool" && m.toolCallId === "call-protected"
    );
    assert.ok(protectedMsgAfter?.role === "tool");
    assert.equal(
      protectedMsgAfter.content.length,
      BIG_CHARS,
      `${protectedTool} content should be untouched`
    );
  }
});

// ─── Tests: already-short results not re-pruned ───────────────────────────────

test("pruneToolOutputs: does not re-prune already short tool results", () => {
  const alreadyShort = 50; // 50 chars — shorter than PRUNED_RESULT_CHARS (200)

  const messages: Msg[] = [
    toolMsg("bash", alreadyShort, "call-short"),        // candidate but already tiny
    toolMsg("bash", BIG_CHARS, "call-big"),              // also candidate — this one gets pruned
    toolMsg("bash", PROTECT_FILL_CHARS, "call-fill"),    // fills protect window
    userMsg(),
  ];

  const result = pruneToolOutputs(messages);
  const shortAfter = result.messages.find(
    (m) => m.role === "tool" && m.toolCallId === "call-short"
  );
  assert.ok(shortAfter?.role === "tool");
  // Content should be unchanged since it was already ≤ PRUNED_RESULT_CHARS
  assert.equal(shortAfter.content.length, alreadyShort);
});

// ─── Tests: immutability ──────────────────────────────────────────────────────

test("pruneToolOutputs: does not mutate the input array", () => {
  const messages: Msg[] = [
    toolMsg("bash", BIG_CHARS, "call-old"),
    toolMsg("bash", PROTECT_FILL_CHARS, "call-fill"),
    userMsg(),
  ];
  const originalContent = (messages[0] as Extract<Msg, { role: "tool" }>).content;

  pruneToolOutputs(messages);

  // Original array should be untouched
  assert.equal(
    (messages[0] as Extract<Msg, { role: "tool" }>).content,
    originalContent
  );
});
