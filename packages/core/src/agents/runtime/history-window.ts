import { MessageList } from "@flazz/shared";
import { z } from "zod";

type Message = z.infer<typeof MessageList>[number];

function hasCompleteToolReferences(messages: Message[]): boolean {
  const seenAssistantToolCalls = new Set<string>();

  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "tool-call") {
          seenAssistantToolCalls.add(part.toolCallId);
        }
      }
      continue;
    }

    if (message.role === "tool" && !seenAssistantToolCalls.has(message.toolCallId)) {
      return false;
    }
  }

  return true;
}

export function buildSafeRecentMessages(
  messages: z.infer<typeof MessageList>,
  maxHistory: number,
): z.infer<typeof MessageList> {
  if (messages.length <= maxHistory) {
    return messages;
  }

  let startIndex = Math.max(0, messages.length - maxHistory);

  while (startIndex > 0) {
    const candidate = messages.slice(startIndex);
    if (hasCompleteToolReferences(candidate)) {
      return candidate;
    }
    startIndex -= 1;
  }

  return messages;
}

export function findHistoryWindowStart(
  messages: z.infer<typeof MessageList>,
  maxHistory: number,
): number {
  const safeWindow = buildSafeRecentMessages(messages, maxHistory);
  return messages.length - safeWindow.length;
}
