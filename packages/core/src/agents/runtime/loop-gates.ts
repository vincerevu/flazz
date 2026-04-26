import { MessageList, RunEvent } from "@flazz/shared";
import { z } from "zod";
import { PrefixLogger } from "@flazz/shared";
import { AgentState } from "./agent-state.js";
import { IMessageQueue } from "../../application/lib/message-queue.js";
import { createMessageEvent } from "./runtime-events.js";

export function shouldExitForPendingRequests(state: AgentState): boolean {
  return state.getPendingAskHumans().length > 0 || state.getPendingPermissions().length > 0;
}

export function shouldExitAfterAssistantResponse(messages: z.infer<typeof MessageList>): boolean {
  const lastMessage = messages[messages.length - 1];
  return Boolean(
    lastMessage
      && lastMessage.role === "assistant"
      && (
        typeof lastMessage.content === "string"
        || !lastMessage.content.some((part) => part.type === "tool-call")
      ),
  );
}

export async function* drainQueuedUserMessages(args: {
  runId: string;
  messageQueue: IMessageQueue;
  loopLogger: PrefixLogger;
  processEvent: (event: z.infer<typeof RunEvent>) => AsyncGenerator<z.infer<typeof RunEvent>, void, unknown>;
}): AsyncGenerator<z.infer<typeof RunEvent>, number, unknown> {
  let dequeuedCount = 0;

  while (true) {
    const msg = await args.messageQueue.dequeue(args.runId);
    if (!msg) {
      break;
    }
    dequeuedCount++;
    args.loopLogger.log("dequeued user message", msg.messageId);
    yield* args.processEvent(createMessageEvent({
      runId: args.runId,
      messageId: msg.messageId,
      message: {
        role: "user",
        content: msg.message,
      },
    }));
  }

  return dequeuedCount;
}
