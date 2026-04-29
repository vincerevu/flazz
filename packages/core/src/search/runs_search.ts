import { SearchProvider, SearchResult } from './provider.js';
import {
  createPrismaClient,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from '../storage/prisma.js';
import { applySqliteMigrations } from '../storage/sqlite-migrations.js';

export class RunsSearchProvider implements SearchProvider {
  private readonly prisma?: FlazzPrismaClient;
  private readonly storage?: PrismaStorageOptions;

  constructor(options: {
    prisma?: FlazzPrismaClient;
    storage?: PrismaStorageOptions;
  } = {}) {
    this.prisma = options.prisma;
    this.storage = options.storage;
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const prisma = this.prisma ?? createPrismaClient(this.storage);
    const shouldDisconnect = !this.prisma;

    try {
      await applySqliteMigrations({ prisma, storage: this.storage });
      const runs = await prisma.run.findMany({
        where: {
          deletedAt: null,
          runType: 'chat',
          agentId: 'copilot',
          OR: [
            { title: { contains: query } },
            { messages: { some: { contentPreview: { contains: query } } } },
            { parts: { some: { text: { contains: query } } } },
          ],
        },
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit,
        include: {
          parts: {
            where: { text: { contains: query } },
            orderBy: [
              { createdAt: 'asc' },
              { position: 'asc' },
            ],
            take: 1,
          },
          messages: {
            where: { contentPreview: { contains: query } },
            orderBy: [
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            take: 1,
          },
        },
      });

      return runs.map((run) => {
        const preview = run.title?.toLowerCase().includes(query.toLowerCase())
          ? run.title
          : run.parts[0]?.text ?? run.messages[0]?.contentPreview ?? '';
        return {
          type: 'chat',
          title: run.title || run.id,
          preview: preview.substring(0, 150),
          path: run.id,
        };
      });
    } catch {
      return [];
    } finally {
      if (shouldDisconnect) {
        await prisma.$disconnect();
      }
    }
  }
}
