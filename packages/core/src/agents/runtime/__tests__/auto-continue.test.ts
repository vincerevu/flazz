import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoContinueMessage,
  isAutoContinueMessage,
  type AutoContinueReason,
} from "../auto-continue.js";

// ─── Tests: buildAutoContinueMessage ─────────────────────────────────────────

test("buildAutoContinueMessage returns a user-role message", () => {
  const msg = buildAutoContinueMessage("compaction");
  assert.equal(msg.role, "user");
});

test("buildAutoContinueMessage tags message with autoContinue providerOption", () => {
  const msg = buildAutoContinueMessage("compaction");
  const opts = msg.providerOptions as Record<string, Record<string, unknown>> | undefined;
  assert.ok(opts?.flazz?.autoContinue === true, "autoContinue flag should be true");
  assert.ok(opts?.flazz?.synthetic === true, "synthetic flag should be true");
});

test("buildAutoContinueMessage tags message with the correct reason", () => {
  const reasons: AutoContinueReason[] = ["compaction", "overflow-media"];
  for (const reason of reasons) {
    const msg = buildAutoContinueMessage(reason);
    const opts = msg.providerOptions as Record<string, Record<string, unknown>> | undefined;
    assert.equal(opts?.flazz?.reason, reason, `reason should be '${reason}'`);
  }
});

test("buildAutoContinueMessage content contains continue instruction", () => {
  const msg = buildAutoContinueMessage("compaction");
  const content = typeof msg.content === "string" ? msg.content : "";
  assert.ok(
    content.toLowerCase().includes("continue"),
    "message should contain 'continue'"
  );
});

test("buildAutoContinueMessage overflow-media includes media warning", () => {
  const msg = buildAutoContinueMessage("overflow-media");
  const content = typeof msg.content === "string" ? msg.content : "";
  assert.ok(
    content.toLowerCase().includes("media") || content.toLowerCase().includes("attachment"),
    "overflow-media message should mention media or attachment"
  );
});

test("buildAutoContinueMessage overflow-media content is longer than compaction", () => {
  const compact = buildAutoContinueMessage("compaction");
  const media = buildAutoContinueMessage("overflow-media");
  const compactText = typeof compact.content === "string" ? compact.content : "";
  const mediaText = typeof media.content === "string" ? media.content : "";
  assert.ok(
    mediaText.length > compactText.length,
    "overflow-media should have extra prefix text"
  );
});

// ─── Tests: isAutoContinueMessage ────────────────────────────────────────────

test("isAutoContinueMessage returns true for synthetic auto-continue messages", () => {
  const reasons: AutoContinueReason[] = ["compaction", "overflow-media"];
  for (const reason of reasons) {
    const msg = buildAutoContinueMessage(reason);
    assert.equal(
      isAutoContinueMessage(msg),
      true,
      `isAutoContinueMessage should return true for reason='${reason}'`
    );
  }
});

test("isAutoContinueMessage returns false for normal user messages", () => {
  const msg = { role: "user" as const, content: "hello" };
  assert.equal(isAutoContinueMessage(msg), false);
});

test("isAutoContinueMessage returns false for assistant messages", () => {
  const msg = {
    role: "assistant" as const,
    content: "Continue if you have next steps",
    providerOptions: { flazz: { autoContinue: true } },
  };
  assert.equal(isAutoContinueMessage(msg), false, "assistant role should never be synthetic");
});

test("isAutoContinueMessage returns false for user message without providerOptions", () => {
  const msg = { role: "user" as const, content: "some text" };
  assert.equal(isAutoContinueMessage(msg), false);
});

test("isAutoContinueMessage returns false when providerOptions lacks autoContinue", () => {
  const msg = {
    role: "user" as const,
    content: "some text",
    providerOptions: { flazz: { synthetic: false } },
  };
  assert.equal(isAutoContinueMessage(msg), false);
});
