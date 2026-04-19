import test from "node:test";
import assert from "node:assert/strict";
import { runGraphSyncIteration, type GraphSyncRunnerDeps } from "../graph-sync-runner.js";

test("runGraphSyncIteration syncs all due connected apps across waves", async () => {
  const calls: Array<{ app: string; limit: number; windowDays?: number }> = [];
  const detailCalls: string[] = [];
  const fullCalls: string[] = [];
  const written: string[] = [];
  const distills: string[] = [];
  const appSuccesses: string[] = [];

  const deps: GraphSyncRunnerDeps = {
      getConnectedToolkits: () => [
        "github",
        "jira",
        "linear",
        "googlecalendar",
        "linkedin",
        "googledrive",
        "googlesheets",
        "notion",
        "googledocs",
        "confluence",
        "gmail",
        "outlook",
      ],
      getStatus: (source) => ({
        source,
        shouldSync: source !== "linear",
        distillBudgetRemaining: 2,
      }) as ReturnType<GraphSyncRunnerDeps["getStatus"]>,
      getAppStatus: () => ({ inBackoff: false }) as ReturnType<GraphSyncRunnerDeps["getAppStatus"]>,
      shouldBootstrapApp: () => true,
      markBootstrapComplete: () => null,
      writeReviewNote: (now = new Date()) => {
        written.push(now.toISOString());
        return "review";
      },
      observeItems: () => undefined,
      shouldFollowUpDetail: () => true,
      recordDetailFetch: () => null,
      recordDistill: (source) => {
        distills.push(source);
      },
      recordAppFailure: () => null,
      recordAppSuccess: (app) => {
        appSuccesses.push(app);
        return null;
      },
      listItemsForSync: async (rawInput: unknown) => {
        const { app, limit, windowDays } = rawInput as { app: string; limit: number; windowDays?: number };
        const resourceType =
          app === "googlecalendar"
            ? "event"
            : app === "gmail" || app === "outlook"
              ? "message"
              : app === "notion" || app === "googledocs" || app === "confluence"
                ? "document"
                : app === "linkedin"
                  ? "record"
                  : app === "googledrive"
                    ? "file"
                    : app === "googlesheets"
                      ? "spreadsheet"
                      : "ticket";
        calls.push({ app, limit, windowDays });
        return {
          success: true,
          app,
          resourceType,
          mode: "compact",
          downgraded: false,
          items: [{ id: `${app}-1`, title: `${app} item`, source: app, preview: "Action required for rollout", status: "open", isUnread: true }],
          resolvedTool: "test-tool",
          count: 1,
          syncWindowDays: windowDays ?? null,
          resolvedCapability: "list",
          nextCursor: null,
        };
      },
      getItemDetailed: async (rawInput: unknown) => {
        const { app, itemId } = rawInput as { app: string; itemId: string };
        const resourceType =
          app === "googlecalendar"
            ? "event"
            : app === "gmail" || app === "outlook"
              ? "message"
              : app === "notion" || app === "googledocs" || app === "confluence"
                ? "document"
                : app === "linkedin"
                  ? "record"
                  : app === "googledrive"
                    ? "file"
                    : app === "googlesheets"
                      ? "spreadsheet"
                      : "ticket";
        detailCalls.push(`${app}:${itemId}`);
        return {
          success: true,
          app,
          resourceType,
          mode: "detailed_structured",
          item: { kind: resourceType as never, title: `${app} item summary`, summary: "summary", normalized: { id: itemId, title: `${app} item summary`, source: app } } as never,
          raw: { id: itemId, title: `${app} raw item` },
          resolvedTool: "test-tool",
        };
      },
      getItemFull: async (rawInput: unknown) => {
        const { app, itemId } = rawInput as { app: string; itemId: string };
        const resourceType =
          app === "googlecalendar"
            ? "event"
            : app === "gmail" || app === "outlook"
              ? "message"
              : app === "notion" || app === "googledocs" || app === "confluence"
                ? "document"
                : app === "linkedin"
                  ? "record"
                  : app === "googledrive"
                    ? "file"
                    : app === "googlesheets"
                      ? "spreadsheet"
                      : "ticket";
        fullCalls.push(`${app}:${itemId}`);
        return {
          success: true,
          app,
          resourceType,
          mode: "full",
          item: { kind: resourceType as never, title: `${app} item summary`, summary: "summary", normalized: { id: itemId, title: `${app} item summary`, source: app } } as never,
          raw: { id: itemId, title: `${app} raw item` },
          resolvedTool: "test-tool",
        };
      },
      promoteSourceMemory: () => null,
      triggerBuildFromSources: () => undefined,
      getDescriptor: (app) => ({
        app,
        resourceType:
          app === "googlecalendar"
            ? "event"
            : app === "gmail" || app === "outlook"
              ? "message"
              : app === "notion" || app === "googledocs" || app === "confluence"
                ? "document"
                : app === "linkedin"
                  ? "record"
                  : app === "googledrive"
                    ? "file"
                    : app === "googlesheets"
                      ? "spreadsheet"
                      : "ticket",
        capabilities: ["list"],
        normalizedSupport: "read_only",
      }) as NonNullable<ReturnType<GraphSyncRunnerDeps["getDescriptor"]>>,
  };

  const results = await runGraphSyncIteration(deps, new Date("2026-04-18T16:00:00.000Z"));

  assert.deepEqual(
    calls,
    [
      { app: "github", limit: 100, windowDays: 30 },
      { app: "jira", limit: 80, windowDays: 30 },
      { app: "linear", limit: 80, windowDays: 30 },
      { app: "googlecalendar", limit: 64, windowDays: 30 },
      { app: "linkedin", limit: 64, windowDays: 30 },
      { app: "googledrive", limit: 48, windowDays: 30 },
      { app: "googlesheets", limit: 48, windowDays: 30 },
      { app: "notion", limit: 56, windowDays: 30 },
      { app: "googledocs", limit: 56, windowDays: 30 },
      { app: "confluence", limit: 56, windowDays: 30 },
    ],
  );
  assert.equal(written.length, 8);
  assert.equal(appSuccesses.length, 10);
  assert.deepEqual(detailCalls, [
    "jira:jira-1",
    "linear:linear-1",
    "googlecalendar:googlecalendar-1",
    "linkedin:linkedin-1",
    "googledrive:googledrive-1",
    "googlesheets:googlesheets-1",
    "notion:notion-1",
    "googledocs:googledocs-1",
    "confluence:confluence-1",
  ]);
  assert.deepEqual(fullCalls, ["github:github-1"]);
  assert.equal(distills.length, 10);
  assert.equal(results.find((entry) => entry.source === "linear")?.due, true);
  assert.equal(results.find((entry) => entry.source === "record")?.appsSynced.length, 1);
  assert.equal(results.find((entry) => entry.source === "file")?.appsSynced.length, 1);
  assert.equal(results.find((entry) => entry.source === "spreadsheet")?.appsSynced.length, 1);
  assert.equal(results.find((entry) => entry.source === "email")?.bootstrapApps.length, 0);
  assert.equal(results.find((entry) => entry.source === "email")?.connectedApps.length, 0);
  assert.equal(results.find((entry) => entry.source === "document")?.appsSynced.length, 3);
  assert.equal(results.find((entry) => entry.source === "email")?.itemsSynced, 0);
  assert.equal(results.find((entry) => entry.source === "email")?.detailsFetched, 0);
});

test("runGraphSyncIteration records failures without aborting other sources", async () => {
  const calls: string[] = [];
  const failures: string[] = [];

  const deps: GraphSyncRunnerDeps = {
      getConnectedToolkits: () => ["github", "gmail"],
      getStatus: () => ({ shouldSync: true, distillBudgetRemaining: 1 }) as ReturnType<GraphSyncRunnerDeps["getStatus"]>,
      getAppStatus: () => ({ inBackoff: false }) as ReturnType<GraphSyncRunnerDeps["getAppStatus"]>,
      shouldBootstrapApp: () => false,
      markBootstrapComplete: () => null,
      writeReviewNote: () => "review",
      observeItems: () => undefined,
      shouldFollowUpDetail: () => false,
      recordDetailFetch: () => null,
      recordDistill: () => undefined,
      recordAppFailure: (app, _resourceType, error) => {
        failures.push(`${app}:${error}`);
        return null;
      },
      recordAppSuccess: () => null,
      listItemsForSync: async (rawInput: unknown) => {
        const { app } = rawInput as { app: string };
        calls.push(app);
        if (app === "github") {
          return { success: false, code: "provider_execution_failed", error: "provider error" };
        }
        return {
          success: true,
          app,
          resourceType: "message",
          mode: "compact",
          downgraded: false,
          items: [],
          resolvedTool: "test-tool",
          count: 1,
          syncWindowDays: null,
          resolvedCapability: "list",
          nextCursor: null,
        };
      },
      getItemDetailed: async () => {
        throw new Error("should not fetch details");
      },
      getItemFull: async () => {
        throw new Error("should not fetch details");
      },
      promoteSourceMemory: () => null,
      triggerBuildFromSources: () => undefined,
      getDescriptor: (app) => ({
        app,
        resourceType: app === "gmail" ? "message" : "ticket",
        capabilities: ["list"],
        normalizedSupport: "read_only",
      }) as NonNullable<ReturnType<GraphSyncRunnerDeps["getDescriptor"]>>,
  };

  const results = await runGraphSyncIteration(deps, new Date("2026-04-18T16:30:00.000Z"));

  assert.deepEqual(calls, ["github"]);
  assert.match(failures[0] ?? "", /github:provider error/);
  assert.match(results.find((entry) => entry.source === "github")?.failures[0] ?? "", /provider error/);
  assert.deepEqual(results.find((entry) => entry.source === "github")?.connectedApps, ["github"]);
  assert.equal(results.find((entry) => entry.source === "email")?.itemsSynced, 0);
  assert.equal(results.find((entry) => entry.source === "email")?.detailsFetched, 0);
});

test("runGraphSyncIteration skips apps currently in backoff", async () => {
  const calls: string[] = [];

  const deps: GraphSyncRunnerDeps = {
      getConnectedToolkits: () => ["github", "jira"],
      getStatus: () => ({ shouldSync: true, distillBudgetRemaining: 2 }) as ReturnType<GraphSyncRunnerDeps["getStatus"]>,
      getAppStatus: (app) => ({ inBackoff: app === "github" }) as ReturnType<GraphSyncRunnerDeps["getAppStatus"]>,
      shouldBootstrapApp: () => false,
      markBootstrapComplete: () => null,
      writeReviewNote: () => "review",
      observeItems: () => undefined,
      shouldFollowUpDetail: () => false,
      recordDetailFetch: () => null,
      recordDistill: () => undefined,
      recordAppFailure: () => null,
      recordAppSuccess: () => null,
      listItemsForSync: async (rawInput: unknown) => {
        const { app } = rawInput as { app: string };
        calls.push(app);
        return {
          success: true,
          app,
          resourceType: "ticket",
          mode: "compact",
          downgraded: false,
          items: [],
          resolvedTool: "test-tool",
          count: 1,
          syncWindowDays: null,
          resolvedCapability: "list",
          nextCursor: null,
        };
      },
      getItemDetailed: async () => {
        throw new Error("should not fetch details");
      },
      getItemFull: async () => {
        throw new Error("should not fetch details");
      },
      promoteSourceMemory: () => null,
      triggerBuildFromSources: () => undefined,
      getDescriptor: (app) => ({
        app,
        resourceType: "ticket",
        capabilities: ["list"],
        normalizedSupport: "read_only",
      }) as NonNullable<ReturnType<GraphSyncRunnerDeps["getDescriptor"]>>,
  };

  const results = await runGraphSyncIteration(deps, new Date("2026-04-18T17:00:00.000Z"));

  assert.deepEqual(calls, ["jira"]);
  assert.deepEqual(results.find((entry) => entry.source === "github")?.connectedApps, ["github"]);
  assert.deepEqual(results.find((entry) => entry.source === "github")?.eligibleApps, []);
  assert.equal(results.find((entry) => entry.source === "github")?.appsSynced.length, 0);
});

test("runGraphSyncIteration leaves email source idle in generic runner because gmail sync is handled separately", async () => {
  const calls: Array<{ cursor?: string; limit: number }> = [];
  const fullCalls: string[] = [];

  const deps: GraphSyncRunnerDeps = {
      getConnectedToolkits: () => ["gmail"],
      getStatus: () => ({ shouldSync: false, distillBudgetRemaining: 4 }) as ReturnType<GraphSyncRunnerDeps["getStatus"]>,
      getAppStatus: () => ({ inBackoff: false }) as ReturnType<GraphSyncRunnerDeps["getAppStatus"]>,
      shouldBootstrapApp: () => true,
      markBootstrapComplete: () => null,
      writeReviewNote: () => "review",
      observeItems: () => undefined,
      shouldFollowUpDetail: () => true,
      recordDetailFetch: () => null,
      recordDistill: () => undefined,
      recordAppFailure: () => null,
      recordAppSuccess: () => null,
      listItemsForSync: async (rawInput: unknown) => {
        const { cursor, limit } = rawInput as { cursor?: string; limit: number };
        calls.push({ cursor, limit });
        if (!cursor) {
          return {
            success: true,
            app: "gmail",
            resourceType: "message",
            mode: "compact",
            downgraded: false,
            items: [
              {
                id: "msg-1",
                threadId: "thread-1",
                title: "Action required for Flazz rollout",
                source: "gmail",
                author: "alice@example.com",
                snippet: "Please review and reply today",
                isUnread: true,
                timestamp: "2026-04-18T10:00:00.000Z",
              },
              {
                id: "msg-2",
                threadId: "thread-news",
                title: "Weekly newsletter",
                source: "gmail",
                author: "newsletter@noreply.example.com",
                labels: ["PROMOTIONS"],
                snippet: "Unsubscribe any time",
                timestamp: "2026-04-18T11:00:00.000Z",
              },
            ],
            resolvedTool: "gmail-list",
            count: 2,
      syncWindowDays: 30,
            resolvedCapability: "list",
            nextCursor: "page-2",
          };
        }
        return {
          success: true,
          app: "gmail",
          resourceType: "message",
          mode: "compact",
          downgraded: false,
          items: [
            {
              id: "msg-3",
              threadId: "thread-1",
              title: "Action required for Flazz rollout",
              source: "gmail",
              author: "alice@example.com",
              snippet: "Latest thread update",
              isUnread: true,
              timestamp: "2026-04-18T12:00:00.000Z",
            },
          ],
          resolvedTool: "gmail-list",
          count: 1,
      syncWindowDays: 30,
          resolvedCapability: "list",
          nextCursor: null,
        };
      },
      getItemDetailed: async () => {
        throw new Error("email bootstrap should use full reads");
      },
      getItemFull: async (rawInput: unknown) => {
        const { itemId } = rawInput as { itemId: string };
        fullCalls.push(itemId);
        return {
          success: true,
          app: "gmail",
          resourceType: "message",
          mode: "full",
          item: { kind: "message" as never, title: "Action required for Flazz rollout", summary: "summary", normalized: { id: itemId, title: "Action required for Flazz rollout", source: "gmail", threadId: "thread-1" } } as never,
          raw: { id: itemId, body: "full body" },
          resolvedTool: "gmail-read",
        };
      },
      promoteSourceMemory: () => null,
      triggerBuildFromSources: () => undefined,
      getDescriptor: () => ({
        app: "gmail",
        resourceType: "message",
        capabilities: ["list", "read"],
        normalizedSupport: "read_only",
      }) as NonNullable<ReturnType<GraphSyncRunnerDeps["getDescriptor"]>>,
  };

  const results = await runGraphSyncIteration(deps, new Date("2026-04-18T16:00:00.000Z"));

  assert.deepEqual(calls, []);
  assert.deepEqual(fullCalls, []);
  assert.equal(results.find((entry) => entry.source === "email")?.connectedApps.length, 0);
  assert.equal(results.find((entry) => entry.source === "email")?.itemsSynced, 0);
  assert.equal(results.find((entry) => entry.source === "email")?.detailsFetched, 0);
});

test("runGraphSyncIteration force option bypasses cadence gating for connected sources", async () => {
  const calls: string[] = [];

  const deps: GraphSyncRunnerDeps = {
      getConnectedToolkits: () => ["github"],
      getStatus: () => ({ shouldSync: false, distillBudgetRemaining: 1 }) as ReturnType<GraphSyncRunnerDeps["getStatus"]>,
      getAppStatus: () => ({ inBackoff: false }) as ReturnType<GraphSyncRunnerDeps["getAppStatus"]>,
      shouldBootstrapApp: () => false,
      markBootstrapComplete: () => null,
      writeReviewNote: () => "review",
      observeItems: () => undefined,
      shouldFollowUpDetail: () => false,
      recordDetailFetch: () => null,
      recordDistill: () => undefined,
      recordAppFailure: () => null,
      recordAppSuccess: () => null,
      listItemsForSync: async (rawInput: unknown) => {
        const { app } = rawInput as { app: string };
        calls.push(app);
        return {
          success: true,
          app,
          resourceType: "ticket",
          mode: "compact",
          downgraded: false,
          items: [{ id: "github-1", title: "Fix sync", source: "github" }],
          resolvedTool: "test-tool",
          count: 1,
          syncWindowDays: null,
          resolvedCapability: "list",
          nextCursor: null,
        };
      },
      getItemDetailed: async () => {
        throw new Error("should not fetch details");
      },
      getItemFull: async () => {
        throw new Error("should not fetch details");
      },
      promoteSourceMemory: () => null,
      triggerBuildFromSources: () => undefined,
      getDescriptor: () => ({
        app: "github",
        resourceType: "ticket",
        capabilities: ["list"],
        normalizedSupport: "read_only",
      }) as NonNullable<ReturnType<GraphSyncRunnerDeps["getDescriptor"]>>,
  };

  const results = await runGraphSyncIteration(deps, new Date("2026-04-18T16:00:00.000Z"), { force: true });

  assert.deepEqual(calls, ["github"]);
  assert.equal(results.find((entry) => entry.source === "github")?.due, true);
  assert.equal(results.find((entry) => entry.source === "github")?.itemsSynced, 1);
});
