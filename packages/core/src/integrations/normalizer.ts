import {
  CodeItem,
  DocumentItem,
  EventItem,
  FileItem,
  MessageItem,
  RecordItem,
  SpreadsheetItem,
  TicketItem,
} from "@flazz/shared/dist/integration-resources.js";

export class IntegrationNormalizer {
  normalizeMessage(input: unknown) {
    return MessageItem.parse(input);
  }

  normalizeDocument(input: unknown) {
    return DocumentItem.parse(input);
  }

  normalizeTicket(input: unknown) {
    return TicketItem.parse(input);
  }

  normalizeEvent(input: unknown) {
    return EventItem.parse(input);
  }

  normalizeFile(input: unknown) {
    return FileItem.parse(input);
  }

  normalizeRecord(input: unknown) {
    return RecordItem.parse(input);
  }

  normalizeCode(input: unknown) {
    return CodeItem.parse(input);
  }

  normalizeSpreadsheet(input: unknown) {
    return SpreadsheetItem.parse(input);
  }
}

