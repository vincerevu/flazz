import fs from 'fs/promises';
import path from 'path';
import { WorkDir } from '../config/config.js';
import { type IMemoryRepo } from './types.js';
import { buildKnowledgeIndex } from '../knowledge/knowledge_index.js';

export interface IMemoryArchiver {
  archive(section: 'agent' | 'user', targetPath: string): Promise<void>;
}

export class MemoryArchiver implements IMemoryArchiver {
  private memoryDir = path.join(WorkDir, 'memory');

  constructor(private memoryRepo: IMemoryRepo) {}

  /**
   * Archive memory section to knowledge base
   * 1. Read memory section
   * 2. Create/append to knowledge file
   * 3. Clear memory section
   * 4. Rebuild knowledge index (graph update happens via build_graph.ts)
   */
  async archive(section: 'agent' | 'user', targetPath: string): Promise<void> {
    // Read memory
    const memory = await this.memoryRepo.read();
    const entries = section === 'agent' ? memory.agent : memory.user;

    if (entries.length === 0) {
      throw new Error(`No entries in ${section} memory to archive.`);
    }

    // Validate target path
    if (!targetPath.endsWith('.md')) {
      throw new Error('Target path must end with .md');
    }

    // Ensure path is within memory directory
    const fullPath = path.join(this.memoryDir, targetPath);
    if (!fullPath.startsWith(this.memoryDir)) {
      throw new Error('Target path must be within memory directory');
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Format content for archiving
    const timestamp = new Date().toISOString().split('T')[0];
    const content = entries.map((e) => e.content).join('\n\n');
    const archiveContent = `\n\n## Archived from ${section} memory (${timestamp})\n\n${content}\n`;

    // Append to knowledge file (or create if doesn't exist)
    try {
      await fs.access(fullPath);
      // File exists - append
      await fs.appendFile(fullPath, archiveContent, 'utf-8');
    } catch {
      // File doesn't exist - create with title
      const title = path.basename(targetPath, '.md');
      const newContent = `# ${title}\n${archiveContent}`;
      await fs.writeFile(fullPath, newContent, 'utf-8');
    }

    // Clear memory section
    await this.memoryRepo.atomicWrite(section, []);

    // Rebuild memory index (this updates the graph)
    await buildKnowledgeIndex();
  }
}
