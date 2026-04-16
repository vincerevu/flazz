import type { IntegrationCapability } from "./types.js";

export const COMMON_FIELD_ALIASES = {
  query: ["query", "search", "q", "keyword", "keywords"],
  limit: ["limit", "count", "max_results", "maxResults", "page_size", "pageSize"],
  title: ["title", "subject", "name", "summary"],
  content: ["content", "body", "text", "message", "comment", "description", "htmlBody", "markdown"],
  itemId: ["id"],
} as const;

const FAMILY_ITEM_ID_ALIASES = {
  message: ["message_id", "messageId", "thread_id", "threadId", "conversation_id", "conversationId"],
  document: ["document_id", "documentId", "page_id", "pageId", "block_id", "blockId"],
  ticket: ["ticket_id", "ticketId", "issue_id", "issueId", "task_id", "taskId", "notification_id", "notificationId", "thread_id", "threadId"],
  event: ["event_id", "eventId", "calendar_event_id", "calendarEventId"],
  file: ["file_id", "fileId", "attachment_id", "attachmentId"],
  record: ["record_id", "recordId", "object_id", "objectId", "row_id", "rowId"],
  code: ["file_id", "fileId", "path", "repo_file_id"],
  spreadsheet: ["row_id", "rowId", "sheet_id", "sheetId", "record_id", "recordId"],
} as const;

const PROVIDER_ITEM_ID_ALIASES: Record<string, string[]> = {
  slack: ["ts", "threadTs"],
  github: ["notification_id", "notificationId", "thread_id", "threadId", "number"],
  jira: ["key", "issueKey"],
  linear: ["identifier"],
  googlecalendar: ["eventId"],
  googledrive: ["fileId"],
};

export function getItemIdAliases(app: string, resourceType: keyof typeof FAMILY_ITEM_ID_ALIASES) {
  return [
    ...COMMON_FIELD_ALIASES.itemId,
    ...(PROVIDER_ITEM_ID_ALIASES[app] ?? []),
    ...FAMILY_ITEM_ID_ALIASES[resourceType],
  ];
}

export function getFieldAliases(
  app: string,
  resourceType: keyof typeof FAMILY_ITEM_ID_ALIASES,
  field: "query" | "limit" | "title" | "content" | "itemId",
  capability?: IntegrationCapability,
) {
  if (field === "itemId") {
    return getItemIdAliases(app, resourceType);
  }
  if (field === "content" && capability === "comment") {
    return ["comment", "body", "text", "content", "message"];
  }
  return [...COMMON_FIELD_ALIASES[field]];
}
