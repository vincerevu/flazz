import { type Memory, type MemoryConfig, type IMemoryRepo } from './types.js';

export class MemoryManager {
  private snapshot: string | null = null;
  private snapshotTimestamp: number = 0;
  private readonly SNAPSHOT_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private repo: IMemoryRepo,
    private config: MemoryConfig
  ) {}

  async append(section: 'agent' | 'user', content: string): Promise<void> {
    // Write to repo
    await this.repo.write(section, content);

    // Invalidate snapshot
    this.invalidateSnapshot();

    // Check if needs curation
    const memory = await this.repo.read();
    const sectionContent = section === 'agent' ? memory.agent : memory.user;
    const totalChars = sectionContent.reduce(
      (sum, s) => sum + s.content.length,
      0
    );

    const maxChars =
      section === 'agent'
        ? this.config.agentMaxChars
        : this.config.userMaxChars;

    if (totalChars > maxChars) {
      await this.curate(section);
    }
  }

  async curate(section: 'agent' | 'user'): Promise<void> {
    const memory = await this.repo.read();
    const sections = section === 'agent' ? memory.agent : memory.user;

    // Keep only recent entries that fit within limit
    const maxChars =
      section === 'agent'
        ? this.config.agentMaxChars
        : this.config.userMaxChars;

    let totalChars = 0;
    const kept: typeof sections = [];

    // Keep from newest to oldest until we hit the limit
    for (let i = sections.length - 1; i >= 0; i--) {
      const entry = sections[i];
      if (totalChars + entry.content.length <= maxChars) {
        kept.unshift(entry);
        totalChars += entry.content.length;
      } else {
        break;
      }
    }

    // Rewrite the file with curated content
    await this.repo.clear(section);
    for (const entry of kept) {
      await this.repo.write(section, entry.content);
    }

    this.invalidateSnapshot();
  }

  async getContext(): Promise<string> {
    const now = Date.now();

    // Return cached snapshot if still valid
    if (this.snapshot && now - this.snapshotTimestamp < this.SNAPSHOT_TTL) {
      return this.snapshot;
    }

    // Build new snapshot
    this.snapshot = await this.buildSnapshot();
    this.snapshotTimestamp = now;

    return this.snapshot;
  }

  private async buildSnapshot(): Promise<string> {
    const memory = await this.repo.read();

    const parts: string[] = [
      '[MEMORY - Agent Notes]',
      ...memory.agent.map(
        (s) => `${this.config.delimiter} ${s.timestamp}: ${s.content}`
      ),
      '',
      '[MEMORY - User Profile]',
      ...memory.user.map(
        (s) => `${this.config.delimiter} ${s.timestamp}: ${s.content}`
      ),
    ];

    return parts.join('\n');
  }

  invalidateSnapshot(): void {
    this.snapshot = null;
  }

  async search(query: string): Promise<string[]> {
    const results = await this.repo.search(query);
    return results.map((r) => `${r.timestamp}: ${r.content}`);
  }
}
