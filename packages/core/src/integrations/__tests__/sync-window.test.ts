import test from "node:test";
import assert from "node:assert/strict";
import { buildSyncWindowPlan } from "../sync-window.js";
import type { ResolvedTool } from "../action-resolver.js";

function tool(slug: string, properties: string[]): ResolvedTool {
  return {
    slug,
    name: slug,
    description: slug,
    inputParameters: {
      type: "object",
      properties: Object.fromEntries(properties.map((property) => [property, { type: "string" }])),
      required: [],
    },
  };
}

test("buildSyncWindowPlan prefers provider date fields when available", () => {
  const plan = buildSyncWindowPlan({
    app: "googlecalendar",
    resourceType: "event",
    listTool: tool("calendar-list", ["timeMin", "timeMax", "max_results"]),
    windowDays: 7,
    now: new Date("2026-04-18T16:00:00.000Z"),
  });

  assert.equal(plan?.capability, "list");
  assert.equal(plan?.strategy, "provider_fields");
  assert.equal(typeof plan?.additionalInput?.timeMin, "string");
  assert.equal(typeof plan?.additionalInput?.timeMax, "string");
});

test("buildSyncWindowPlan falls back to list query when the list tool accepts search text", () => {
  const plan = buildSyncWindowPlan({
    app: "gmail",
    resourceType: "message",
    listTool: tool("gmail-list", ["query", "max_results"]),
    windowDays: 7,
    now: new Date("2026-04-18T16:00:00.000Z"),
  });

  assert.equal(plan?.capability, "list");
  assert.equal(plan?.strategy, "query_on_list");
  assert.match(String(plan?.additionalInput?.query ?? ""), /after:/);
});

test("buildSyncWindowPlan falls back to search query when list lacks temporal fields", () => {
  const plan = buildSyncWindowPlan({
    app: "github",
    resourceType: "ticket",
    listTool: tool("github-assigned", ["per_page"]),
    searchTool: tool("github-search", ["query", "per_page"]),
    windowDays: 7,
    now: new Date("2026-04-18T16:00:00.000Z"),
  });

  assert.equal(plan?.capability, "search");
  assert.equal(plan?.strategy, "query_on_search");
  assert.match(String(plan?.additionalInput?.query ?? ""), /updated:>=2026-04-11/);
});
