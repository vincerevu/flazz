import {
  DocumentItem,
  EventItem,
  FileItem,
  MessageItem,
  TicketItem,
} from "@flazz/shared";

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
}

