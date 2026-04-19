import { RetrievedContextBundle } from "@flazz/shared";
import { MemoryManager } from "../memory/memory-manager.js";
import { MemorySearchProvider } from "../search/memory_search.js";
import { RunMemoryService } from "../run-memory/run-memory-service.js";
import { rankSkills } from "./ranking.js";
import { resolveRetrievalLimits } from "./budget-policy.js";
import type { RetrievalOptions, RetrievedContextBundle as RetrievedContextBundleType } from "./types.js";
import { SkillRegistry } from "../skills/registry.js";

export class RetrievalController {
  constructor(
    private memoryManager: MemoryManager,
    private skillRegistry: SkillRegistry,
    private memorySearch: MemorySearchProvider,
    private runMemoryService: RunMemoryService
  ) {}

  async retrieve(query: string, options?: RetrievalOptions): Promise<RetrievedContextBundleType> {
    const limits = resolveRetrievalLimits(options);
    const bundle: RetrievedContextBundleType = {
      query,
      hotMemoryContext: undefined,
      memoryNotes: [],
      skills: [],
      runMemories: [],
    };

    if (options?.includeMemory !== false) {
      bundle.hotMemoryContext = await this.memoryManager.getContext();
    }

    if (options?.includeSkills !== false) {
      const skills = await this.skillRegistry.list();
      bundle.skills = rankSkills(query, skills)
        .slice(0, limits.skillLimit)
        .map(({ skill, scoreBreakdown }) => ({
          source: "skill" as const,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          path: skill.path,
          skillSource: skill.source,
          content: skill.content,
          score: scoreBreakdown.total,
          scoreBreakdown,
        }));
    }

    if (options?.includeMemorySearch) {
      const memoryNotes = await this.memorySearch.search(query, limits.memorySearchLimit);
      bundle.memoryNotes = memoryNotes.map((note, index) => ({
        source: "memory-note" as const,
        title: note.title,
        path: note.path,
        preview: note.preview,
        score: note.score ?? Math.max(1, limits.memorySearchLimit - index),
        scoreBreakdown: note.scoreBreakdown
          ? {
              keyword: note.scoreBreakdown.keyword,
              recency: note.scoreBreakdown.recency,
              graph: note.scoreBreakdown.graph,
              usage: 0,
              failurePenalty: 0,
              total: note.scoreBreakdown.total,
            }
          : undefined,
      }));
    }

    if (options?.includeRunMemory !== false) {
      const runMemories = this.runMemoryService.search(query, limits.runMemoryLimit);
      bundle.runMemories = runMemories.map((record) => ({
        source: "run-memory" as const,
        id: record.id,
        runId: record.runId,
        agentId: record.agentId,
        summary: record.summary,
        preview: record.preview,
        firstUserMessage: record.firstUserMessage,
        entityRefs: record.entityRefs,
        topicRefs: record.topicRefs,
        projectRefs: record.projectRefs,
        skillRefs: record.skillRefs,
        toolRefs: record.toolRefs,
        outcome: record.outcome,
        failureCategory: record.failureCategory,
        createdAt: record.createdAt,
        score: record.score ?? 0,
        scoreBreakdown: {
          keyword: record.score ?? 0,
          recency: 0,
          graph: 0,
          usage: 0,
          failurePenalty: 0,
          total: record.score ?? 0,
        },
      }));
    }

    return RetrievedContextBundle.parse(bundle);
  }
}
