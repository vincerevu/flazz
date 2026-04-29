import z from "zod";
import { IMonotonicallyIncreasingIdGenerator } from "../application/lib/id-gen.js";
import {
  createPrismaClient,
  type FlazzPrismaClient,
  type PrismaStorageOptions,
} from "../storage/prisma.js";
import { applySqliteMigrations } from "../storage/sqlite-migrations.js";
import { CreateRunOptions, ListRunsResponse, Message, Run, RunConversation, RunEvent, StartEvent } from "@flazz/shared";
import type { IRunsRepo } from "./repo.js";
import {
  extractTitle,
  parseEventDate,
  projectRunEvent,
  resolveRunType,
  runEventId,
  type RunEventType,
  type RunType,
} from "./sqlite-projector.js";

export class SqliteRunsRepo implements IRunsRepo {
  private readonly idGenerator: IMonotonicallyIncreasingIdGenerator;
  private readonly prisma: FlazzPrismaClient;
  private readonly storage?: PrismaStorageOptions;
  private ready: Promise<void> | null = null;

  constructor({
    idGenerator,
    prisma,
    storage,
  }: {
    idGenerator: IMonotonicallyIncreasingIdGenerator;
    prisma?: FlazzPrismaClient;
    storage?: PrismaStorageOptions;
  }) {
    this.idGenerator = idGenerator;
    this.storage = storage;
    this.prisma = prisma ?? createPrismaClient(storage);
  }

  private ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    return this.ready;
  }

  private async initialize(): Promise<void> {
    await applySqliteMigrations({ prisma: this.prisma, storage: this.storage });
  }

  private parseStoredRunEvent(dataJson: string, fallbackTs: Date): RunEventType | null {
    try {
      const event = RunEvent.parse(JSON.parse(dataJson));
      return event.ts ? event : { ...event, ts: fallbackTs.toISOString() };
    } catch {
      // Keep parity with the filesystem repo: ignore malformed stored events.
      return null;
    }
  }

  async create(options: z.infer<typeof CreateRunOptions>): Promise<z.infer<typeof Run>> {
    await this.ensureReady();
    const runId = await this.idGenerator.next();
    const ts = new Date().toISOString();
    const createdAt = new Date(ts);
    const runType = resolveRunType(options.agentId, options.runType);
    const start: z.infer<typeof StartEvent> = {
      type: "start",
      runId,
      agentName: options.agentId,
      runType,
      subflow: [],
      ts,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.run.create({
        data: {
          id: runId,
          agentId: options.agentId,
          runType,
          status: "idle",
          createdAt,
          updatedAt: createdAt,
          lastEventSeq: 1,
        },
      });
      await tx.runEvent.create({
        data: {
          id: runEventId(runId, 1),
          runId,
          seq: 1,
          type: start.type,
          subflowJson: JSON.stringify(start.subflow),
          ts: createdAt,
          dataJson: JSON.stringify(start),
          createdAt,
        },
      });
    });

    return {
      id: runId,
      createdAt: ts,
      agentId: options.agentId,
      runType,
      log: [start],
    };
  }

  async appendEvents(runId: string, events: RunEventType[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureReady();

    await this.prisma.$transaction(async (tx) => {
      const run = await tx.run.findUnique({
        where: { id: runId },
        select: { lastEventSeq: true },
      });
      if (!run) {
        throw new Error(`Run not found: ${runId}`);
      }

      let seq = run.lastEventSeq;
      for (const event of events) {
        seq += 1;
        const eventDate = parseEventDate(event.ts);
        await tx.runEvent.create({
          data: {
            id: runEventId(runId, seq),
            runId,
            seq,
            type: event.type,
            subflowJson: JSON.stringify(event.subflow),
            ts: eventDate,
            dataJson: JSON.stringify(event),
            createdAt: new Date(),
          },
        });
        await projectRunEvent(tx, event);
      }

      await tx.run.update({
        where: { id: runId },
        data: {
          lastEventSeq: seq,
          updatedAt: parseEventDate(events.at(-1)?.ts),
        },
      });
    });
  }

  async fetch(id: string): Promise<z.infer<typeof Run>> {
    await this.ensureReady();
    const [run, events] = await Promise.all([
      this.prisma.run.findUnique({ where: { id } }),
      this.prisma.runEvent.findMany({
        where: { runId: id },
        orderBy: { seq: "asc" },
      }),
    ]);
    if (!run || events.length === 0) {
      throw new Error("Corrupt run data");
    }

    const parsedEvents: RunEventType[] = [];
    for (const event of events) {
      const parsed = this.parseStoredRunEvent(event.dataJson, event.ts);
      if (parsed) parsedEvents.push(parsed);
    }
    const startEvent = parsedEvents.find((event): event is z.infer<typeof StartEvent> => event.type === "start");
    if (!startEvent) {
      throw new Error("Corrupt run data");
    }

    return {
      id,
      title: run.title ?? extractTitle(parsedEvents),
      createdAt: run.createdAt.toISOString(),
      agentId: run.agentId,
      runType: resolveRunType(run.agentId, run.runType as RunType["runType"]),
      log: parsedEvents,
    };
  }

  async fetchConversation(id: string): Promise<z.infer<typeof RunConversation>> {
    await this.ensureReady();
    const [run, messages, auxiliaryEvents] = await Promise.all([
      this.prisma.run.findUnique({ where: { id } }),
      this.prisma.runMessage.findMany({
        where: { runId: id },
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" },
        ],
      }),
      this.prisma.runEvent.findMany({
        where: {
          runId: id,
          type: { not: "message" },
        },
        orderBy: { seq: "asc" },
      }),
    ]);
    if (!run) {
      throw new Error("Corrupt run data");
    }

    const parsedMessages: z.infer<typeof RunConversation>["messages"] = [];
    for (const message of messages) {
      if (!message.dataJson) continue;
      try {
        parsedMessages.push({
          id: message.id,
          runId: message.runId,
          message: Message.parse(JSON.parse(message.dataJson)),
          createdAt: message.createdAt.toISOString(),
        });
      } catch {
        // Keep the fast reader resilient to stale or malformed projected rows.
      }
    }

    const parsedAuxiliaryEvents: RunEventType[] = [];
    for (const event of auxiliaryEvents) {
      const parsed = this.parseStoredRunEvent(event.dataJson, event.ts);
      if (parsed) parsedAuxiliaryEvents.push(parsed);
    }
    const startEvent = parsedAuxiliaryEvents.find((event): event is z.infer<typeof StartEvent> => event.type === "start");
    if (!startEvent) {
      throw new Error("Corrupt run data");
    }

    return {
      id,
      title: run.title ?? extractTitle(parsedAuxiliaryEvents),
      createdAt: run.createdAt.toISOString(),
      agentId: run.agentId,
      runType: resolveRunType(run.agentId, run.runType as RunType["runType"]),
      messages: parsedMessages,
      auxiliaryEvents: parsedAuxiliaryEvents,
    };
  }

  async list(cursor?: string, filters: { runType?: RunType["runType"] } = {}): Promise<z.infer<typeof ListRunsResponse>> {
    await this.ensureReady();
    const PAGE_SIZE = 20;
    const runs = await this.prisma.run.findMany({
      where: {
        deletedAt: null,
        ...(filters.runType ? { runType: filters.runType } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [
        { id: "desc" },
      ],
      take: PAGE_SIZE + 1,
    });

    const page = runs.slice(0, PAGE_SIZE);
    const nextCursor = runs.length > PAGE_SIZE ? page.at(-1)?.id : undefined;

    return {
      runs: page.map((run) => ({
        id: run.id,
        title: run.title ?? undefined,
        createdAt: run.createdAt.toISOString(),
        agentId: run.agentId,
        runType: resolveRunType(run.agentId, run.runType as RunType["runType"]),
      })),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async delete(id: string): Promise<void> {
    await this.ensureReady();
    await this.prisma.run.delete({ where: { id } });
  }
}
