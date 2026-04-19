import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import readline from 'readline';
import { SearchProvider, SearchResult } from './provider.js';
import { WorkDir } from '../config/config.js';

const DEFAULT_MEMORY_DIR = path.join(WorkDir, 'memory');
const WORKFLOWS_PREFIX = 'memory/workflows/';
const FAILURES_PREFIX = 'memory/failure patterns/';
const RUNS_PREFIX = 'memory/runs/';

type MemoryNoteKind = 'workflow' | 'failure-pattern' | 'run' | 'general';

interface MemorySearchOptions {
  memoryDir?: string;
  workDir?: string;
}

interface MatchMetadata {
  titleMatch: boolean;
  matchedPreview: string;
  keywordScore: number;
}

interface RankedMemoryResult extends SearchResult {
  score: number;
  scoreBreakdown: {
    keyword: number;
    graph: number;
    recency: number;
    total: number;
  };
}

export class MemorySearchProvider implements SearchProvider {
  private readonly memoryDir: string;
  private readonly workDir: string;

  constructor(options: MemorySearchOptions = {}) {
    this.memoryDir = options.memoryDir ?? DEFAULT_MEMORY_DIR;
    this.workDir = options.workDir ?? WorkDir;
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    if (!fs.existsSync(this.memoryDir)) {
      return [];
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const queryTokens = tokenize(trimmedQuery);

    try {
      const allFiles = await this.listMarkdownFiles(this.memoryDir);
      const matches: RankedMemoryResult[] = [];

      for (const file of allFiles) {
        const match = await this.buildMatch(file, trimmedQuery, queryTokens);
        if (match) {
          matches.push(match);
        }
      }

      return matches
        .sort((left, right) => {
          if ((right.score ?? 0) !== (left.score ?? 0)) {
            return (right.score ?? 0) - (left.score ?? 0);
          }

          return left.path.localeCompare(right.path);
        })
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  private async buildMatch(filePath: string, query: string, queryTokens: string[]): Promise<RankedMemoryResult | null> {
    const basename = path.basename(filePath, '.md');
    const relPath = path.relative(this.workDir, filePath).replace(/\\/g, '/');
    const lowerPath = relPath.toLowerCase();
    const noteKind = classifyNote(lowerPath);
    const match = await this.matchFile(filePath, basename, query, queryTokens);

    if (!match) {
      return null;
    }

    const graphScore = graphBoostForKind(noteKind);
    const recencyScore = noteKind === 'run' ? recencyBoostFromRunPath(lowerPath) : 0;
    const total = match.keywordScore + graphScore + recencyScore;

    return {
      type: 'memory',
      title: basename,
      preview: match.matchedPreview,
      path: relPath,
      score: total,
      scoreBreakdown: {
        keyword: match.keywordScore,
        graph: graphScore,
        recency: recencyScore,
        total,
      },
    };
  }

  private async matchFile(
    filePath: string,
    basename: string,
    query: string,
    queryTokens: string[]
  ): Promise<MatchMetadata | null> {
    const lowerBasename = basename.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const normalizedBasename = normalizeSearchText(basename);
    const normalizedQuery = normalizeSearchText(query);

    let titleMatch = false;
    let preview = '';
    let keywordScore = 0;

    if (normalizedBasename === normalizedQuery) {
      titleMatch = true;
      keywordScore += 90;
    } else if (normalizedBasename.includes(normalizedQuery) || lowerBasename.includes(lowerQuery)) {
      titleMatch = true;
      keywordScore += 62;
    }

    const titleTokenHits = countTokenHits(lowerBasename, queryTokens);
    if (titleTokenHits > 0) {
      titleMatch = true;
      keywordScore += titleTokenHits * 12;
    }

    if (titleMatch) {
      preview = await this.readFirstLines(filePath, 3);
      return {
        titleMatch,
        matchedPreview: preview,
        keywordScore,
      };
    }

    const contentMatch = await this.getBestMatchingLine(filePath, queryTokens, query);
    if (!contentMatch) {
      return null;
    }

    keywordScore += contentMatch.score;
    preview = contentMatch.line;

    return {
      titleMatch: false,
      matchedPreview: preview,
      keywordScore,
    };
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

  private getBestMatchingLine(
    filePath: string,
    queryTokens: string[],
    rawQuery: string
  ): Promise<{ line: string; score: number } | null> {
    return new Promise((resolve) => {
      let resolved = false;
      let bestLine = '';
      let bestScore = 0;

      const done = (value: { line: string; score: number } | null) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const lowerQuery = rawQuery.toLowerCase();
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let buffer = '';

      stream.on('data', (chunk) => {
        if (resolved) return;
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const score = scoreContentLine(line, queryTokens, lowerQuery);
          if (score > bestScore) {
            bestScore = score;
            bestLine = line.trim().substring(0, 180);
          }
        }
      });

      stream.on('end', () => {
        if (!resolved) {
          const tailScore = scoreContentLine(buffer, queryTokens, lowerQuery);
          if (tailScore > bestScore) {
            bestScore = tailScore;
            bestLine = buffer.trim().substring(0, 180);
          }
          done(bestScore > 0 ? { line: bestLine, score: bestScore } : null);
        }
      });

      stream.on('error', () => done(null));
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
        resolve(lines.join(' ').substring(0, 180));
      });

      stream.on('error', () => {
        resolve('');
      });
    });
  }
}

function classifyNote(relPath: string): MemoryNoteKind {
  if (relPath.startsWith(WORKFLOWS_PREFIX)) return 'workflow';
  if (relPath.startsWith(FAILURES_PREFIX)) return 'failure-pattern';
  if (relPath.startsWith(RUNS_PREFIX)) return 'run';
  return 'general';
}

function graphBoostForKind(kind: MemoryNoteKind): number {
  switch (kind) {
    case 'workflow':
      return 60;
    case 'failure-pattern':
      return 48;
    case 'run':
      return 18;
    default:
      return 8;
  }
}

function recencyBoostFromRunPath(relPath: string): number {
  const match = relPath.match(/memory\/runs\/(\d{4})-(\d{2})-(\d{2})\//i);
  if (!match) {
    return 0;
  }

  const isoDate = `${match[1]}-${match[2]}-${match[3]}`;
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageDays = Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)));
  if (ageDays <= 3) return 16;
  if (ageDays <= 14) return 10;
  if (ageDays <= 30) return 6;
  return 2;
}

function tokenize(value: string): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function countTokenHits(haystack: string, tokens: string[]): number {
  const uniqueTokens = new Set(tokens);
  let hits = 0;
  for (const token of uniqueTokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }
  return hits;
}

function scoreContentLine(line: string, queryTokens: string[], lowerQuery: string): number {
  const normalized = line.trim().toLowerCase();
  if (!normalized) {
    return 0;
  }

  let score = 0;
  if (normalized.includes(lowerQuery)) {
    score += 30;
  }

  const tokenHits = countTokenHits(normalized, queryTokens);
  if (tokenHits === 0) {
    return score;
  }

  score += tokenHits * 8;
  if (normalized.startsWith('- ') || normalized.startsWith('* ')) {
    score += 4;
  }

  return score;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
