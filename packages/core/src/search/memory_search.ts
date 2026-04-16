import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import readline from 'readline';
import { SearchProvider, SearchResult } from './provider.js';
import { WorkDir } from '../config/config.js';

const MEMORY_DIR = path.join(WorkDir, 'memory');

export class MemorySearchProvider implements SearchProvider {
  async search(query: string, limit: number): Promise<SearchResult[]> {
    if (!fs.existsSync(MEMORY_DIR)) {
      return [];
    }

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    try {
      const allFiles = await this.listMarkdownFiles(MEMORY_DIR);
      for (const file of allFiles) {
        if (results.length >= limit) break;

        const basename = path.basename(file, '.md');
        const relPath = path.relative(WorkDir, file).replace(/\\/g, '/');

        let isMatch = false;
        let preview = '';

        // Check filename
        if (basename.toLowerCase().includes(lowerQuery)) {
          isMatch = true;
          preview = await this.readFirstLines(file, 2);
        } else {
          // Check content
          const matchLine = await this.getFirstMatchingLine(file, query);
          if (matchLine) {
            isMatch = true;
            preview = matchLine.trim().substring(0, 150);
          }
        }

        if (isMatch) {
          results.push({
            type: 'memory',
            title: basename,
            preview,
            path: relPath,
          });
        }
      }
    } catch {
      // ignore
    }

    return results;
  }

  private async listMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const nested = await this.listMarkdownFiles(fullPath);
          results.push(...nested);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath);
        }
      }
    } catch {
      // ignore
    }
    return results;
  }

  private getFirstMatchingLine(filePath: string, query: string): Promise<string> {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (value: string) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const lowerQuery = query.toLowerCase();
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      let buffer = '';
      stream.on('data', (chunk) => {
        if (resolved) return;
        buffer += chunk;
        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.toLowerCase().includes(lowerQuery)) {
            done(line);
            stream.destroy();
            return;
          }
        }
      });

      stream.on('end', () => {
        if (!resolved && buffer.toLowerCase().includes(lowerQuery)) {
          done(buffer);
        } else {
          done('');
        }
      });

      stream.on('error', () => done(''));
    });
  }

  private async readFirstLines(filePath: string, n: number): Promise<string> {
    return new Promise((resolve) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      const lines: string[] = [];

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          lines.push(trimmed);
        }
        if (lines.length >= n) {
          rl.close();
          stream.destroy();
        }
      });

      rl.on('close', () => {
        resolve(lines.join(' ').substring(0, 150));
      });

      stream.on('error', () => {
        resolve('');
      });
    });
  }
}
