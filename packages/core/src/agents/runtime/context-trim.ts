import { MessageList } from "@flazz/shared";
import { z } from "zod";
import { buildSafeRecentMessages } from "./history-window.js";

type Message = z.infer<typeof MessageList>[number];

export type TrimResult = {
  messages: z.infer<typeof MessageList>;
  droppedMessages: number;
  downgradedMessages: number;
};

type ToolOutputClass =
  | "discovery"
  | "inspection"
  | "execution"
  | "full-content"
  | "filesystem-read"
  | "shell-output"
  | "generic";

const FILLER_PATTERNS = [
  /^(ok|okay|k|sure|thanks|thank you|got it|continue|go on|next)$/i,
  /^(ok[eê]?|ừ|uhm|um|tiếp|rồi|được|đúng rồi|cứ làm đi)$/i,
];

const TOOL_RESULT_CHAR_LIMIT = 240;
const TEXT_CHAR_LIMIT = 600;
const REASONING_CHAR_LIMIT = 240;
const TOOL_RESULT_TOP_K = 3;
const SHELL_LAST_LINES = 12;

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickUsefulFields(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  const preferredKeys = [
    "id",
    "name",
    "title",
    "subject",
    "status",
    "state",
    "url",
    "path",
    "filename",
    "score",
    "summary",
    "message",
    "reason",
    "type",
    "updatedAt",
    "createdAt",
  ];

  const picked: Record<string, unknown> = {};
  for (const key of preferredKeys) {
    if (key in candidate && candidate[key] != null) {
      picked[key] = candidate[key];
    }
  }

  return Object.keys(picked).length > 0 ? picked : candidate;
}

function classifyToolPayload(parsed: unknown): ToolOutputClass {
  if (!parsed) return "generic";
  if (Array.isArray(parsed)) return "discovery";
  if (typeof parsed !== "object") return "generic";

  const record = parsed as Record<string, unknown>;
  if (["results", "items", "data", "rows", "issues", "pullRequests"].some((key) => Array.isArray(record[key]))) {
    return "discovery";
  }
  if (["body", "content", "html", "markdown", "text"].some((key) => typeof record[key] === "string" && String(record[key]).length > 400)) {
    return "full-content";
  }
  if (["success", "created", "updated", "deleted"].some((key) => typeof record[key] === "boolean")
    || ["status", "state", "message"].some((key) => key in record)) {
    return "execution";
  }
  return "inspection";
}

function classifyToolOutput(toolName: string, parsed: unknown, content: string): ToolOutputClass {
  const normalizedTool = toolName.toLowerCase();

  if ([
    "web-search",
    "research-search",
    "integration-listitemscompact",
    "integration-searchitemscompact",
    "workspace-search",
  ].includes(normalizedTool)) {
    return "discovery";
  }

  if ([
    "workspace-readfile",
    "integration-getitemdetailed",
    "integration-getitemsummary",
  ].includes(normalizedTool)) {
    return normalizedTool === "integration-getitemsummary" ? "inspection" : "filesystem-read";
  }

  if ([
    "shell-command",
    "command",
  ].includes(normalizedTool)) {
    return "shell-output";
  }

  if ([
    "composio-checkconnection",
    "tool-permission-response",
    "workspace-writefile",
  ].includes(normalizedTool)) {
    return "execution";
  }

  const classified = classifyToolPayload(parsed);
  if (classified !== "generic") return classified;
  if (content.length > 2_000) return "full-content";
  return "generic";
}

function summarizeShellOutput(content: string): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const keptLines = lines.slice(-SHELL_LAST_LINES);
  return JSON.stringify({
    kind: "trimmed-shell-output",
    outputClass: "shell-output",
    totalLines: lines.length,
    keptLines: keptLines.length,
    tail: keptLines,
  });
}

function summarizeFileContent(content: string): string {
  const lines = content.split(/\r?\n/);
  const head = lines.slice(0, 8);
  const tail = lines.length > 16 ? lines.slice(-8) : [];
  return JSON.stringify({
    kind: "trimmed-file-content",
    outputClass: "filesystem-read",
    totalLines: lines.length,
    head,
    tail,
  });
}

function summarizeToolPayload(toolName: string, content: string): string | null {
  const parsed = safeParseJson(content);
  const outputClass = classifyToolOutput(toolName, parsed, content);

  if (outputClass === "shell-output") {
    return summarizeShellOutput(content);
  }

  if (outputClass === "filesystem-read") {
    return summarizeFileContent(content);
  }

  if (!parsed) {
    if (outputClass === "full-content") {
      return JSON.stringify({
        kind: "trimmed-full-content",
        outputClass,
        excerpt: truncate(content, TOOL_RESULT_CHAR_LIMIT),
      });
    }
    return null;
  }

  if (outputClass === "discovery" && Array.isArray(parsed)) {
    const topItems = parsed.slice(0, TOOL_RESULT_TOP_K).map((item) => pickUsefulFields(item));
    return JSON.stringify({
      kind: "trimmed-array",
      outputClass,
      totalItems: parsed.length,
      keptItems: topItems.length,
      items: topItems,
    });
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (outputClass === "discovery") {
      for (const key of ["results", "items", "data", "rows", "issues", "pullRequests"]) {
        const value = record[key];
        if (Array.isArray(value)) {
          const topItems = value.slice(0, TOOL_RESULT_TOP_K).map((item) => pickUsefulFields(item));
          return JSON.stringify({
            kind: "trimmed-collection",
            outputClass,
            collectionKey: key,
            totalItems: value.length,
            keptItems: topItems.length,
            items: topItems,
          });
        }
      }
    }

    if (outputClass === "execution") {
      return JSON.stringify({
        kind: "trimmed-execution",
        outputClass,
        details: pickUsefulFields(record),
      });
    }

    if (outputClass === "full-content") {
      const compactRecord = Object.fromEntries(
        Object.entries(record).filter(([key]) => !["body", "content", "html", "markdown", "text"].includes(key))
      );
      return JSON.stringify({
        kind: "trimmed-full-content",
        outputClass,
        details: pickUsefulFields(compactRecord),
      });
    }

    if (outputClass === "inspection") {
      return JSON.stringify({
        kind: "trimmed-inspection",
        outputClass,
        details: pickUsefulFields(record),
      });
    }

    if (outputClass === "discovery") {
      for (const key of ["results", "items", "data", "rows", "issues", "pullRequests"]) {
        const value = record[key];
        if (Array.isArray(value)) {
          const topItems = value.slice(0, TOOL_RESULT_TOP_K).map((item) => pickUsefulFields(item));
          return JSON.stringify({
            kind: "trimmed-collection",
            outputClass,
            collectionKey: key,
            totalItems: value.length,
            keptItems: topItems.length,
            items: topItems,
          });
        }
      }
    }

    if (outputClass === "generic") {
      return JSON.stringify({
        kind: "trimmed-generic",
        outputClass,
        details: pickUsefulFields(record),
      });
    }
  }

  return null;
}

function isTextFiller(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 32) return false;
  return FILLER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 17))}\n...[trimmed]`;
}

function trimMessage(message: Message): { message: Message; changed: boolean } {
  if (message.role === "tool") {
    const structured = summarizeToolPayload(message.toolName, message.content);
    const next = structured ?? truncate(message.content, TOOL_RESULT_CHAR_LIMIT);
    return next === message.content
      ? { message, changed: false }
      : { message: { ...message, content: next }, changed: true };
  }

  if (message.role === "assistant" && Array.isArray(message.content)) {
    let changed = false;
    const nextContent = message.content.map((part) => {
      if (part.type === "text") {
        const next = truncate(part.text, TEXT_CHAR_LIMIT);
        changed ||= next !== part.text;
        return next === part.text ? part : { ...part, text: next };
      }
      if (part.type === "reasoning") {
        const next = truncate(part.text, REASONING_CHAR_LIMIT);
        changed ||= next !== part.text;
        return next === part.text ? part : { ...part, text: next };
      }
      return part;
    });
    return changed ? { message: { ...message, content: nextContent }, changed } : { message, changed };
  }

  if ((message.role === "assistant" || message.role === "user") && typeof message.content === "string") {
    const next = truncate(message.content, TEXT_CHAR_LIMIT);
    return next === message.content
      ? { message, changed: false }
      : { message: { ...message, content: next }, changed: true };
  }

  if (message.role === "user" && Array.isArray(message.content)) {
    let changed = false;
    const nextContent = message.content.map((part) => {
      if (part.type !== "text") return part;
      const next = truncate(part.text, TEXT_CHAR_LIMIT);
      changed ||= next !== part.text;
      return next === part.text ? part : { ...part, text: next };
    });
    return changed ? { message: { ...message, content: nextContent }, changed } : { message, changed };
  }

  return { message, changed: false };
}

function shouldDropOldMessage(message: Message): boolean {
  if (message.role === "user" && typeof message.content === "string") {
    return isTextFiller(message.content);
  }

  if (message.role === "assistant" && typeof message.content === "string") {
    return isTextFiller(message.content);
  }

  if (message.role === "assistant" && Array.isArray(message.content)) {
    const textParts = message.content.filter((part) => part.type === "text");
    const hasToolCalls = message.content.some((part) => part.type === "tool-call");
    if (hasToolCalls || textParts.length !== 1) return false;
    return isTextFiller(textParts[0].text);
  }

  return false;
}

export function trimMessagesForPrompt(
  messages: z.infer<typeof MessageList>,
  minimumRecentMessages = 20,
): TrimResult {
  if (messages.length <= minimumRecentMessages) {
    return { messages, droppedMessages: 0, downgradedMessages: 0 };
  }

  const recentMessages = buildSafeRecentMessages(messages, minimumRecentMessages);
  const olderCount = messages.length - recentMessages.length;
  const olderMessages = messages.slice(0, olderCount);

  let droppedMessages = 0;
  let downgradedMessages = 0;

  const trimmedOlderMessages: Message[] = [];
  for (const message of olderMessages) {
    if (shouldDropOldMessage(message)) {
      droppedMessages += 1;
      continue;
    }

    const trimmed = trimMessage(message);
    if (trimmed.changed) {
      downgradedMessages += 1;
    }
    trimmedOlderMessages.push(trimmed.message);
  }

  return {
    messages: [...trimmedOlderMessages, ...recentMessages],
    droppedMessages,
    downgradedMessages,
  };
}
