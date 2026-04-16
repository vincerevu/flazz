import crypto from "node:crypto";
import { Run } from "@flazz/shared";
import { z } from "zod";
import { getLoadedSkills } from "../skills/run-learning-service.js";
import type { RunMemoryRecord } from "./run-memory-types.js";

type RunRecord = z.infer<typeof Run>;

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function getFirstUserMessage(run: RunRecord): string {
  for (const event of run.log) {
    if (event.type === "message" && event.message.role === "user") {
      return extractText(event.message.content).trim();
    }
  }

  return "";
}

function getToolRefs(run: RunRecord): string[] {
  return Array.from(
    new Set(
      run.log
        .filter((event) => event.type === "tool-invocation")
        .map((event) => event.toolName)
    )
  );
}

function getCorrections(run: RunRecord): string[] {
  const assistantMessages = run.log
    .filter((event): event is Extract<RunRecord["log"][number], { type: "message" }> => event.type === "message")
    .filter((event) => event.message.role === "assistant")
    .map((event) => extractText(event.message.content).trim())
    .filter(Boolean);

  const userMessages = run.log
    .filter((event): event is Extract<RunRecord["log"][number], { type: "message" }> => event.type === "message")
    .filter((event) => event.message.role === "user")
    .map((event) => extractText(event.message.content).trim())
    .filter(Boolean);

  if (assistantMessages.length === 0 || userMessages.length < 2) {
    return [];
  }

  return userMessages.slice(1, 4);
}

function extractEntityRefs(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g) ?? [];
  return Array.from(new Set(matches)).slice(0, 10);
}

function inferOutcome(run: RunRecord): "success" | "failure" | "stopped" {
  if (run.log.some((event) => event.type === "run-stopped")) {
    return "stopped";
  }
  if (run.log.some((event) => event.type === "error")) {
    return "failure";
  }
  return "success";
}

function inferFailureCategory(run: RunRecord): RunMemoryRecord["failureCategory"] {
  if (run.log.some((event) => event.type === "run-stopped")) {
    return "user-stopped";
  }
  if (run.log.some((event) => event.type === "tool-permission-request")) {
    return "permission-flow";
  }
  if (run.log.some((event) => event.type === "error")) {
    return "execution-error";
  }
  return undefined;
}

function buildSummary(run: RunRecord, firstUserMessage: string, toolRefs: string[], skillRefs: string[]): string {
  const request = firstUserMessage || "No user request captured";
  const tools = toolRefs.length ? `Tools: ${toolRefs.slice(0, 4).join(", ")}.` : "";
  const skills = skillRefs.length ? `Skills: ${skillRefs.slice(0, 3).join(", ")}.` : "";
  return `${request.slice(0, 220)} ${tools} ${skills}`.trim();
}

export function distillRunMemory(run: RunRecord): RunMemoryRecord {
  const firstUserMessage = getFirstUserMessage(run);
  const loadedSkills = getLoadedSkills(run)
    .filter((skill) => skill.source === "workspace" || skill.source === "builtin")
    .map((skill) => skill.name);
  const toolRefs = getToolRefs(run);
  const entityRefs = extractEntityRefs(firstUserMessage);
  const outcome = inferOutcome(run);

  return {
    id: crypto.createHash("sha1").update(run.id).digest("hex").slice(0, 16),
    runId: run.id,
    agentId: run.agentId,
    taskType: toolRefs[0],
    summary: buildSummary(run, firstUserMessage, toolRefs, loadedSkills),
    firstUserMessage: firstUserMessage || undefined,
    entityRefs,
    topicRefs: [],
    projectRefs: [],
    skillRefs: loadedSkills,
    toolRefs,
    artifactRefs: [],
    outcome,
    failureCategory: inferFailureCategory(run),
    corrections: getCorrections(run),
    createdAt: run.createdAt,
  };
}
