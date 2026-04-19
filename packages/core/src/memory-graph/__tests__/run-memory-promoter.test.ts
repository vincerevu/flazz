import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RunMemoryGraphPromoter } from "../run-memory-promoter.js";

test("RunMemoryGraphPromoter writes deterministic run notes with provenance", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-run-graph-"));

  try {
    const promoter = new RunMemoryGraphPromoter(tempDir);
    const result = promoter.promote({
      id: "abc123",
      runId: "run-2026-04-18-001",
      agentId: "copilot",
      taskType: "workspace-readFile",
      summary: "Investigated a retrieval regression and updated the retrieval policy.",
      firstUserMessage: "Please debug the retrieval regression and keep the fix reusable.",
      entityRefs: ["OpenAI", "GitHub"],
      topicRefs: ["retrieval", "ranking"],
      projectRefs: ["Flazz"],
      skillRefs: ["retrieval-debug"],
      toolRefs: ["workspace-readFile", "workspace-writeFile"],
      artifactRefs: ["memory/Runs/2026-04-18/run-2026-04-18-001.md"],
      outcome: "success",
      corrections: ["Prefer update over create when the skill already exists."],
      createdAt: "2026-04-18T08:30:00.000Z",
    });

    assert.equal(result.created, true);
    assert.match(result.path, /memory[\\/]Runs[\\/]2026-04-18[\\/]run-2026-04-18-001\.md$/);

    const content = readFileSync(result.path, "utf8");
    assert.match(content, /# Run run-2026-04-18-001/);
    assert.match(content, /\*\*Outcome:\*\* success/);
    assert.match(content, /\*\*Skills:\*\* retrieval-debug/);
    assert.match(content, /\*\*Tools:\*\* workspace-readFile, workspace-writeFile/);
    assert.match(content, /\*\*Provenance:\*\* run-memory:abc123/);
    assert.match(content, /## Corrections/);
    assert.match(content, /Prefer update over create when the skill already exists\./);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("RunMemoryGraphPromoter rebuilds workflow and failure aggregate notes from run records", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "flazz-run-graph-"));

  try {
    const promoter = new RunMemoryGraphPromoter(tempDir);
    const result = promoter.promote(
      {
        id: "run-fail-1",
        runId: "run-2026-04-18-002",
        agentId: "copilot",
        taskType: "integration-searchItemsCompact",
        summary: "Tried triaging GitHub notifications but picked the wrong tool.",
        firstUserMessage: "Check my GitHub updates and suggest the next action.",
        entityRefs: ["GitHub"],
        topicRefs: ["notifications"],
        projectRefs: ["Flazz"],
        skillRefs: ["github-triage"],
        toolRefs: ["integration-searchItemsCompact"],
        artifactRefs: [],
        outcome: "failure",
        failureCategory: "wrong-tool",
        corrections: ["Use assigned issue and PR retrieval instead of inbox semantics."],
        createdAt: "2026-04-18T09:00:00.000Z",
      },
      [
        {
          id: "run-ok-1",
          runId: "run-2026-04-18-001",
          agentId: "copilot",
          taskType: "integration-searchItemsCompact",
          summary: "Successfully triaged assigned GitHub work items.",
          firstUserMessage: "Check my GitHub updates and summarize assigned work.",
          entityRefs: ["GitHub"],
          topicRefs: ["triage"],
          projectRefs: ["Flazz"],
          skillRefs: ["github-triage"],
          toolRefs: ["integration-searchItemsCompact", "integration-getItemSummary"],
          artifactRefs: [],
          outcome: "success",
          corrections: [],
          createdAt: "2026-04-18T08:45:00.000Z",
        },
        {
          id: "run-fail-1",
          runId: "run-2026-04-18-002",
          agentId: "copilot",
          taskType: "integration-searchItemsCompact",
          summary: "Tried triaging GitHub notifications but picked the wrong tool.",
          firstUserMessage: "Check my GitHub updates and suggest the next action.",
          entityRefs: ["GitHub"],
          topicRefs: ["notifications"],
          projectRefs: ["Flazz"],
          skillRefs: ["github-triage"],
          toolRefs: ["integration-searchItemsCompact"],
          artifactRefs: [],
          outcome: "failure",
          failureCategory: "wrong-tool",
          corrections: ["Use assigned issue and PR retrieval instead of inbox semantics."],
          createdAt: "2026-04-18T09:00:00.000Z",
        },
      ]
    );

    assert.ok(result.workflowPaths.some((entry) => /Workflows[\\/]github-triage\.md$/.test(entry)));
    assert.ok(result.failurePath && /Failure Patterns[\\/]wrong-tool\.md$/.test(result.failurePath));

    const workflowPath = result.workflowPaths.find((entry) => /github-triage\.md$/.test(entry));
    assert.ok(workflowPath);
    const workflowContent = readFileSync(workflowPath!, "utf8");
    assert.match(workflowContent, /\*\*Successes:\*\* 1/);
    assert.match(workflowContent, /\*\*Failures:\*\* 1/);
    assert.match(workflowContent, /run-2026-04-18-002 \(failure\)/);

    const failureContent = readFileSync(result.failurePath!, "utf8");
    assert.match(failureContent, /\*\*Occurrences:\*\* 1/);
    assert.match(failureContent, /Use assigned issue and PR retrieval instead of inbox semantics\./);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
