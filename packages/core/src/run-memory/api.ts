import { ListRunMemoryResponse } from "@flazz/shared";
import { runMemoryService } from "../di/container.js";

export function listRunMemory(limit = 20) {
  const records = runMemoryService.list(limit);
  return ListRunMemoryResponse.parse({
    records,
    count: records.length,
  });
}

export function searchRunMemory(query: string, limit = 5) {
  const records = runMemoryService.search(query, limit);
  return ListRunMemoryResponse.parse({
    records,
    count: records.length,
  });
}
