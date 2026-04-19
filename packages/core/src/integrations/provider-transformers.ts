import crypto from "node:crypto";
import { integrationNormalizer } from "../di/container.js";
import type { IntegrationResourceType } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function toContactArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const results = value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = asRecord(entry);
      const emailAddress = asRecord(record.emailAddress);
      return (
        toStringValue(record.address) ??
        toStringValue(record.email) ??
        toStringValue(record.value) ??
        toStringValue(emailAddress.address) ??
        toStringValue(emailAddress.name)
      );
    })
    .filter((entry): entry is string => !!entry);
  return results.length ? results : undefined;
}

function pickFirst(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toStringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function summarizeText(text: string | undefined, max = 280) {
  if (!text) return undefined;
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

function sliceText(text: string | undefined, size = 500) {
  if (!text) return [];
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const slices: string[] = [];
  for (let index = 0; index < compact.length; index += size) {
    slices.push(compact.slice(index, index + size));
    if (slices.length >= 5) break;
  }
  return slices;
}

function normalizeMessage(app: string, item: unknown) {
  const record = asRecord(item);

  if (app === "gmail" || app === "outlook") {
    const labels = toStringArray(record.labelIds) ?? toStringArray(record.labels) ?? toStringArray(record.categories);
    return integrationNormalizer.normalizeMessage({
      id: pickFirst(record, ["id", "messageId", "threadId"]) ?? crypto.randomUUID(),
      threadId: pickFirst(record, ["threadId", "conversationId"]),
      title: pickFirst(record, ["subject", "title"]) ?? "Untitled message",
      author: pickFirst(record, ["from", "sender", "author"]),
      recipients: toContactArray(record.toRecipients) ?? toContactArray(record.to) ?? toContactArray(record.cc) ?? toContactArray(record.recipients),
      labels,
      timestamp: pickFirst(record, ["internalDate", "date", "createdAt", "timestamp"]),
      snippet: summarizeText(pickFirst(record, ["snippet", "preview", "textBody", "body"])),
      importance:
        typeof record.importance === "boolean"
          ? record.importance
          : labels?.some((label) => /important|starred/i.test(label)) || undefined,
      isUnread:
        typeof record.isUnread === "boolean"
          ? record.isUnread
          : typeof record.unread === "boolean"
            ? record.unread
            : typeof record.isRead === "boolean"
              ? !record.isRead
              : undefined,
      hasAttachment: typeof record.hasAttachment === "boolean" ? record.hasAttachment : undefined,
      source: app,
      estimatedChars: pickFirst(record, ["body", "textBody"])?.length,
    });
  }

  if (app === "slack") {
    return integrationNormalizer.normalizeMessage({
      id: pickFirst(record, ["ts", "id", "threadTs"]) ?? crypto.randomUUID(),
      threadId: pickFirst(record, ["threadTs", "threadId", "conversationId"]),
      title: summarizeText(pickFirst(record, ["text", "title"])) ?? "Slack message",
      author: pickFirst(record, ["user", "username", "author"]),
      timestamp: pickFirst(record, ["ts", "timestamp", "date"]),
      snippet: summarizeText(pickFirst(record, ["text", "snippet", "preview"])),
      source: app,
      estimatedChars: pickFirst(record, ["text"])?.length,
      threadLength: Array.isArray(record.replies) ? record.replies.length : undefined,
    });
  }

  return integrationNormalizer.normalizeMessage({
    id: pickFirst(record, ["id", "messageId", "threadId"]) ?? crypto.randomUUID(),
    threadId: pickFirst(record, ["threadId", "conversationId"]),
    title: pickFirst(record, ["subject", "title", "name"]) ?? "Untitled message",
    author: pickFirst(record, ["from", "sender", "author"]),
    timestamp: pickFirst(record, ["timestamp", "date", "createdAt"]),
    snippet: summarizeText(pickFirst(record, ["snippet", "preview", "text", "body"])),
    source: app,
  });
}

function normalizeDocument(app: string, item: unknown) {
  const record = asRecord(item);

  if (app === "notion") {
    return integrationNormalizer.normalizeDocument({
      id: pickFirst(record, ["id", "pageId"]) ?? crypto.randomUUID(),
      title: pickFirst(record, ["title", "name"]) ?? "Untitled document",
      updatedAt: pickFirst(record, ["lastEditedTime", "updatedAt"]),
      preview: summarizeText(pickFirst(record, ["summary", "text", "preview", "content"])),
      source: app,
      estimatedChars: pickFirst(record, ["content", "text"])?.length,
    });
  }

  return integrationNormalizer.normalizeDocument({
    id: pickFirst(record, ["id", "documentId", "pageId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name"]) ?? "Untitled document",
    updatedAt: pickFirst(record, ["updatedAt", "modifiedTime", "lastEditedTime"]),
    preview: summarizeText(pickFirst(record, ["summary", "text", "preview", "content"])),
    source: app,
    estimatedChars: pickFirst(record, ["content", "text"])?.length,
  });
}

function normalizeTicket(app: string, item: unknown) {
  const record = asRecord(item);

  if (app === "github") {
    const repositoryRecord = asRecord(record.repository);
    const repoRecord = asRecord(record.repo);
    const assigneeRecord = asRecord(record.assignee);
    const authorRecord = asRecord(record.user);
    const repository =
      pickFirst(repositoryRecord, ["full_name", "name"]) ??
      pickFirst(repoRecord, ["full_name", "name"]) ??
      pickFirst(record, ["repositoryName", "repo", "full_name"]);
    const issueOrPullNumber = pickFirst(record, ["number", "issue_number", "pull_number"]);
    const state = pickFirst(record, ["state", "status"]);
    const title = pickFirst(record, ["title", "subject", "summary"]) ?? "Untitled GitHub item";
    const prefix = [repository, issueOrPullNumber ? `#${issueOrPullNumber}` : undefined, state].filter(Boolean).join(" • ");
    return integrationNormalizer.normalizeTicket({
      id: pickFirst(record, ["number", "issue_number", "pull_number", "identifier", "id", "node_id"]) ?? crypto.randomUUID(),
      title,
      status: state,
      assignee:
        pickFirst(assigneeRecord, ["login", "name"]) ??
        pickFirst(authorRecord, ["login", "name"]) ??
        pickFirst(record, ["assignee", "assigneeName", "actor", "author"]),
      project: repository,
      url: pickFirst(record, ["html_url", "url"]),
      updatedAt: pickFirst(record, ["updatedAt", "updated_at", "last_read_at", "created_at"]),
      preview: summarizeText(
        [prefix, pickFirst(record, ["description", "preview", "body", "url", "html_url"])]
          .filter(Boolean)
          .join(" - "),
      ),
      source: app,
      estimatedChars: pickFirst(record, ["description", "body"])?.length,
    });
  }

  return integrationNormalizer.normalizeTicket({
    id: pickFirst(record, ["id", "identifier"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "summary"]) ?? "Untitled ticket",
    status: pickFirst(record, ["status", "state"]),
    assignee: pickFirst(record, ["assignee", "assigneeName"]),
    project: pickFirst(record, ["project", "projectName", "project_name", "repo", "repository"]),
    url: pickFirst(record, ["url", "html_url", "permalink"]),
    updatedAt: pickFirst(record, ["updatedAt"]),
    preview: summarizeText(pickFirst(record, ["description", "preview"])),
    source: app,
    estimatedChars: pickFirst(record, ["description", "body"])?.length,
  });
}

function normalizeEvent(app: string, item: unknown) {
  const record = asRecord(item);
  if (app === "googlemeet") {
    const meetingCode = pickFirst(record, ["meeting_code", "meetingCode"]);
    const spaceName = pickFirst(record, ["space_name", "name", "space"]);
    const uri = pickFirst(record, ["meetingUri", "meeting_uri", "uri"]);
    return integrationNormalizer.normalizeEvent({
      id: pickFirst(record, ["name", "space_name", "conferenceRecord_id", "conferenceRecordId", "meeting_code", "meetingCode"]) ?? crypto.randomUUID(),
      title: meetingCode || spaceName || "Google Meet",
      startAt: pickFirst(record, ["start_time", "startTime", "startAt"]),
      endAt: pickFirst(record, ["end_time", "endTime", "endAt"]),
      organizer: pickFirst(record, ["owner", "organizer", "host"]),
      project: pickFirst(record, ["spaceType", "meetingType", "conferenceType"]),
      attendees: toStringArray(record.attendees),
      source: app,
      estimatedChars: uri?.length,
    });
  }
  return integrationNormalizer.normalizeEvent({
    id: pickFirst(record, ["id"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "summary"]) ?? "Untitled event",
    startAt: pickFirst(record, ["startAt", "start"]),
    endAt: pickFirst(record, ["endAt", "end"]),
    attendees: toStringArray(record.attendees),
    organizer: pickFirst(record, ["organizer", "creator", "host", "owner"]),
    project: pickFirst(record, ["project", "projectName", "calendarName"]),
    source: app,
  });
}

function normalizeFile(app: string, item: unknown) {
  const record = asRecord(item);
  return integrationNormalizer.normalizeFile({
    id: pickFirst(record, ["id", "fileId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name"]) ?? "Untitled file",
    path: pickFirst(record, ["path"]),
    mimeType: pickFirst(record, ["mimeType", "mime_type"]),
    preview: summarizeText(pickFirst(record, ["preview", "description"])),
    source: app,
  });
}

function normalizeRecord(app: string, item: unknown) {
  const record = asRecord(item);
  if (app === "linkedin") {
    const localizedName = [
      pickFirst(record, ["localizedFirstName", "firstName", "given_name"]),
      pickFirst(record, ["localizedLastName", "lastName", "family_name"]),
    ].filter(Boolean).join(" ").trim();
    const headline = pickFirst(record, ["headline", "localizedHeadline", "commentary", "description"]);
    const handle = pickFirst(record, ["vanityName", "username"]);
    const companyName = pickFirst(record, ["organizationName", "localizedName", "name"]);
    const title = companyName || localizedName || pickFirst(record, ["title", "displayName", "subject"]) || "LinkedIn record";
    const previewParts = [headline, handle ? `@${handle}` : undefined].filter(Boolean);
    return integrationNormalizer.normalizeRecord({
      id: pickFirst(record, ["id", "author_id", "organization", "urn"]) ?? crypto.randomUUID(),
      title,
      recordType: companyName ? "linkedin_company" : "linkedin_profile",
      owner: localizedName || undefined,
      updatedAt: pickFirst(record, ["lastModifiedAt", "updatedAt"]),
      preview: summarizeText(previewParts.join(" • ")),
      source: app,
      estimatedChars: headline?.length,
    });
  }
  if (app === "hubspot") {
    const firstName = pickFirst(record, ["firstname", "firstName", "first_name"]);
    const lastName = pickFirst(record, ["lastname", "lastName", "last_name"]);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const companyName = pickFirst(record, ["company", "associatedcompanyid", "companyName"]);
    const email = pickFirst(record, ["email", "work_email"]);
    const jobTitle = pickFirst(record, ["jobtitle", "jobTitle"]);
    const title = fullName || companyName || email || pickFirst(record, ["name", "displayName", "subject"]) || "HubSpot record";
    const previewParts = [jobTitle, companyName, email].filter(Boolean);
    return integrationNormalizer.normalizeRecord({
      id: pickFirst(record, ["id", "contactId", "companyId", "dealId", "recordId", "objectId"]) ?? crypto.randomUUID(),
      title,
      recordType:
        pickFirst(record, ["objectType", "recordType", "type"]) ??
        (companyName && !fullName ? "hubspot_company" : "hubspot_contact"),
      owner: pickFirst(record, ["owner", "ownerName", "hubspot_owner_id", "owneremail", "ownername"]),
      updatedAt: pickFirst(record, ["updatedAt", "modifiedAt", "lastModifiedAt", "lastmodifieddate"]),
      preview: summarizeText(previewParts.join(" • ")),
      source: app,
      estimatedChars: [jobTitle, companyName, email].filter(Boolean).join(" ").length || undefined,
    });
  }
  if (app === "salesforce") {
    const attributesRecord = asRecord(record.attributes);
    const accountRecord = asRecord(record.Account);
    const ownerRecord = asRecord(record.Owner);
    const firstName = pickFirst(record, ["FirstName", "first_name", "firstName"]);
    const lastName = pickFirst(record, ["LastName", "last_name", "lastName"]);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const accountName =
      pickFirst(accountRecord, ["Name"]) ??
      pickFirst(record, ["account_name", "AccountName", "company", "companyName"]);
    const email = pickFirst(record, ["Email", "email"]);
    const jobTitle = pickFirst(record, ["Title", "title"]);
    const title = fullName || accountName || email || pickFirst(record, ["name", "displayName", "subject"]) || "Salesforce record";
    const previewParts = [jobTitle, accountName, email].filter(Boolean);
    return integrationNormalizer.normalizeRecord({
      id: pickFirst(record, ["Id", "id", "contact_id", "recordId", "objectId"]) ?? crypto.randomUUID(),
      title,
      recordType:
        pickFirst(attributesRecord, ["type"]) ??
        pickFirst(record, ["recordType", "type", "objectType"]) ??
        (accountName && !fullName ? "salesforce_account" : "salesforce_contact"),
      owner: pickFirst(ownerRecord, ["Name"]) ?? pickFirst(record, ["owner", "ownerName", "owner_id"]),
      updatedAt: pickFirst(record, ["LastModifiedDate", "updatedAt", "modifiedAt", "lastModifiedAt"]),
      preview: summarizeText(previewParts.join(" • ")),
      source: app,
      estimatedChars: [jobTitle, accountName, email].filter(Boolean).join(" ").length || undefined,
    });
  }
  if (app === "pipedrive") {
    const personName = pickFirst(record, ["name", "title", "displayName"]);
    const organizationName =
      pickFirst(asRecord(record.org_id), ["name"]) ??
      pickFirst(record, ["org_name", "organizationName", "company"]);
    const email = Array.isArray(record.email)
      ? record.email
          .map((entry) => typeof entry === "string" ? entry : pickFirst(asRecord(entry), ["value", "email"]))
          .find(Boolean)
      : pickFirst(record, ["email"]);
    const phone = Array.isArray(record.phone)
      ? record.phone
          .map((entry) => typeof entry === "string" ? entry : pickFirst(asRecord(entry), ["value", "phone"]))
          .find(Boolean)
      : pickFirst(record, ["phone"]);
    const title = personName || organizationName || email || phone || "Pipedrive record";
    const previewParts = [organizationName, email, phone].filter(Boolean);
    return integrationNormalizer.normalizeRecord({
      id: pickFirst(record, ["id", "person_id", "organization_id", "recordId", "objectId"]) ?? crypto.randomUUID(),
      title,
      recordType:
        pickFirst(record, ["recordType", "type", "objectType"]) ??
        (organizationName && !personName ? "pipedrive_organization" : "pipedrive_person"),
      owner: pickFirst(record, ["owner_name", "ownerName", "owner", "assigned_to"]),
      updatedAt: pickFirst(record, ["update_time", "updatedAt", "modifiedAt", "lastModifiedAt"]),
      preview: summarizeText(previewParts.join(" • ")),
      source: app,
      estimatedChars: [organizationName, email, phone].filter(Boolean).join(" ").length || undefined,
    });
  }
  return integrationNormalizer.normalizeRecord({
    id: pickFirst(record, ["id", "recordId", "objectId", "dealId", "contactId", "companyId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name", "displayName", "subject"]) ?? "Untitled record",
    recordType: pickFirst(record, ["recordType", "type", "objectType"]),
    owner: pickFirst(record, ["owner", "ownerName", "assignee"]),
    updatedAt: pickFirst(record, ["updatedAt", "modifiedAt", "lastModifiedAt"]),
    preview: summarizeText(pickFirst(record, ["preview", "description", "notes", "summary"])),
    source: app,
    estimatedChars: pickFirst(record, ["description", "notes", "summary"])?.length,
  });
}

function normalizeCode(app: string, item: unknown) {
  const record = asRecord(item);
  return integrationNormalizer.normalizeCode({
    id: pickFirst(record, ["id", "fileId", "blobId", "path"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name", "path"]) ?? "Untitled code item",
    path: pickFirst(record, ["path", "filePath"]),
    repository: pickFirst(record, ["repository", "repo", "repoName", "project"]),
    preview: summarizeText(pickFirst(record, ["preview", "content", "snippet", "description"])),
    source: app,
    estimatedChars: pickFirst(record, ["content", "snippet"])?.length,
  });
}

function normalizeSpreadsheet(app: string, item: unknown) {
  const record = asRecord(item);
  const valuesArray = Array.isArray(record.values) ? record.values : Array.isArray(record.rowValues) ? record.rowValues : undefined;
  const previewFromValues = valuesArray
    ? summarizeText(
        valuesArray
          .map((entry) => {
            if (Array.isArray(entry)) return entry.join(" | ");
            if (typeof entry === "string") return entry;
            if (typeof entry === "number" || typeof entry === "boolean") return String(entry);
            return "";
          })
          .filter(Boolean)
          .join(" ; "),
      )
    : undefined;
  return integrationNormalizer.normalizeSpreadsheet({
    id: pickFirst(record, ["rowId", "recordId", "id", "spreadsheet_id", "spreadsheetId"]) ?? crypto.randomUUID(),
    title: pickFirst(record, ["title", "name", "primaryField", "label", "sheet_name", "sheetName"]) ?? "Untitled row",
    sheetName: pickFirst(record, ["sheetName", "sheet_name", "tableName", "worksheet", "sheet"]),
    rowLabel: pickFirst(record, ["rowLabel", "primaryField", "label", "query"]),
    preview: previewFromValues ?? summarizeText(pickFirst(record, ["preview", "summary", "content", "values"])),
    source: app,
    estimatedChars: previewFromValues?.length ?? pickFirst(record, ["summary", "content", "values"])?.length,
  });
}

export function normalizeResource(app: string, resourceType: IntegrationResourceType, item: unknown) {
  switch (resourceType) {
    case "message":
      return normalizeMessage(app, item);
    case "document":
      return normalizeDocument(app, item);
    case "ticket":
      return normalizeTicket(app, item);
    case "event":
      return normalizeEvent(app, item);
    case "file":
      return normalizeFile(app, item);
    case "record":
      return normalizeRecord(app, item);
    case "code":
      return normalizeCode(app, item);
    case "spreadsheet":
      return normalizeSpreadsheet(app, item);
    default:
      return null;
  }
}

export function buildStructuredView(app: string, resourceType: IntegrationResourceType, item: unknown) {
  const record = asRecord(item);
  const normalized = normalizeResource(app, resourceType, item);
  const body = pickFirst(record, ["body", "textBody", "text", "content", "description"]);

  switch (resourceType) {
    case "message":
      return {
        kind: "message",
        normalized,
        threadId: pickFirst(record, ["threadId", "threadTs", "conversationId"]),
        recipients: toStringArray(record.to) ?? toStringArray(record.recipients),
        bodyPreview: summarizeText(body, 600),
      };
    case "document":
      return {
        kind: "document",
        normalized,
        bodyPreview: summarizeText(body, 800),
        headings: toStringArray(record.headings),
      };
    case "ticket":
      return {
        kind: "ticket",
        normalized,
        labels: toStringArray(record.labels),
        repository: pickFirst(record, ["repository", "repositoryName", "repo", "full_name"]),
        reason: pickFirst(record, ["reason", "notificationReason"]),
        bodyPreview: summarizeText(body, 800),
      };
    case "event":
      if (app === "googlemeet") {
        const conferenceRecordId = pickFirst(record, ["conferenceRecordId", "conferenceRecord_id"]);
        const recordingCount =
          typeof record.recordingCount === "number"
            ? record.recordingCount
            : Array.isArray(record.recordings)
              ? record.recordings.length
              : undefined;
        const transcriptCount =
          typeof record.transcriptCount === "number"
            ? record.transcriptCount
            : Array.isArray(record.transcripts)
              ? record.transcripts.length
              : undefined;
        const artifactPreviewParts = [
          conferenceRecordId ? `conference ${conferenceRecordId}` : undefined,
          typeof recordingCount === "number" ? `${recordingCount} recording${recordingCount === 1 ? "" : "s"}` : undefined,
          typeof transcriptCount === "number" ? `${transcriptCount} transcript${transcriptCount === 1 ? "" : "s"}` : undefined,
        ].filter(Boolean);
        return {
          kind: "event",
          normalized,
          location: pickFirst(record, ["location"]),
          meetingCode: pickFirst(record, ["meeting_code", "meetingCode"]),
          conferenceRecordId,
          recordingCount,
          transcriptCount,
          artifactPreview: artifactPreviewParts.length ? artifactPreviewParts.join(" • ") : undefined,
          notesPreview: summarizeText(body, 600),
        };
      }
      return {
        kind: "event",
        normalized,
        location: pickFirst(record, ["location"]),
        notesPreview: summarizeText(body, 600),
      };
    case "file":
      return {
        kind: "file",
        normalized,
        fileSize: record.size,
        preview: summarizeText(pickFirst(record, ["preview", "description", "text"]), 600),
      };
    case "record":
      return {
        kind: "record",
        normalized,
        owner: pickFirst(record, ["owner", "ownerName", "assignee"]),
        recordType: pickFirst(record, ["recordType", "type", "objectType"]),
        authorId: pickFirst(record, ["author_id"]),
        companyUrn: pickFirst(record, ["organization", "urn"]),
        bodyPreview: summarizeText(body || pickFirst(record, ["summary", "notes"]), 800),
      };
    case "code":
      return {
        kind: "code",
        normalized,
        repository: pickFirst(record, ["repository", "repo", "repoName", "project"]),
        path: pickFirst(record, ["path", "filePath"]),
        bodyPreview: summarizeText(body || pickFirst(record, ["snippet", "preview"]), 800),
      };
    case "spreadsheet":
      return {
        kind: "spreadsheet",
        normalized,
        sheetName: pickFirst(record, ["sheetName", "tableName", "worksheet", "sheet"]),
        rowLabel: pickFirst(record, ["rowLabel", "primaryField", "label"]),
        bodyPreview: summarizeText(body || pickFirst(record, ["summary", "values"]), 800),
      };
    default:
      return {
        kind: resourceType,
        normalized,
      };
  }
}

export function buildSummaryView(app: string, resourceType: IntegrationResourceType, item: unknown) {
  const structured = buildStructuredView(app, resourceType, item) as Record<string, unknown>;
  const normalized = structured.normalized as Record<string, unknown> | undefined;
  const title = typeof normalized?.title === "string" ? normalized.title : "Untitled";
  const preview =
    (typeof structured.bodyPreview === "string" && structured.bodyPreview) ||
    (typeof structured.preview === "string" && structured.preview) ||
    (typeof structured.notesPreview === "string" && structured.notesPreview) ||
    (typeof normalized?.snippet === "string" && normalized.snippet) ||
    (typeof normalized?.preview === "string" && normalized.preview) ||
    "";

  return {
    kind: resourceType,
    title,
    summary: summarizeText(preview, 320) ?? "",
    normalized,
  };
}

export function buildSlicesView(app: string, resourceType: IntegrationResourceType, item: unknown) {
  const record = asRecord(item);
  const body = pickFirst(record, ["body", "textBody", "text", "content", "description"]);
  return {
    kind: resourceType,
    normalized: normalizeResource(app, resourceType, item),
    slices: sliceText(body, 500),
  };
}
