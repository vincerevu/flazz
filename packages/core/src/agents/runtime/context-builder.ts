import { MemoryManager } from '../../memory/memory-manager.js';
import { SkillManager } from '../../skills/skill-manager.js';
import { KnowledgeSearchProvider } from '../../search/knowledge_search.js';

export interface ContextOptions {
  includeMemory?: boolean; // default: true
  includeSkills?: boolean; // default: true
  includeKnowledge?: boolean; // default: false (only if needed)
  knowledgeLimit?: number; // default: 5
}

export class ContextBuilder {
  constructor(
    private memoryManager: MemoryManager,
    private skillManager: SkillManager,
    private knowledgeSearch: KnowledgeSearchProvider
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

    // 3. Search knowledge only if needed
    if (options?.includeKnowledge) {
      const limit = options.knowledgeLimit ?? 5;
      const knowledgeResults = await this.knowledgeSearch.search(query, limit);
      if (knowledgeResults.length > 0) {
        const knowledgeContext = this.formatKnowledgeContext(knowledgeResults);
        context.push(knowledgeContext);
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
    const allSkills = await this.skillManager.list();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    const relevant = allSkills.filter((skill) => {
      const searchText = [
        skill.name,
        skill.frontmatter.description,
        ...(skill.frontmatter.tags || []),
        skill.frontmatter.category || '',
      ]
        .join(' ')
        .toLowerCase();

      // Match if any query word appears in skill metadata
      return queryWords.some((word) => searchText.includes(word));
    });

    return relevant.map((skill) => ({
      name: skill.name,
      description: skill.frontmatter.description,
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
   * Format knowledge search results for context
   */
  private formatKnowledgeContext(
    results: Array<{ type: string; title: string; preview: string; path: string }>
  ): string {
    const separator = '═'.repeat(46);
    let output = `${separator}\n`;
    output += `RELEVANT KNOWLEDGE (${results.length} notes)\n`;
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
