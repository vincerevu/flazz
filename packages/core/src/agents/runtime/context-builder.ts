import { RetrievalController } from "../../retrieval/retrieval-controller.js";

export interface ContextOptions {
  includeMemory?: boolean; // default: true
  includeSkills?: boolean; // default: true
  includeMemorySearch?: boolean; // default: false
  includeRunMemory?: boolean; // default: true
  memorySearchLimit?: number; // default: 5
  skillLimit?: number; // default: 3
  runMemoryLimit?: number; // default: 3
}

export class ContextBuilder {
  constructor(private retrievalController: RetrievalController) {}

  /**
   * Build context for agent based on query and options
   * Returns array of context strings to include in system prompt
   */
  async buildContext(query: string, options?: ContextOptions): Promise<string[]> {
    const bundle = await this.retrievalController.retrieve(query, options);
    const context: string[] = [];

    if (bundle.hotMemoryContext) {
      context.push(bundle.hotMemoryContext);
    }

    if (bundle.skills.length > 0) {
      context.push(this.formatSkillsContext(bundle.skills));
    }

    if (bundle.memoryNotes.length > 0) {
      context.push(this.formatMemoryContext(bundle.memoryNotes));
    }

    if (bundle.runMemories.length > 0) {
      context.push(this.formatRunMemoryContext(bundle.runMemories));
    }

    return context;
  }

  private formatSkillsContext(
    skills: Array<{ name: string; content: string }>
  ): string {
    const separator = "═".repeat(46);
    let output = `${separator}\n`;
    output += `AVAILABLE SKILLS (${skills.length})\n`;
    output += `${separator}\n\n`;

    for (const skill of skills) {
      output += `## Skill: ${skill.name}\n\n`;
      output += `${skill.content}\n\n`;
      output += `---\n\n`;
    }

    return output;
  }

  private formatMemoryContext(
    results: Array<{ title: string; preview: string; path: string }>
  ): string {
    const separator = "═".repeat(46);
    let output = `${separator}\n`;
    output += `RELEVANT MEMORY NOTES (${results.length} notes)\n`;
    output += `${separator}\n\n`;

    for (const result of results) {
      output += `### ${result.title}\n`;
      output += `Path: ${result.path}\n`;
      output += `Preview: ${result.preview}\n\n`;
    }

    output += `Use workspace-readFile to read full content if needed.\n\n`;
    return output;
  }

  private formatRunMemoryContext(
    results: Array<{
      summary: string;
      runId: string;
      agentId: string;
      outcome: string;
      createdAt: string;
      skillRefs: string[];
      toolRefs: string[];
    }>
  ): string {
    const separator = "═".repeat(46);
    let output = `${separator}\n`;
    output += `RELEVANT PRIOR RUNS (${results.length})\n`;
    output += `${separator}\n\n`;

    for (const result of results) {
      output += `### ${result.summary}\n`;
      output += `Run: ${result.runId} · Agent: ${result.agentId} · Outcome: ${result.outcome}\n`;
      if (result.skillRefs.length) {
        output += `Skills: ${result.skillRefs.join(", ")}\n`;
      }
      if (result.toolRefs.length) {
        output += `Tools: ${result.toolRefs.join(", ")}\n`;
      }
      output += `When: ${result.createdAt}\n\n`;
    }

    output += `Use run-memory tooling for deeper inspection if needed.\n\n`;
    return output;
  }
}
