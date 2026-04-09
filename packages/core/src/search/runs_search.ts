import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import readline from 'readline';
import { SearchProvider, SearchResult } from './provider.js';
import { WorkDir } from '../config/config.js';

const RUNS_DIR = path.join(WorkDir, 'runs');

interface RunMetadata {
  title: string | undefined;
  agentName: string | undefined;
}

export class RunsSearchProvider implements SearchProvider {
  async search(query: string, limit: number): Promise<SearchResult[]> {
    if (!fs.existsSync(RUNS_DIR)) {
      return [];
    }

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    try {
      const entries = await fsp.readdir(RUNS_DIR, { withFileTypes: true });
      const jsonlFiles = entries
        .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
        .map(e => e.name)
        .sort()
        .reverse(); // newest first

      for (const name of jsonlFiles) {
        if (results.length >= limit) break;
        const runId = path.basename(name, '.jsonl');
        const filePath = path.join(RUNS_DIR, name);

        const meta = await this.readRunMetadata(filePath);
        if (meta.agentName !== 'copilot') {
          continue;
        }

        let isMatch = false;
        let preview = '';

        // Match title
        if (meta.title && meta.title.toLowerCase().includes(lowerQuery)) {
          isMatch = true;
          preview = meta.title;
        } else {
          // Content search inside jsonl
          const matchLine = await this.getFirstMatchingLine(filePath, query);
          if (matchLine) {
            isMatch = true;
            try {
              const parsed = JSON.parse(matchLine);
              if (parsed.message?.content && typeof parsed.message.content === 'string') {
                preview = parsed.message.content.replace(/<attached-files>[\s\S]*?<\/attached-files>/g, '').trim().substring(0, 150);
              }
            } catch {
              preview = matchLine.substring(0, 150);
            }
          }
        }

        if (isMatch) {
          results.push({
            type: 'chat',
            title: meta.title || runId,
            preview,
            path: runId,
          });
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

  private readRunMetadata(filePath: string): Promise<RunMetadata> {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (value: RunMetadata) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let lineIndex = 0;
      let agentName: string | undefined;

      rl.on('line', (line) => {
        if (resolved) return;
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          if (lineIndex === 0) {
            // Start event — extract agentName
            const start = JSON.parse(trimmed);
            agentName = start.agentName;
            lineIndex++;
            return;
          }

          const event = JSON.parse(trimmed);
          if (event.type === 'message') {
            const msg = event.message;
            if (msg?.role === 'user') {
              const content = msg.content;
              if (typeof content === 'string' && content.trim()) {
                let cleaned = content.replace(/<attached-files>[\s\S]*?<\/attached-files>/g, '');
                cleaned = cleaned.replace(/\s+/g, ' ').trim();
                if (cleaned) {
                  done({ title: cleaned.length > 100 ? cleaned.substring(0, 100) : cleaned, agentName });
                  rl.close();
                  stream.destroy();
                  return;
                }
              }
              done({ title: undefined, agentName });
              rl.close();
              stream.destroy();
              return;
            } else if (msg?.role === 'assistant') {
              done({ title: undefined, agentName });
              rl.close();
              stream.destroy();
              return;
            }
          }
          lineIndex++;
        } catch {
          lineIndex++;
        }
      });

      rl.on('close', () => done({ title: undefined, agentName }));
      rl.on('error', () => done({ title: undefined, agentName: undefined }));
      stream.on('error', () => {
        rl.close();
        done({ title: undefined, agentName: undefined });
      });
    });
  }
}
