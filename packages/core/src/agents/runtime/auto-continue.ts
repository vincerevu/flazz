import { MessageList } from "@flazz/shared";
import { z } from "zod";

type Message = z.infer<typeof MessageList>[number];

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Why the auto-continue message is being injected.
 * - `"compaction"` — normal context compaction after history grew too large.
 * - `"overflow-media"` — overflow caused by large media attachments; media was stripped.
 */
export type AutoContinueReason = "compaction" | "overflow-media";

// ─── Copy ──────────────────────────────────────────────────────────────────────

const CONTINUE_TEXT =
  "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.";

const OVERFLOW_MEDIA_PREFIX =
  "The previous request exceeded the context limit due to large media attachments. " +
  "The conversation was compacted and media files were removed from context. " +
  "If the user was asking about attached files, explain that the attachments were too large " +
  "and suggest trying again with smaller or fewer files.\n\n";

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a synthetic user message to inject after context compaction,
 * so the agent can continue its work without requiring human input.
 *
 * The message is tagged via `providerOptions.flazz.synthetic = true` so:
 * - The renderer can hide it from the conversation UI
 * - Downstream code can identify and filter it if needed
 *
 * Mirrors OpenCode's "Continue if you have next steps..." injection logic
 * in `SessionCompaction.processCompaction`.
 */
export function buildAutoContinueMessage(reason: AutoContinueReason): Message {
  const text =
    reason === "overflow-media"
      ? OVERFLOW_MEDIA_PREFIX + CONTINUE_TEXT
      : CONTINUE_TEXT;

  return {
    role: "user",
    content: text,
    // Tag as synthetic so the renderer knows not to show this to the user.
    providerOptions: {
      flazz: { synthetic: true, autoContinue: true, reason },
    },
  };
}

/**
 * Returns true if a message is a synthetic auto-continue message
 * created by `buildAutoContinueMessage`.
 */
export function isAutoContinueMessage(message: Message): boolean {
  if (message.role !== "user") return false;
  const opts = message.providerOptions as Record<string, unknown> | undefined;
  const flazz = opts?.["flazz"] as Record<string, unknown> | undefined;
  return flazz?.["autoContinue"] === true;
}
