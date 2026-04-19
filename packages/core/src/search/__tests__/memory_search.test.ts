import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemorySearchProvider } from "../memory_search.js";

test("MemorySearchProvider boosts workflow and failure aggregate notes above run notes", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-memory-search-"));
  const workDir = tempDir;
  const memoryDir = path.join(workDir, "memory");
  const workflowsDir = path.join(memoryDir, "Workflows");
  const failuresDir = path.join(memoryDir, "Failure Patterns");
  const runsDir = path.join(memoryDir, "Runs", "2026-04-18");

  mkdirSync(workflowsDir, { recursive: true });
  mkdirSync(failuresDir, { recursive: true });
  mkdirSync(runsDir, { recursive: true });

  try {
    writeFileSync(
      path.join(workflowsDir, "github-triage.md"),
      [
        "# Workflow github-triage",
        "",
        "**Successes:** 3",
        "",
        "## Summary",
        "Use GitHub triage workflow for assigned issues and pull requests.",
      ].join("\n"),
      "utf8"
    );

    writeFileSync(
      path.join(failuresDir, "wrong-tool.md"),
      [
        "# Failure Pattern wrong-tool",
        "",
        "## Summary",
        "GitHub triage can fail when the wrong tool is selected for notifications.",
      ].join("\n"),
      "utf8"
    );

    writeFileSync(
      path.join(runsDir, "run-2026-04-18-001.md"),
      [
        "# Run run-2026-04-18-001",
        "",
        "Investigated GitHub triage for assigned issues.",
      ].join("\n"),
      "utf8"
    );

    const provider = new MemorySearchProvider({ memoryDir, workDir });
    const results = await provider.search("github triage", 5);

    assert.equal(results.length, 3);
    assert.equal(results[0]?.path, "memory/Workflows/github-triage.md");
    assert.equal(results[1]?.path, "memory/Failure Patterns/wrong-tool.md");
    assert.equal(results[2]?.path, "memory/Runs/2026-04-18/run-2026-04-18-001.md");

    assert.ok((results[0]?.score ?? 0) > (results[2]?.score ?? 0));
    assert.equal(results[0]?.scoreBreakdown?.graph, 60);
    assert.ok((results[0]?.scoreBreakdown?.keyword ?? 0) > 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("MemorySearchProvider uses run recency when only run notes match", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-memory-search-"));
  const workDir = tempDir;
  const memoryDir = path.join(workDir, "memory");
  const recentRunsDir = path.join(memoryDir, "Runs", "2026-04-18");
  const olderRunsDir = path.join(memoryDir, "Runs", "2026-03-01");

  mkdirSync(recentRunsDir, { recursive: true });
  mkdirSync(olderRunsDir, { recursive: true });

  try {
    writeFileSync(
      path.join(recentRunsDir, "run-recent.md"),
      "# Run recent\n\nInvestigated retrieval controller regressions.\n",
      "utf8"
    );
    writeFileSync(
      path.join(olderRunsDir, "run-older.md"),
      "# Run older\n\nInvestigated retrieval controller regressions.\n",
      "utf8"
    );

    const provider = new MemorySearchProvider({ memoryDir, workDir });
    const results = await provider.search("retrieval controller", 5);

    assert.equal(results[0]?.path, "memory/Runs/2026-04-18/run-recent.md");
    assert.equal(results[1]?.path, "memory/Runs/2026-03-01/run-older.md");
    assert.ok((results[0]?.score ?? 0) > (results[1]?.score ?? 0));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
