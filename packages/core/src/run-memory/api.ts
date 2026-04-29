import { ListRunMemoryResponse } from "@flazz/shared";
import { runMemoryService } from "../di/container.js";

export async function listRunMemory(limit = 20) {
  const records = await runMemoryService.list(limit);
  return ListRunMemoryResponse.parse({
    records,
    count: records.length,
  });
}

export async function searchRunMemory(query: string, limit = 5) {
  const records = await runMemoryService.search(query, limit);
  return ListRunMemoryResponse.parse({
    records,
    count: records.length,
  });
}
