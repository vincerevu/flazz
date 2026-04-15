import { type MemoryConfig, type IMemoryRepo } from './types.js';

export class MemoryManager {
  // Frozen snapshot for system prompt (captured at session start)
  private frozenSnapshot: string | null = null;
  private isFrozen: boolean = false;

  constructor(
    private repo: IMemoryRepo,
    private config: MemoryConfig
  ) {}

  /**
   * Initialize and capture frozen snapshot for system prompt.
   * Call this at session start. Snapshot stays frozen entire session.
   */
  async initialize(): Promise<void> {
    this.frozenSnapshot = await this.buildSnapshot();
    this.isFrozen = true;
  }

  /**
   * Get system prompt context.
   * Returns frozen snapshot (never changes mid-session).
   * This preserves prefix cache for entire session.
   */
  async getContext(): Promise<string> {
    if (!this.isFrozen || !this.frozenSnapshot) {
      // First call or not initialized - build and freeze
      this.frozenSnapshot = await this.buildSnapshot();
      this.isFrozen = true;
    }
    return this.frozenSnapshot;
  }

  /**
   * Add new entry to memory.
   * Updates file on disk but does NOT update frozen snapshot.
   */
  async add(section: 'agent' | 'user', content: string): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    usage?: string;
  }> {
    content = content.trim();
    if (!content) {
      return { success: false, error: 'Content cannot be empty.' };
    }

    // Check for duplicates
    const memory = await this.repo.read();
    const entries = section === 'agent' ? memory.agent : memory.user;
    
    if (entries.some((e) => e.content === content)) {
      return {
        success: true,
        message: 'Entry already exists (no duplicate added).',
        usage: this.getUsage(section, entries),
      };
    }

    // Check if adding would exceed limit
    const currentChars = this.calculateChars(entries);
    const newChars = currentChars + content.length;
    const maxChars = section === 'agent' 
      ? this.config.agentMaxChars 
      : this.config.userMaxChars;

    if (newChars > maxChars) {
      return {
        success: false,
        error: `Memory at ${currentChars.toLocaleString()}/${maxChars.toLocaleString()} chars. Adding this entry (${content.length} chars) would exceed the limit. Replace or remove existing entries first.`,
        usage: this.getUsage(section, entries),
      };
    }

    // Write to disk
    await this.repo.write(section, content);

    return {
      success: true,
      message: 'Entry added.',
      usage: this.getUsage(section, [...entries, { content }]),
    };
  }

  /**
   * Replace entry containing old_text with new content.
   * Uses substring matching like Hermes.
   */
  async replace(
    section: 'agent' | 'user',
    oldText: string,
    newContent: string
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    matches?: string[];
  }> {
    oldText = oldText.trim();
    newContent = newContent.trim();

    if (!oldText) {
      return { success: false, error: 'old_text cannot be empty.' };
    }
    if (!newContent) {
      return {
        success: false,
        error: "new_content cannot be empty. Use 'remove' to delete entries.",
      };
    }

    const memory = await this.repo.read();
    const entries = section === 'agent' ? memory.agent : memory.user;

    // Find matches by substring
    const matches = entries.filter((e) => e.content.includes(oldText));

    if (matches.length === 0) {
      return { success: false, error: `No entry matched '${oldText}'.` };
    }

    if (matches.length > 1) {
      // Check if all matches are identical
      const uniqueContents = new Set(matches.map((m) => m.content));
      if (uniqueContents.size > 1) {
        return {
          success: false,
          error: `Multiple entries matched '${oldText}'. Be more specific.`,
          matches: matches.map((m) =>
            m.content.length > 80
              ? m.content.slice(0, 80) + '...'
              : m.content
          ),
        };
      }
      // All identical - replace first one
    }

    // Find index of first match
    const idx = entries.findIndex((e) => e.content.includes(oldText));

    // Check if replacement would exceed limit
    const testEntries = [...entries];
    testEntries[idx] = { content: newContent };
    const newTotal = this.calculateChars(testEntries);
    const maxChars = section === 'agent'
      ? this.config.agentMaxChars
      : this.config.userMaxChars;

    if (newTotal > maxChars) {
      return {
        success: false,
        error: `Replacement would put memory at ${newTotal.toLocaleString()}/${maxChars.toLocaleString()} chars. Shorten the new content or remove other entries first.`,
      };
    }

    // Replace entry
    testEntries[idx] = { content: newContent };
    await this.repo.atomicWrite(section, testEntries);

    return { success: true, message: 'Entry replaced.' };
  }

  /**
   * Remove entry containing old_text.
   * Uses substring matching like Hermes.
   */
  async remove(
    section: 'agent' | 'user',
    oldText: string
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    matches?: string[];
  }> {
    oldText = oldText.trim();

    if (!oldText) {
      return { success: false, error: 'old_text cannot be empty.' };
    }

    const memory = await this.repo.read();
    const entries = section === 'agent' ? memory.agent : memory.user;

    // Find matches by substring
    const matches = entries.filter((e) => e.content.includes(oldText));

    if (matches.length === 0) {
      return { success: false, error: `No entry matched '${oldText}'.` };
    }

    if (matches.length > 1) {
      // Check if all matches are identical
      const uniqueContents = new Set(matches.map((m) => m.content));
      if (uniqueContents.size > 1) {
        return {
          success: false,
          error: `Multiple entries matched '${oldText}'. Be more specific.`,
          matches: matches.map((m) =>
            m.content.length > 80
              ? m.content.slice(0, 80) + '...'
              : m.content
          ),
        };
      }
      // All identical - remove first one
    }

    // Remove first match
    const newEntries = entries.filter(
      (e, i) => i !== entries.findIndex((entry) => entry.content.includes(oldText))
    );
    await this.repo.atomicWrite(section, newEntries);

    return { success: true, message: 'Entry removed.' };
  }

  /**
   * Auto-curate when memory exceeds limit.
   * Keep newest entries that fit within limit.
   */
  async curate(section: 'agent' | 'user'): Promise<void> {
    const memory = await this.repo.read();
    const entries = section === 'agent' ? memory.agent : memory.user;

    const maxChars = section === 'agent'
      ? this.config.agentMaxChars
      : this.config.userMaxChars;

    let totalChars = 0;
    const kept: typeof entries = [];

    // Keep from newest to oldest until we hit the limit
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (totalChars + entry.content.length <= maxChars) {
        kept.unshift(entry);
        totalChars += entry.content.length;
      } else {
        break;
      }
    }

    // Rewrite with curated content
    await this.repo.atomicWrite(section, kept);
  }

  async search(query: string): Promise<string[]> {
    const results = await this.repo.search(query);
    return results.map((r) => r.content);
  }

  // Private helpers

  private async buildSnapshot(): Promise<string> {
    const memory = await this.repo.read();

    const agentBlock = this.renderBlock('memory', memory.agent);
    const userBlock = this.renderBlock('user', memory.user);

    const parts: string[] = [];
    if (agentBlock) parts.push(agentBlock);
    if (userBlock) parts.push(userBlock);

    return parts.join('\n\n');
  }

  private renderBlock(target: 'memory' | 'user', entries: { content: string }[]): string {
    if (entries.length === 0) {
      return '';
    }

    const maxChars = target === 'memory'
      ? this.config.agentMaxChars
      : this.config.userMaxChars;

    const content = entries.map((e) => e.content).join(this.config.delimiter);
    const currentChars = content.length;
    const pct = Math.min(100, Math.floor((currentChars / maxChars) * 100));

    const header = target === 'user'
      ? `USER PROFILE (who the user is) [${pct}% — ${currentChars.toLocaleString()}/${maxChars.toLocaleString()} chars]`
      : `MEMORY (your personal notes) [${pct}% — ${currentChars.toLocaleString()}/${maxChars.toLocaleString()} chars]`;

    const separator = '═'.repeat(46);

    return `${separator}\n${header}\n${separator}\n${content}`;
  }

  private calculateChars(entries: { content: string }[]): number {
    if (entries.length === 0) return 0;
    return entries.map((e) => e.content).join(this.config.delimiter).length;
  }

  private getUsage(section: 'agent' | 'user', entries: { content: string }[]): string {
    const currentChars = this.calculateChars(entries);
    const maxChars = section === 'agent'
      ? this.config.agentMaxChars
      : this.config.userMaxChars;
    const pct = Math.min(100, Math.floor((currentChars / maxChars) * 100));
    return `${pct}% — ${currentChars.toLocaleString()}/${maxChars.toLocaleString()} chars`;
  }
}
