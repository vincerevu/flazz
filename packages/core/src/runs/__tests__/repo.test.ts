import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createPrismaClient, toPrismaSqliteUrl } from "../../storage/prisma.js";
import { SqliteRunsRepo } from "../sqlite-repo.js";

class QueueIdGenerator {
    constructor(private readonly ids: string[]) {}

    async next() {
        const id = this.ids.shift();
        if (!id) throw new Error("No queued id");
        return id;
    }
}

async function createRun(
    repo: SqliteRunsRepo,
    id: string,
    agentName: string,
    runType: "chat" | "background" | undefined,
) {
    await repo.create({ agentId: agentName, runType: runType ?? "chat" });
    const ts = id.slice(0, "2026-01-01T00-00-00Z".length).replace(
        /T(\d{2})-(\d{2})-(\d{2})Z/,
        "T$1:$2:$3.000Z",
    );
    const message = {
        type: "message",
        runId: id,
        subflow: [] as string[],
        messageId: `${id}-message`,
        message: {
            role: "user" as const,
            content: `Title for ${id}`,
        },
        ts,
    } as const;
    await repo.appendEvents(id, [message]);
}

test("SqliteRunsRepo.list filters runType before filling pages", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "flazz-runs-"));
    const databaseUrl = toPrismaSqliteUrl(path.join(workDir, "flazz.db"));
    const prisma = createPrismaClient({ databaseUrl });
    try {
        const ids: string[] = [];

        for (let i = 0; i < 30; i++) {
            ids.push(`2026-02-${String(28 - Math.floor(i / 24)).padStart(2, "0")}T${String(23 - (i % 24)).padStart(2, "0")}-00-00Z-bg-${String(i).padStart(3, "0")}`);
        }

        for (let i = 0; i < 25; i++) {
            ids.push(`2026-01-${String(25 - Math.floor(i / 24)).padStart(2, "0")}T${String(23 - (i % 24)).padStart(2, "0")}-00-00Z-chat-${String(i).padStart(3, "0")}`);
        }

        const repo = new SqliteRunsRepo({
            idGenerator: new QueueIdGenerator([...ids]),
            prisma,
            storage: { databaseUrl },
        });

        for (let i = 0; i < 30; i++) {
            await createRun(repo, ids[i]!, "labeling_agent", "background");
        }

        for (let i = 0; i < 25; i++) {
            await createRun(repo, ids[30 + i]!, "copilot", i % 2 === 0 ? "chat" : undefined);
        }

        const firstPage = await repo.list(undefined, { runType: "chat" });
        assert.equal(firstPage.runs.length, 20);
        assert.ok(firstPage.runs.every((run) => run.runType === "chat"));
        assert.ok(firstPage.runs.every((run) => run.agentId === "copilot"));
        assert.ok(firstPage.nextCursor);

        const secondPage = await repo.list(firstPage.nextCursor, { runType: "chat" });
        assert.equal(secondPage.runs.length, 5);
        assert.ok(secondPage.runs.every((run) => run.runType === "chat"));
        assert.equal(secondPage.nextCursor, undefined);
    } finally {
        await prisma.$disconnect();
        await rm(workDir, { recursive: true, force: true });
    }
});
