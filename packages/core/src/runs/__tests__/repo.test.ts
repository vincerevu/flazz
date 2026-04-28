import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { FSRunsRepo } from "../repo.js";

class FixedIdGenerator {
    async next() {
        return "2026-01-01T00-00-00Z-0000000-000";
    }
}

async function writeRun(
    runsDir: string,
    id: string,
    agentName: string,
    runType: "chat" | "background" | undefined,
) {
    const start = {
        type: "start",
        runId: id,
        agentName,
        ...(runType ? { runType } : {}),
        subflow: [],
        ts: id.slice(0, "2026-01-01T00-00-00Z".length).replace(
            /T(\d{2})-(\d{2})-(\d{2})Z/,
            "T$1:$2:$3.000Z",
        ),
    };
    const message = {
        type: "message",
        runId: id,
        subflow: [],
        messageId: `${id}-message`,
        message: {
            role: "user",
            content: `Title for ${id}`,
        },
        ts: start.ts,
    };
    await writeFile(path.join(runsDir, `${id}.jsonl`), `${JSON.stringify(start)}\n${JSON.stringify(message)}\n`);
}

test("FSRunsRepo.list filters runType before filling pages", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "flazz-runs-"));
    try {
        const runsDir = path.join(workDir, "runs");
        await mkdir(runsDir, { recursive: true });

        for (let i = 0; i < 30; i++) {
            const id = `2026-02-${String(28 - Math.floor(i / 24)).padStart(2, "0")}T${String(23 - (i % 24)).padStart(2, "0")}-00-00Z-bg-${String(i).padStart(3, "0")}`;
            await writeRun(runsDir, id, "labeling_agent", "background");
        }

        for (let i = 0; i < 25; i++) {
            const id = `2026-01-${String(25 - Math.floor(i / 24)).padStart(2, "0")}T${String(23 - (i % 24)).padStart(2, "0")}-00-00Z-chat-${String(i).padStart(3, "0")}`;
            await writeRun(runsDir, id, "copilot", i % 2 === 0 ? "chat" : undefined);
        }

        const repo = new FSRunsRepo({ idGenerator: new FixedIdGenerator(), workDir });

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
        await rm(workDir, { recursive: true, force: true });
    }
});
