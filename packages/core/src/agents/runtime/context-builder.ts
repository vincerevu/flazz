import { MemoryManager } from '../../memory/memory-manager.js';
import { SkillRegistry } from '../../skills/registry.js';
import { MemorySearchProvider } from '../../search/memory_search.js';

export interface ContextOptions {
  includeMemory?: boolean; // default: true
  includeSkills?: boolean; // default: true
  includeMemorySearch?: boolean; // default: false
  memorySearchLimit?: number; // default: 5
}

export class ContextBuilder {
  constructor(
    private memoryManager: MemoryManager,
    private skillRegistry: SkillRegistry,
    private memorySearch: MemorySearchProvider
  ) {}

  /**
   * Build context for agent based on query and options
   * Returns array of context strings to include in system prompt
   */
  async buildContext(query: string, options?: ContextOptions): Promise<string[]> {
    const context: string[] = [];

    // 1. Always include hot memory (free via prefix cache)
    if (options?.includeMemory !== false) {
      const memoryContext = await this.memoryManager.getContext();
      if (memoryContext) {
        context.push(memoryContext);
      }
    }

    // 2. Load relevant skills
    if (options?.includeSkills !== false) {
      const skills = await this.findRelevantSkills(query);
      if (skills.length > 0) {
        const skillsContext = this.formatSkillsContext(skills);
        context.push(skillsContext);
      }
    }

    // 3. Search workspace memory notes only if needed
    if (options?.includeMemorySearch) {
      const limit = options.memorySearchLimit ?? 5;
      const memoryResults = await this.memorySearch.search(query, limit);
      if (memoryResults.length > 0) {
        const memoryContext = this.formatMemoryContext(memoryResults);
        context.push(memoryContext);
      }
    }

    return context;
  }

  /**
   * Find skills relevant to the query
   * Uses simple keyword matching for now
   */
  private async findRelevantSkills(query: string): Promise<
    Array<{ name: string; description: string; content: string }>
  > {
    const allSkills = (await this.skillRegistry.list()).filter(
      (skill) => skill.source === 'workspace'
    );
    const queryWords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const scored = allSkills
      .map((skill) => {
        const haystacks = {
          name: skill.name.toLowerCase(),
          description: skill.description.toLowerCase(),
          category: (skill.category || '').toLowerCase(),
          tags: (skill.tags || []).join(' ').toLowerCase(),
          content: skill.content.toLowerCase(),
        };

        let score = 0;
        for (const word of queryWords) {
          if (haystacks.name.includes(word)) score += 6;
          if (haystacks.tags.includes(word)) score += 4;
          if (haystacks.category.includes(word)) score += 3;
          if (haystacks.description.includes(word)) score += 2;
          if (haystacks.content.includes(word)) score += 1;
        }

        if (haystacks.content.includes('## when to use')) score += 1;
        if (haystacks.content.includes('## steps')) score += 1;

        return { skill, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return scored.map(({ skill }) => ({
      name: skill.name,
      description: skill.description,
      content: skill.content,
    }));
  }

  /**
   * Format skills for context
   */
  private formatSkillsContext(
    skills: Array<{ name: string; description: string; content: string }>
  ): string {
    const separator = '═'.repeat(46);
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

  /**
   * Format memory search results for context
   */
  private formatMemoryContext(
    results: Array<{ type: string; title: string; preview: string; path: string }>
  ): string {
    const separator = '═'.repeat(46);
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
}
