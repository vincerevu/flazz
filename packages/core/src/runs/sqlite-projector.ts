import z from "zod";
import {
  MessageEvent,
  Run,
  RunEvent,
  ToolPermissionRequestEvent,
} from "@flazz/shared";
import type { ToolUIPart } from "ai";
import type { FlazzPrismaClient } from "../storage/prisma.js";

export type RunEventType = z.infer<typeof RunEvent>;
export type RunType = z.infer<typeof Run>;
export type TransactionClient = Parameters<FlazzPrismaClient["$transaction"]>[0] extends (
  client: infer Client,
) => unknown
  ? Client
  : never;

export function resolveRunType(agentId: string, runType?: RunType["runType"]): RunType["runType"] {
  if (runType) return runType;
  return agentId === "copilot" ? "chat" : "background";
}

export function parseEventDate(ts?: string): Date {
  if (ts) {
    const date = new Date(ts);
    if (Number.isFinite(date.getTime())) return date;
  }
  return new Date();
}

function cleanContentForTitle(content: string): string {
  return content
    .replace(/<attached-files>\s*[\s\S]*?\s*<\/attached-files>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: string; text?: string } => !!part && typeof part === "object" && "type" in part)
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

export function extractTitle(events: RunEventType[]): string | undefined {
  for (const event of events) {
    if (event.type !== "message") continue;
    const messageEvent = event as z.infer<typeof MessageEvent>;
    if (messageEvent.message.role !== "user") continue;
    const cleaned = cleanContentForTitle(extractMessageText(messageEvent.message.content));
    if (!cleaned) continue;
    return cleaned.length > 100 ? cleaned.substring(0, 100) : cleaned;
  }
  return undefined;
}

export function runEventId(runId: string, seq: number): string {
  return `${runId}:${String(seq).padStart(8, "0")}`;
}

function messagePartId(messageId: string, position: number): string {
  return `${messageId}:part:${String(position).padStart(4, "0")}`;
}

function permissionId(runId: string, toolCallId: string, subflow: string[]): string {
  return `${runId}:permission:${toolCallId}:${subflow.join("/")}`;
}

export async function projectRunEvent(tx: TransactionClient, event: RunEventType): Promise<void> {
  const eventDate = parseEventDate(event.ts);

  switch (event.type) {
    case "start":
      await tx.run.update({
        where: { id: event.runId },
        data: {
          agentId: event.agentName,
          runType: resolveRunType(event.agentName, event.runType),
          status: "idle",
          updatedAt: eventDate,
        },
      });
      break;

    case "run-processing-start":
      await tx.run.update({
        where: { id: event.runId },
        data: { status: "processing", updatedAt: eventDate },
      });
      break;

    case "run-processing-end":
      await tx.run.updateMany({
        where: {
          id: event.runId,
          status: { notIn: ["error", "stopped"] },
        },
        data: { status: "completed", completedAt: eventDate, updatedAt: eventDate },
      });
      break;

    case "run-stopped":
      await tx.run.update({
        where: { id: event.runId },
        data: { status: "stopped", completedAt: eventDate, updatedAt: eventDate },
      });
      break;

    case "error":
      await tx.run.update({
        where: { id: event.runId },
        data: {
          status: "error",
          completedAt: eventDate,
          updatedAt: eventDate,
          metadataJson: JSON.stringify({ lastError: event.error }),
        },
      });
      break;

    case "message": {
      const text = extractMessageText(event.message.content);
      const preview = cleanContentForTitle(text).slice(0, 240) || null;
      await tx.runMessage.upsert({
        where: { id: event.messageId },
        create: {
          id: event.messageId,
          runId: event.runId,
          role: event.message.role,
          status: "completed",
          createdAt: eventDate,
          updatedAt: eventDate,
          completedAt: eventDate,
          contentPreview: preview,
          dataJson: JSON.stringify(event.message),
        },
        update: {
          role: event.message.role,
          status: "completed",
          updatedAt: eventDate,
          completedAt: eventDate,
          contentPreview: preview,
          dataJson: JSON.stringify(event.message),
        },
      });

      if (text) {
        await tx.messagePart.upsert({
          where: {
            messageId_position: {
              messageId: event.messageId,
              position: 0,
            },
          },
          create: {
            id: messagePartId(event.messageId, 0),
            runId: event.runId,
            messageId: event.messageId,
            position: 0,
            type: "text",
            status: "completed",
            text,
            createdAt: eventDate,
            updatedAt: eventDate,
          },
          update: {
            text,
            status: "completed",
            updatedAt: eventDate,
          },
        });
      }

      if (event.message.role === "user" && preview) {
        const run = await tx.run.findUnique({
          where: { id: event.runId },
          select: { title: true },
        });
        if (!run?.title) {
          await tx.run.update({
            where: { id: event.runId },
            data: { title: preview.slice(0, 100), updatedAt: eventDate },
          });
        }
      }
      break;
    }

    case "tool-invocation":
      await tx.toolCall.upsert({
        where: { id: event.toolCallId ?? `${event.runId}:tool:${event.toolName}:${eventDate.getTime()}` },
        create: {
          id: event.toolCallId ?? `${event.runId}:tool:${event.toolName}:${eventDate.getTime()}`,
          runId: event.runId,
          toolName: event.toolName,
          status: "running",
          inputJson: event.input,
          createdAt: eventDate,
          updatedAt: eventDate,
        },
        update: {
          toolName: event.toolName,
          status: "running",
          inputJson: event.input,
          updatedAt: eventDate,
        },
      });
      break;

    case "tool-result":
      await tx.toolCall.upsert({
        where: { id: event.toolCallId ?? `${event.runId}:tool:${event.toolName}:${eventDate.getTime()}` },
        create: {
          id: event.toolCallId ?? `${event.runId}:tool:${event.toolName}:${eventDate.getTime()}`,
          runId: event.runId,
          toolName: event.toolName,
          status: "completed",
          resultJson: JSON.stringify(event.result as ToolUIPart["output"]),
          createdAt: eventDate,
          updatedAt: eventDate,
        },
        update: {
          status: "completed",
          resultJson: JSON.stringify(event.result as ToolUIPart["output"]),
          updatedAt: eventDate,
        },
      });
      break;

    case "tool-permission-request":
      await tx.runPermission.upsert({
        where: { id: permissionId(event.runId, event.toolCall.toolCallId, event.subflow) },
        create: {
          id: permissionId(event.runId, event.toolCall.toolCallId, event.subflow),
          runId: event.runId,
          toolCallId: event.toolCall.toolCallId,
          subflowJson: JSON.stringify(event.subflow),
          requestJson: JSON.stringify((event as z.infer<typeof ToolPermissionRequestEvent>).toolCall),
          requestedAt: eventDate,
        },
        update: {
          requestJson: JSON.stringify((event as z.infer<typeof ToolPermissionRequestEvent>).toolCall),
          requestedAt: eventDate,
        },
      });
      break;

    case "tool-permission-response": {
      const existing = await tx.runPermission.findFirst({
        where: {
          runId: event.runId,
          toolCallId: event.toolCallId,
          subflowJson: JSON.stringify(event.subflow),
        },
        select: { id: true },
      });
      if (existing) {
        await tx.runPermission.update({
          where: { id: existing.id },
          data: {
            response: event.response,
            scope: event.scope ?? null,
            respondedAt: eventDate,
          },
        });
      }
      break;
    }
  }
}
