import { MessageList } from "@flazz/shared";
import { z } from "zod";
import { buildAutoContinueMessage, isAutoContinueMessage, type AutoContinueReason } from "./auto-continue.js";

type Message = z.infer<typeof MessageList>[number];

function attachmentPlaceholder(filename: string, mimeType: string, path: string): string {
  return `[Attached ${mimeType}: ${filename}] at ${path}`;
}

function toReplayableUserMessage(message: Extract<Message, { role: "user" }>, reason: AutoContinueReason): Message {
  if (typeof message.content === "string") {
    return {
      role: "user",
      content: message.content,
      providerOptions: {
        flazz: {
          synthetic: true,
          replayAfterCompaction: true,
          reason,
        },
      },
    };
  }

  const textParts = message.content.flatMap((part) => {
    if (part.type === "text") return [part];
    return [{
      type: "text" as const,
      text: attachmentPlaceholder(part.filename, part.mimeType, part.path),
    }];
  });

  return {
    role: "user",
    content: textParts.length === 1 ? textParts[0].text : textParts,
    providerOptions: {
      flazz: {
        synthetic: true,
        replayAfterCompaction: true,
        reason,
      },
    },
  };
}

function findLatestReplayableUserMessage(messages: z.infer<typeof MessageList>): Extract<Message, { role: "user" }> | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    if (isAutoContinueMessage(message)) continue;
    return message;
  }
  return null;
}

export function promptContainsAttachments(messages: z.infer<typeof MessageList>): boolean {
  return messages.some((message) => (
    message.role === "user"
    && Array.isArray(message.content)
    && message.content.some((part) => part.type === "attachment")
  ));
}

export function getCompactionReason(
  messages: z.infer<typeof MessageList>,
  options?: { overflow?: boolean },
): AutoContinueReason {
  if (options?.overflow && promptContainsAttachments(messages)) {
    return "overflow-media";
  }
  return "compaction";
}

export function buildPostCompactionMessages(args: {
  promptMessages: z.infer<typeof MessageList>;
  reason: AutoContinueReason;
}): Message[] {
  if (args.reason === "overflow-media") {
    const replay = findLatestReplayableUserMessage(args.promptMessages);
    if (replay) {
      return [toReplayableUserMessage(replay, args.reason)];
    }
  }

  return [buildAutoContinueMessage(args.reason)];
}

