import fs from 'node:fs/promises';
import path from 'node:path';
import { type Memory, type MemorySection, type IMemoryRepo } from './types.js';

export class MemoryRepo implements IMemoryRepo {
  private agentPath: string;
  private userPath: string;
  private readonly delimiter = '\n§\n'; // Hermes format

  constructor(workspacePath: string) {
    const memoryDir = path.join(workspacePath, 'memory');
    this.agentPath = path.join(memoryDir, 'MEMORY.md');
    this.userPath = path.join(memoryDir, 'USER.md');
  }

  async ensureMemoryDir(): Promise<void> {
    const memoryDir = path.dirname(this.agentPath);
    await fs.mkdir(memoryDir, { recursive: true });

    // Create empty files if not exist
    try {
      await fs.access(this.agentPath);
    } catch {
      await fs.writeFile(this.agentPath, '', 'utf-8');
    }

    try {
      await fs.access(this.userPath);
    } catch {
      await fs.writeFile(this.userPath, '', 'utf-8');
    }
  }

  async read(): Promise<Memory> {
    await this.ensureMemoryDir();

    const [agentContent, userContent] = await Promise.all([
      fs.readFile(this.agentPath, 'utf-8'),
      fs.readFile(this.userPath, 'utf-8'),
    ]);

    return {
      agent: this.parseMemory(agentContent),
      user: this.parseMemory(userContent),
    };
  }

  private parseMemory(content: string): MemorySection[] {
    if (!content.trim()) {
      return [];
    }

    // Split by delimiter and filter empty entries
    const entries = content
      .split(this.delimiter)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    // Deduplicate (keep first occurrence)
    const unique = Array.from(new Set(entries));

    return unique.map((content) => ({ content }));
  }

  async write(section: 'agent' | 'user', content: string): Promise<void> {
    await this.ensureMemoryDir();

    const filePath = section === 'agent' ? this.agentPath : this.userPath;
    const entry = `${this.delimiter}${content}`;

    await fs.appendFile(filePath, entry, 'utf-8');
  }

  async search(query: string): Promise<MemorySection[]> {
    const memory = await this.read();
    const allSections = [...memory.agent, ...memory.user];

    const lowerQuery = query.toLowerCase();
    return allSections.filter((section) =>
      section.content.toLowerCase().includes(lowerQuery)
    );
  }

  async clear(section: 'agent' | 'user'): Promise<void> {
    const filePath = section === 'agent' ? this.agentPath : this.userPath;
    await fs.writeFile(filePath, '', 'utf-8');
  }

  // Atomic write using temp file (Hermes pattern)
  async atomicWrite(
    section: 'agent' | 'user',
    entries: MemorySection[]
  ): Promise<void> {
    await this.ensureMemoryDir();

    const filePath = section === 'agent' ? this.agentPath : this.userPath;
    const content = entries.length > 0
      ? entries.map((e) => e.content).join(this.delimiter)
      : '';

    // Write to temp file in same directory
    const tmpPath = path.join(
      path.dirname(filePath),
      `.mem_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`
    );

    try {
      await fs.writeFile(tmpPath, content, 'utf-8');
      // Atomic rename (same filesystem)
      await fs.rename(tmpPath, filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}
