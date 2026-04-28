import z from "zod";
import { IMonotonicallyIncreasingIdGenerator } from "../application/lib/id-gen.js";
import { WorkDir } from "../config/config.js";
import path from "path";
import fsp from "fs/promises";
import fs from "fs";
import readline from "readline";
import { Run, RunEvent, StartEvent, CreateRunOptions, ListRunsResponse, MessageEvent } from "@flazz/shared";

function resolveRunType(agentId: string, runType?: z.infer<typeof Run>["runType"]): z.infer<typeof Run>["runType"] {
    if (runType) return runType;
    return agentId === "copilot" ? "chat" : "background";
}

export interface IRunsRepo {
    create(options: z.infer<typeof CreateRunOptions>): Promise<z.infer<typeof Run>>;
    fetch(id: string): Promise<z.infer<typeof Run>>;
    list(cursor?: string, filters?: { runType?: z.infer<typeof Run>["runType"] }): Promise<z.infer<typeof ListRunsResponse>>;
    appendEvents(runId: string, events: z.infer<typeof RunEvent>[]): Promise<void>;
    delete(id: string): Promise<void>;
}

/**
 * Strip attached-files XML from message content for title display (keeps @mentions)
 */
function cleanContentForTitle(content: string): string {
    // Remove the entire attached-files block
    let cleaned = content.replace(/<attached-files>\s*[\s\S]*?\s*<\/attached-files>/g, '');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

export class FSRunsRepo implements IRunsRepo {
    private idGenerator: IMonotonicallyIncreasingIdGenerator;
    private workDir: string;
    constructor({
        idGenerator,
        workDir = WorkDir,
    }: {
        idGenerator: IMonotonicallyIncreasingIdGenerator;
        workDir?: string;
    }) {
        this.idGenerator = idGenerator;
        this.workDir = workDir;
        // ensure runs directory exists
        fsp.mkdir(path.join(this.workDir, 'runs'), { recursive: true });
    }

    private extractTitle(events: z.infer<typeof RunEvent>[]): string | undefined {
        for (const event of events) {
            if (event.type === 'message') {
                const messageEvent = event as z.infer<typeof MessageEvent>;
                if (messageEvent.message.role === 'user') {
                    const content = messageEvent.message.content;
                    let textContent: string | undefined;
                    if (typeof content === 'string') {
                        textContent = content;
                    } else {
                        textContent = content
                            .filter(p => p.type === 'text')
                            .map(p => p.text)
                            .join('');
                    }
                    if (textContent && textContent.trim()) {
                        const cleaned = cleanContentForTitle(textContent);
                        if (!cleaned) continue;
                        return cleaned.length > 100 ? cleaned.substring(0, 100) : cleaned;
                    }
                }
            }
        }
        return undefined;
    }

    private async readRunStart(filePath: string): Promise<z.infer<typeof StartEvent> | null> {
        let handle: fsp.FileHandle | undefined;
        try {
            handle = await fsp.open(filePath, 'r');
            const buffer = Buffer.alloc(4096);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            const chunk = buffer.subarray(0, bytesRead).toString('utf8');
            const firstLine = chunk.split(/\r?\n/).find((line) => line.trim());
            if (!firstLine) return null;
            return StartEvent.parse(JSON.parse(firstLine));
        } catch {
            return null;
        } finally {
            await handle?.close().catch(() => undefined);
        }
    }

    /**
     * Read file line-by-line using streams, stopping early once we have
     * the start event and title (or determine there's no title).
     */
    private async readRunMetadata(filePath: string): Promise<{
        start: z.infer<typeof StartEvent>;
        title: string | undefined;
    } | null> {
        return new Promise((resolve) => {
            const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
            const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

            let start: z.infer<typeof StartEvent> | null = null;
            let title: string | undefined;
            let lineIndex = 0;

            rl.on('line', (line) => {
                const trimmed = line.trim();
                if (!trimmed) return;

                try {
                    if (lineIndex === 0) {
                        // First line should be the start event
                        start = StartEvent.parse(JSON.parse(trimmed));
                    } else {
                        // Subsequent lines - look for first user message or assistant response
                        const event = RunEvent.parse(JSON.parse(trimmed));
                        if (event.type === 'message') {
                            const msg = event.message;
                            if (msg.role === 'user') {
                                // Found first user message - use as title
                                const content = msg.content;
                                let textContent: string | undefined;
                                if (typeof content === 'string') {
                                    textContent = content;
                                } else {
                                    textContent = content
                                        .filter(p => p.type === 'text')
                                        .map(p => p.text)
                                        .join('');
                                }
                                if (textContent && textContent.trim()) {
                                    const cleaned = cleanContentForTitle(textContent);
                                    if (cleaned) {
                                        title = cleaned.length > 100 ? cleaned.substring(0, 100) : cleaned;
                                    }
                                }
                                // Stop reading
                                rl.close();
                                stream.destroy();
                                return;
                            } else if (msg.role === 'assistant') {
                                // Assistant responded before any user message - no title
                                rl.close();
                                stream.destroy();
                                return;
                            }
                        }
                    }
                    lineIndex++;
                } catch {
                    // Skip malformed lines
                }
            });

            rl.on('close', () => {
                if (start) {
                    resolve({ start, title });
                } else {
                    resolve(null);
                }
            });

            rl.on('error', () => {
                resolve(null);
            });

            stream.on('error', () => {
                rl.close();
                resolve(null);
            });
        });
    }

    async appendEvents(runId: string, events: z.infer<typeof RunEvent>[]): Promise<void> {
        await fsp.appendFile(
            path.join(this.workDir, 'runs', `${runId}.jsonl`),
            events.map(event => JSON.stringify(event)).join("\n") + "\n"
        );
    }

    async create(options: z.infer<typeof CreateRunOptions>): Promise<z.infer<typeof Run>> {
        const runId = await this.idGenerator.next();
        const ts = new Date().toISOString();
        const start: z.infer<typeof StartEvent> = {
            type: "start",
            runId,
            agentName: options.agentId,
            runType: options.runType,
            subflow: [],
            ts,
        };
        await this.appendEvents(runId, [start]);
        return {
            id: runId,
            createdAt: ts,
            agentId: options.agentId,
            runType: options.runType,
            log: [start],
        };
    }

    async fetch(id: string): Promise<z.infer<typeof Run>> {
        const contents = await fsp.readFile(path.join(this.workDir, 'runs', `${id}.jsonl`), 'utf8');
        const parsedEvents: z.infer<typeof RunEvent>[] = [];
        for (const line of contents.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                parsedEvents.push(RunEvent.parse(JSON.parse(trimmed)));
            } catch {
                // Ignore legacy or malformed events so old chats can still open.
            }
        }
        const startEvent = parsedEvents.find((event): event is z.infer<typeof StartEvent> => event.type === 'start');
        if (!startEvent) {
            throw new Error('Corrupt run data');
        }
        const events = parsedEvents.filter((event, index) => event.type !== 'start' || event === startEvent || index === 0);
        if (events[0] !== startEvent) {
            events.unshift(startEvent);
        }
        const title = this.extractTitle(events);
        return {
            id,
            title,
            createdAt: startEvent.ts!,
            agentId: startEvent.agentName,
            runType: resolveRunType(startEvent.agentName, startEvent.runType),
            log: events,
        };
    }

    async list(cursor?: string, filters: { runType?: z.infer<typeof Run>["runType"] } = {}): Promise<z.infer<typeof ListRunsResponse>> {
        const runsDir = path.join(this.workDir, 'runs');
        const PAGE_SIZE = 20;

        let files: string[] = [];
        try {
            const entries = await fsp.readdir(runsDir, { withFileTypes: true });
            files = entries
                .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
                .map(e => e.name);
        } catch (err: unknown) {
            const e = err as { code?: string };
            if (e.code === 'ENOENT') {
                return { runs: [] };
            }
            throw err;
        }

        files.sort((a, b) => b.localeCompare(a));

        const cursorFile = cursor;
        let startIndex = 0;
        if (cursorFile) {
            const exact = files.indexOf(cursorFile);
            if (exact >= 0) {
                startIndex = exact + 1;
            } else {
                const firstOlder = files.findIndex(name => name.localeCompare(cursorFile) < 0);
                startIndex = firstOlder === -1 ? files.length : firstOlder;
            }
        }

        const runs: z.infer<typeof ListRunsResponse>['runs'] = [];
        let nextIndex = startIndex;

        for (; nextIndex < files.length && runs.length < PAGE_SIZE; nextIndex++) {
            const name = files[nextIndex];
            const runId = name.slice(0, -'.jsonl'.length);
            const filePath = path.join(runsDir, name);
            if (filters.runType) {
                const start = await this.readRunStart(filePath);
                if (!start) {
                    continue;
                }
                const runType = resolveRunType(start.agentName, start.runType);
                if (runType !== filters.runType) {
                    continue;
                }
            }
            const metadata = await this.readRunMetadata(filePath);
            if (!metadata) {
                continue;
            }
            const runType = resolveRunType(metadata.start.agentName, metadata.start.runType);
            if (filters.runType && runType !== filters.runType) {
                continue;
            }
            runs.push({
                id: runId,
                title: metadata.title,
                createdAt: metadata.start.ts!,
                agentId: metadata.start.agentName,
                runType,
            });
        }

        const hasMore = nextIndex < files.length;
        const nextCursor = hasMore && nextIndex > startIndex
            ? files[nextIndex - 1]
            : undefined;

        return {
            runs,
            ...(nextCursor ? { nextCursor } : {}),
        };
    }

    async delete(id: string): Promise<void> {
        const filePath = path.join(this.workDir, 'runs', `${id}.jsonl`);
        await fsp.unlink(filePath);
    }
}
