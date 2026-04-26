import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPostCompactionMessages,
  getCompactionReason,
  promptContainsAttachments,
} from "../compaction-policy.js";

test("promptContainsAttachments detects user attachments", () => {
  assert.equal(promptContainsAttachments([
    {
      role: "user",
      content: [
        { type: "attachment", path: "D:\\tmp\\a.png", filename: "a.png", mimeType: "image/png" },
      ],
    },
  ] as never), true);
});

test("getCompactionReason returns overflow-media only when overflowing with attachments", () => {
  const messages = [{
    role: "user",
    content: [
      { type: "attachment", path: "D:\\tmp\\a.png", filename: "a.png", mimeType: "image/png" },
    ],
  }];

  assert.equal(getCompactionReason(messages as never, { overflow: true }), "overflow-media");
  assert.equal(getCompactionReason(messages as never, { overflow: false }), "compaction");
});

test("buildPostCompactionMessages replays latest user turn for overflow-media", () => {
  const result = buildPostCompactionMessages({
    promptMessages: [{
      role: "user",
      content: [
        { type: "text", text: "Please analyze this file." },
        { type: "attachment", path: "D:\\tmp\\a.png", filename: "a.png", mimeType: "image/png" },
      ],
    }] as never,
    reason: "overflow-media",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.role, "user");
  const replay = result[0] as { content: string | Array<{ type: string; text: string }>; providerOptions?: Record<string, Record<string, unknown>> };
  const content = typeof replay.content === "string"
    ? replay.content
    : replay.content.map((part) => part.text).join("\n");
  assert.match(content, /Please analyze this file/);
  assert.match(content, /\[Attached image\/png: a\.png\]/);
  assert.equal(replay.providerOptions?.flazz?.replayAfterCompaction, true);
});

test("buildPostCompactionMessages falls back to auto-continue for normal compaction", () => {
  const result = buildPostCompactionMessages({
    promptMessages: [{ role: "user", content: "continue" }] as never,
    reason: "compaction",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.role, "user");
  const content = typeof result[0]?.content === "string" ? result[0].content : "";
  assert.match(content, /continue/i);
});

