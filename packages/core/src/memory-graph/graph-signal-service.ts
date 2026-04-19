import { GraphSignal as GraphSignalSchema } from "@flazz/shared/dist/graph-signals.js";
import { IntegrationResourceType as IntegrationResourceTypeSchema } from "@flazz/shared/dist/integration-resources.js";
import { z } from "zod";
import { extractGraphSignalsFromNormalized } from "./integration-signal-extractors.js";
import { GraphSignalRepo } from "./graph-signal-repo.js";
import { extractConversationSignalsFromRunMemory } from "./conversation-signal-extractors.js";
import type { RunMemoryRecord } from "../run-memory/run-memory-types.js";
import type { GraphSyncService } from "./graph-sync-service.js";

type GraphSignal = z.infer<typeof GraphSignalSchema>;
type IntegrationResourceType = z.infer<typeof IntegrationResourceTypeSchema>;

const INTERNAL_RUN_MEMORY_EXCLUDED_AGENTS = new Set([
  "note_creation",
  "labeling_agent",
  "email-draft",
  "meeting-prep",
]);

type GraphSignalPromoter = {
  promote(signal: GraphSignal, allSignals?: GraphSignal[]): { path: string; created: boolean; aggregatePaths?: string[] };
};

export class GraphSignalService {
  constructor(
    private repo: GraphSignalRepo,
    private promoter?: GraphSignalPromoter,
    private graphSyncService?: Pick<GraphSyncService, "recordSignalBatch">
  ) {}

  ingestNormalizedItem(app: string, resourceType: IntegrationResourceType, item: unknown) {
    const signals = extractGraphSignalsFromNormalized(app, resourceType, item);
    return this.persistSignals(signals);
  }

  ingestRunMemoryRecord(record: RunMemoryRecord) {
    if (INTERNAL_RUN_MEMORY_EXCLUDED_AGENTS.has(record.agentId)) {
      return { signals: [], count: 0, written: [] };
    }

    const signals = extractConversationSignalsFromRunMemory(record);
    return this.persistSignals(signals);
  }

  private persistSignals(signals: GraphSignal[]) {
    this.graphSyncService?.recordSignalBatch(signals);
    const written = signals.map((signal) => {
      const repoResult = this.repo.upsert(signal);
      const promoteResult = this.promoter?.promote(signal, this.repo.list());
      return {
        signal,
        created: repoResult.created,
        path: promoteResult?.path,
        aggregatePaths: promoteResult?.aggregatePaths ?? [],
      };
    });

    return {
      signals,
      count: signals.length,
      written,
    };
  }

  list(limit = 50) {
    return this.repo.list().slice(0, limit);
  }
}
