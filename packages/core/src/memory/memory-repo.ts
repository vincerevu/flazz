import fs from 'node:fs/promises';
import path from 'node:path';
import { type Memory, type MemorySection, type IMemoryRepo } from './types.js';

export class MemoryRepo implements IMemoryRepo {
  private agentPath: string;
  private userPath: string;
  private delimiter = '§';

  constructor(workspacePath: string) {
    const memoryDir = path.join(workspacePath, 'memory');
    this.agentPath = path.join(memoryDir, 'agent.md');
    this.userPath = path.join(memoryDir, 'user.md');
  }

  async ensureMemoryDir(): Promise<void> {
    const memoryDir = path.dirname(this.agentPath);
    await fs.mkdir(memoryDir, { recursive: true });

    // Create empty files if not exist
    try {
      await fs.access(this.agentPath);
    } catch {
      await fs.writeFile(this.agentPath, '# Agent Memory\n\n', 'utf-8');
    }

    try {
      await fs.access(this.userPath);
    } catch {
      await fs.writeFile(this.userPath, '# User Profile\n\n', 'utf-8');
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
    const sections: MemorySection[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith(this.delimiter)) {
        const match = line.match(/^§\s*(\d{4}-\d{2}-\d{2}[^:]*):(.+)$/);
        if (match) {
          sections.push({
            timestamp: match[1].trim(),
            content: match[2].trim(),
          });
        }
      }
    }

    return sections;
  }

  async write(section: 'agent' | 'user', content: string): Promise<void> {
    await this.ensureMemoryDir();

    const filePath = section === 'agent' ? this.agentPath : this.userPath;
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `${this.delimiter} ${timestamp}: ${content}\n`;

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
    const header =
      section === 'agent' ? '# Agent Memory\n\n' : '# User Profile\n\n';
    await fs.writeFile(filePath, header, 'utf-8');
  }
}
