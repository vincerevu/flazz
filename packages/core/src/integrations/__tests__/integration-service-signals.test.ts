import test from "node:test";
import assert from "node:assert/strict";
import { ingestNormalizedGraphSignals } from "../service.js";

test("ingestNormalizedGraphSignals forwards every normalized item to the signal service", async () => {
  const calls: Array<{ app: string; resourceType: string; item: unknown }> = [];
  const signalService = {
    async ingestNormalizedItem(app: string, resourceType: string, item: unknown) {
      calls.push({ app, resourceType, item });
      return { signals: [], count: 0, written: [] };
    },
  };

  const items = [
    { id: "123", title: "Fix auth", assignee: "alice" },
    { id: "124", title: "Review billing PR", assignee: "bob" },
  ];

  await ingestNormalizedGraphSignals("github", "ticket", items, signalService);

  assert.deepEqual(calls, [
    { app: "github", resourceType: "ticket", item: items[0] },
    { app: "github", resourceType: "ticket", item: items[1] },
  ]);
});

test("ingestNormalizedGraphSignals keeps going when one item fails ingestion", async () => {
  const seen: string[] = [];
  const signalService = {
    async ingestNormalizedItem(_app: string, _resourceType: string, item: unknown) {
      const record = item as { id: string };
      seen.push(record.id);
      if (record.id === "bad") {
        throw new Error("boom");
      }
      return { signals: [], count: 0, written: [] };
    },
  };

  await ingestNormalizedGraphSignals(
    "googlecalendar",
    "event",
    [{ id: "ok-1" }, { id: "bad" }, { id: "ok-2" }],
    signalService,
  );

  assert.deepEqual(seen, ["ok-1", "bad", "ok-2"]);
});
