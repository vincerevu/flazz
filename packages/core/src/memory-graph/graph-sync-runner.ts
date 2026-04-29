import type { BackgroundService } from "../services/background_service.js";
import { composioAccountsRepo } from "../composio/repo.js";
import { graphSyncService, integrationSourceMemoryPromoter, providerMapper } from "../di/container.js";
import { integrationService } from "../integrations/service.js";
import { serviceLogger, type ServiceRunContext } from "../services/service_logger.js";
import type { GraphSyncSource } from "./graph-sync-policy.js";
import type { IntegrationResourceType } from "../integrations/types.js";
import { triggerGraphBuilderNow } from "./build-graph.js";

const SYNC_LOOP_INTERVAL_MS = 60 * 1000;
const BOOTSTRAP_WINDOW_DAYS = 30;

const SOURCE_APPS: Record<Exclude<GraphSyncSource, "conversation">, string[]> = {
  github: ["github"],
  jira: ["jira"],
  linear: ["linear"],
  googlecalendar: ["googlecalendar"],
  record: ["linkedin", "hubspot", "salesforce", "pipedrive"],
  file: ["googledrive", "dropbox", "box"],
  spreadsheet: ["googlesheets", "airtable"],
  document: ["notion", "googledocs", "confluence"],
  email: [],
};

const SOURCE_LIMITS: Record<Exclude<GraphSyncSource, "conversation">, number> = {
  github: 25,
  jira: 10,
  linear: 10,
  googlecalendar: 8,
  record: 6,
  file: 6,
  spreadsheet: 6,
  document: 5,
  email: 6,
};

const BOOTSTRAP_SOURCE_LIMITS: Record<Exclude<GraphSyncSource, "conversation">, number> = {
  github: 100,
  jira: 40,
  linear: 40,
  googlecalendar: 32,
  record: 32,
  file: 24,
  spreadsheet: 24,
  document: 28,
  email: 32,
};

const BOOTSTRAP_PAGE_LIMITS: Record<Exclude<GraphSyncSource, "conversation">, number> = {
  github: 100,
  jira: 80,
  linear: 80,
  googlecalendar: 64,
  record: 64,
  file: 48,
  spreadsheet: 48,
  document: 56,
  email: 64,
};

const BOOTSTRAP_MAX_PAGES: Record<Exclude<GraphSyncSource, "conversation">, number> = {
  github: 15,
  jira: 10,
  linear: 10,
  googlecalendar: 8,
  record: 8,
  file: 6,
  spreadsheet: 6,
  document: 8,
  email: 10,
};

const BOOTSTRAP_MAX_ITEMS: Record<Exclude<GraphSyncSource, "conversation">, number> = {
  github: 1000,
  jira: 500,
  linear: 500,
  googlecalendar: 300,
  record: 300,
  file: 240,
  spreadsheet: 240,
  document: 320,
  email: 500,
};

export type GraphSyncRunnerDeps = {
  getConnectedToolkits: () => Promise<string[]>;
  getStatus: typeof graphSyncService.getStatus;
  getAppStatus: typeof graphSyncService.getAppStatus;
  shouldBootstrapApp: typeof graphSyncService.shouldBootstrapApp;
  markBootstrapComplete: typeof graphSyncService.markBootstrapComplete;
  writeReviewNote: typeof graphSyncService.writeReviewNote;
  observeItems: typeof graphSyncService.observeItems;
  shouldFollowUpDetail: typeof graphSyncService.shouldFollowUpDetail;
  recordDetailFetch: typeof graphSyncService.recordDetailFetch;
  recordDistill: typeof graphSyncService.recordDistill;
  recordAppFailure: typeof graphSyncService.recordAppFailure;
  recordAppSuccess: typeof graphSyncService.recordAppSuccess;
  listItemsForSync: typeof integrationService.listItemsForSync;
  getItemDetailed: typeof integrationService.getItemDetailed;
  getItemFull: typeof integrationService.getItemFull;
  promoteSourceMemory: typeof integrationSourceMemoryPromoter.promote;
  triggerBuildFromSources: () => void;
  getDescriptor: typeof providerMapper.getDescriptor;
};

type SourceSyncResult = {
  source: Exclude<GraphSyncSource, "conversation">;
  due: boolean;
  connectedApps: string[];
  eligibleApps: string[];
  bootstrapApps: string[];
  appsSynced: string[];
  itemsSynced: number;
  detailsFetched: number;
  failures: string[];
};

type GraphSyncIterationOptions = {
  force?: boolean;
};

type FollowUpItem = {
  id?: string;
  threadId?: string;
  title?: string;
  author?: string;
  labels?: string[];
  updatedAt?: string;
  timestamp?: string;
  startAt?: string;
  snippet?: string;
  preview?: string;
  status?: string;
  threadLength?: number;
  hasAttachment?: boolean;
  importance?: boolean;
  isUnread?: boolean;
};

type SummaryResultItem = {
  kind?: string;
  title?: string;
  summary?: string;
  normalized?: FollowUpItem & {
    assignee?: string;
    owner?: string;
    organizer?: string;
    project?: string;
    recipients?: string[];
    attendees?: string[];
    source?: string;
    path?: string;
    mimeType?: string;
    recordType?: string;
    sheetName?: string;
    rowLabel?: string;
  };
};

type ReadDepth = "detailed" | "full";

const SOURCE_READ_DEPTH: Record<Exclude<GraphSyncSource, "conversation">, ReadDepth> = {
  github: "full",
  jira: "detailed",
  linear: "detailed",
  googlecalendar: "detailed",
  record: "detailed",
  file: "detailed",
  spreadsheet: "detailed",
  document: "detailed",
  email: "full",
};

function getConnectedAppsForSource(
  source: Exclude<GraphSyncSource, "conversation">,
  connectedApps: string[],
) {
  const allowed = new Set(SOURCE_APPS[source]);
  return connectedApps.filter((app) => allowed.has(app));
}

function extractItemTimestamp(item: FollowUpItem) {
  return item.updatedAt ?? item.timestamp ?? item.startAt;
}

function filterItemsWithinWindow(items: FollowUpItem[], now: Date, windowDays: number) {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const filtered = items.filter((item) => {
    const timestamp = extractItemTimestamp(item);
    if (!timestamp) return true;
    const value = new Date(timestamp).getTime();
    if (!Number.isFinite(value)) return true;
    return value >= cutoff;
  });
  return filtered;
}

function emailObjectKey(item: FollowUpItem) {
  return item.threadId ?? item.id ?? `${item.title ?? "email"}-${extractItemTimestamp(item) ?? "unknown"}`;
}

function dedupeEmailThreads(items: FollowUpItem[]) {
  const grouped = new Map<string, FollowUpItem>();
  for (const item of items) {
    const key = emailObjectKey(item);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, item);
      continue;
    }
    const currentTime = new Date(extractItemTimestamp(current) ?? 0).getTime();
    const nextTime = new Date(extractItemTimestamp(item) ?? 0).getTime();
    if (nextTime >= currentTime) {
      grouped.set(key, item);
    }
  }
  return Array.from(grouped.values());
}

function retainEmailThreads(items: FollowUpItem[]) {
  return dedupeEmailThreads(items).sort((a, b) => {
    const aTime = new Date(extractItemTimestamp(a) ?? 0).getTime();
    const bTime = new Date(extractItemTimestamp(b) ?? 0).getTime();
    return bTime - aTime;
  });
}

async function fetchFollowUpItem(
  source: Exclude<GraphSyncSource, "conversation">,
  deps: Pick<GraphSyncRunnerDeps, "getItemDetailed" | "getItemFull">,
  input: { app: string; itemId: string },
) {
  const readDepth = SOURCE_READ_DEPTH[source];
  if (readDepth === "full") {
    return deps.getItemFull(input);
  }
  return deps.getItemDetailed(input);
}

async function collectEmailBootstrapItems(
  source: Exclude<GraphSyncSource, "conversation">,
  app: string,
  deps: Pick<GraphSyncRunnerDeps, "listItemsForSync">,
  now: Date,
) {
  const collected: FollowUpItem[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const pageLimit = BOOTSTRAP_PAGE_LIMITS[source];
  const maxPages = BOOTSTRAP_MAX_PAGES[source];
  const maxItems = BOOTSTRAP_MAX_ITEMS[source];

  while (pages < maxPages && collected.length < maxItems) {
    const result = await deps.listItemsForSync({
      app,
      limit: pageLimit,
      cursor,
      windowDays: BOOTSTRAP_WINDOW_DAYS,
      nowIso: now.toISOString(),
    });
    if (!result || typeof result !== "object" || !("success" in result) || !result.success) {
      return result;
    }

    const items = Array.isArray(result.items) ? (result.items as FollowUpItem[]) : [];
    collected.push(...items);
    pages += 1;

    const nextCursor = "nextCursor" in result && typeof result.nextCursor === "string" ? result.nextCursor : null;
    if (!nextCursor || nextCursor === cursor) {
      return {
        success: true as const,
        items: collected.slice(0, maxItems),
        pages,
        resolvedTool: result.resolvedTool,
        resourceType: result.resourceType,
      };
    }
    cursor = nextCursor;
  }

  return {
    success: true as const,
    items: collected.slice(0, maxItems),
    pages,
    resolvedTool: "paged-email-bootstrap",
    resourceType: "message" as const,
  };
}

async function selectFollowUpCandidates(
  app: string,
  items: FollowUpItem[],
  deps: Pick<GraphSyncRunnerDeps, "shouldFollowUpDetail">,
  now: Date,
): Promise<FollowUpItem[]> {
  if (app === "github") {
    return items.filter((item) => !!item.id);
  }
  const decisions = await Promise.all(items.map(async (item) => ({
    item,
    shouldFollowUp: await deps.shouldFollowUpDetail(app, item, { now }),
  })));
  return decisions
    .filter(({ item, shouldFollowUp }) => shouldFollowUp && !!item.id)
    .map(({ item }) => item);
}

async function syncSource(
  source: Exclude<GraphSyncSource, "conversation">,
  deps: GraphSyncRunnerDeps,
  now = new Date(),
  options?: GraphSyncIterationOptions,
): Promise<SourceSyncResult> {
  const status = await deps.getStatus(source, { now });
  const connectedApps = getConnectedAppsForSource(source, await deps.getConnectedToolkits());
  const bootstrapDecisions = await Promise.all(connectedApps.map(async (app) => {
    const descriptor = deps.getDescriptor(app);
    return {
      app,
      shouldBootstrap: descriptor ? await deps.shouldBootstrapApp(app, descriptor.resourceType) : false,
    };
  }));
  const bootstrapCandidates = bootstrapDecisions
    .filter((entry) => entry.shouldBootstrap)
    .map((entry) => entry.app);
  const shouldRun = Boolean(
    connectedApps.length > 0 && (options?.force ? true : status.shouldSync || bootstrapCandidates.length > 0)
  );
  if (!shouldRun) {
    return {
      source,
      due: false,
      connectedApps,
      eligibleApps: [],
      bootstrapApps: [],
      appsSynced: [],
      itemsSynced: 0,
      detailsFetched: 0,
      failures: [],
    };
  }

  const availability = await Promise.all(connectedApps.map(async (app) => {
    const descriptor = deps.getDescriptor(app);
    const appStatus = descriptor ? await deps.getAppStatus(app, descriptor.resourceType, now) : null;
    return {
      app,
      available: Boolean(descriptor && !appStatus?.inBackoff),
    };
  }));
  const availableApps = availability
    .filter((entry) => entry.available)
    .map((entry) => entry.app);
  const bootstrapApps = availableApps.filter((app) => bootstrapCandidates.includes(app));
  const appsSynced: string[] = [];
  const failures: string[] = [];
  let itemsSynced = 0;
  let detailsFetched = 0;
  let sourceWrites = 0;

  for (const app of availableApps) {
    const descriptor = deps.getDescriptor(app);
    if (!descriptor) {
      continue;
    }

    try {
      const bootstrap = bootstrapApps.includes(app);
      const limit = bootstrap ? BOOTSTRAP_SOURCE_LIMITS[source] : SOURCE_LIMITS[source];
      const result = bootstrap
        ? await collectEmailBootstrapItems(source, app, deps, now)
        : await deps.listItemsForSync({
            app,
            limit,
            windowDays: bootstrap ? BOOTSTRAP_WINDOW_DAYS : undefined,
            nowIso: now.toISOString(),
          });
      if (result && typeof result === "object" && "success" in result && result.success) {
        appsSynced.push(app);
        await deps.recordAppSuccess(app, descriptor.resourceType, now);
        const normalizedItems = Array.isArray(result.items) ? (result.items as FollowUpItem[]) : [];
        const scopedItems = source === "email"
          ? retainEmailThreads(
              bootstrap
                ? filterItemsWithinWindow(normalizedItems, now, BOOTSTRAP_WINDOW_DAYS)
                : normalizedItems,
            )
          : bootstrap
            ? filterItemsWithinWindow(normalizedItems, now, BOOTSTRAP_WINDOW_DAYS)
            : normalizedItems;
        itemsSynced += scopedItems.length;
        await deps.observeItems(app, normalizedItems, now);
        for (const item of scopedItems) {
          try {
            const result = deps.promoteSourceMemory(app, descriptor.resourceType as IntegrationResourceType, {
              kind: descriptor.resourceType,
              title: item.title,
              summary: item.snippet ?? item.preview,
              normalized: {
                ...item,
                source: app,
              },
              raw: item,
            });
            if (result) {
              sourceWrites += 1;
            }
          } catch (error) {
            console.warn(`[GraphSyncRunner] Failed to promote source memory snapshot for ${app}:${item.id ?? item.threadId ?? item.title}: ${error instanceof Error ? error.message : "unknown error"}`);
          }
        }
        const candidates = await selectFollowUpCandidates(app, scopedItems, deps, now);
        for (const candidate of candidates) {
          if (!candidate.id) {
            continue;
          }
          const detailResult = await fetchFollowUpItem(source, deps, {
            app,
            itemId: candidate.id,
          });
          if (detailResult && typeof detailResult === "object" && "success" in detailResult && detailResult.success) {
            detailsFetched += 1;
            await deps.recordDistill(source, 1, now);
            await deps.recordDetailFetch(app, descriptor.resourceType, candidate, now);
            if (detailResult.item && typeof detailResult.item === "object") {
              try {
                const result = deps.promoteSourceMemory(app, descriptor.resourceType as IntegrationResourceType, detailResult.item as SummaryResultItem);
                if (result) {
                  sourceWrites += 1;
                }
              } catch (error) {
                console.warn(`[GraphSyncRunner] Failed to promote source memory for ${app}:${candidate.id}: ${error instanceof Error ? error.message : "unknown error"}`);
              }
            }
          } else {
            const error = detailResult && typeof detailResult === "object" && "error" in detailResult ? String(detailResult.error) : "unknown detail sync error";
            await deps.recordAppFailure(app, descriptor.resourceType, error, now);
            failures.push(`${app}#${candidate.id}: ${error}`);
          }
        }
        if (bootstrap) {
          await deps.markBootstrapComplete(app, descriptor.resourceType, now);
        }
      } else {
        const error = result && typeof result === "object" && "error" in result ? String(result.error) : "unknown sync error";
        await deps.recordAppFailure(app, descriptor.resourceType, error, now);
        failures.push(`${app}: ${error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown sync error";
      await deps.recordAppFailure(app, descriptor.resourceType, message, now);
      failures.push(`${app}: ${message}`);
    }
  }

  if (sourceWrites > 0) {
    deps.triggerBuildFromSources();
  }
  await deps.writeReviewNote(now);
  return {
    source,
    due: true,
    connectedApps,
    eligibleApps: availableApps,
    bootstrapApps,
    appsSynced,
    itemsSynced,
    detailsFetched,
    failures,
  };
}

export async function runGraphSyncIteration(
  deps: GraphSyncRunnerDeps = {
    getConnectedToolkits: () => composioAccountsRepo.getConnectedToolkits(),
    getStatus: graphSyncService.getStatus.bind(graphSyncService),
    getAppStatus: graphSyncService.getAppStatus.bind(graphSyncService),
    shouldBootstrapApp: graphSyncService.shouldBootstrapApp.bind(graphSyncService),
    markBootstrapComplete: graphSyncService.markBootstrapComplete.bind(graphSyncService),
    writeReviewNote: graphSyncService.writeReviewNote.bind(graphSyncService),
    observeItems: graphSyncService.observeItems.bind(graphSyncService),
    shouldFollowUpDetail: graphSyncService.shouldFollowUpDetail.bind(graphSyncService),
    recordDetailFetch: graphSyncService.recordDetailFetch.bind(graphSyncService),
    recordDistill: graphSyncService.recordDistill.bind(graphSyncService),
    recordAppFailure: graphSyncService.recordAppFailure.bind(graphSyncService),
    recordAppSuccess: graphSyncService.recordAppSuccess.bind(graphSyncService),
    listItemsForSync: integrationService.listItemsForSync.bind(integrationService),
    getItemDetailed: integrationService.getItemDetailed.bind(integrationService),
    getItemFull: integrationService.getItemFull.bind(integrationService),
    promoteSourceMemory: integrationSourceMemoryPromoter.promote.bind(integrationSourceMemoryPromoter),
    triggerBuildFromSources: triggerGraphBuilderNow,
    getDescriptor: providerMapper.getDescriptor.bind(providerMapper),
  },
  now = new Date(),
  options?: GraphSyncIterationOptions,
) {
  const sources = Object.keys(SOURCE_APPS) as Array<Exclude<GraphSyncSource, "conversation">>;
  const results: SourceSyncResult[] = [];
  for (const source of sources) {
    results.push(await syncSource(source, deps, now, options));
  }
  return results;
}

function formatResultSummary(result: SourceSyncResult) {
  if (result.connectedApps.length === 0) {
    return `${result.source}: no connected apps`;
  }
  if (result.eligibleApps.length === 0) {
    return `${result.source}: all connected apps are in backoff`;
  }
  if (result.itemsSynced === 0 && result.failures.length === 0) {
    return `${result.source}: no recent items${result.bootstrapApps.length ? " (bootstrap)" : ""}`;
  }
  const apps = result.appsSynced.length ? result.appsSynced.join(", ") : result.eligibleApps.join(", ");
  return `${result.source}: apps=${apps}, items=${result.itemsSynced}, details=${result.detailsFetched}, failures=${result.failures.length}${result.bootstrapApps.length ? `, bootstrap=${result.bootstrapApps.join(", ")}` : ""}`;
}

async function logIterationProgress(run: ServiceRunContext, results: SourceSyncResult[]) {
  const dueResults = results.filter((entry) => entry.due && entry.connectedApps.length > 0);
  if (!dueResults.length) {
    await serviceLogger.log({
      type: "progress",
      service: run.service,
      runId: run.runId,
      correlationId: run.correlationId,
      level: "info",
      message: "No graph sync sources were due in this iteration",
      step: "idle",
      current: 0,
      total: results.length,
    });
    return;
  }

  for (let index = 0; index < dueResults.length; index += 1) {
    const result = dueResults[index]!;
    await serviceLogger.log({
      type: "progress",
      service: run.service,
      runId: run.runId,
      correlationId: run.correlationId,
      level: result.failures.length ? "warn" : "info",
      message: formatResultSummary(result),
      step: result.source,
      current: index + 1,
      total: dueResults.length,
      details: {
        appsSynced: result.appsSynced.length,
        itemsSynced: result.itemsSynced,
        detailsFetched: result.detailsFetched,
        failures: result.failures.length,
      },
    });
  }
}

let isRunning = false;
let wakeResolve: (() => void) | null = null;

async function executeLoggedGraphSyncIteration(message: string, trigger: "startup" | "timer" | "manual", options?: GraphSyncIterationOptions) {
  const run = await serviceLogger.startRun({
    service: "graph_sync",
    message,
    trigger,
  });
  const results = await runGraphSyncIteration(undefined, new Date(), options);
  await logIterationProgress(run, results);
  await serviceLogger.log({
    type: "run_complete",
    service: run.service,
    runId: run.runId,
    correlationId: run.correlationId,
    level: results.some((entry) => entry.failures.length) ? "warn" : "info",
    message: "Graph signal sync iteration complete",
    durationMs: Date.now() - run.startedAt,
    outcome: results.some((entry) => entry.due) ? "ok" : "idle",
    summary: {
      dueSources: results.filter((entry) => entry.due).length,
      appsSynced: results.reduce((sum, entry) => sum + entry.appsSynced.length, 0),
      itemsSynced: results.reduce((sum, entry) => sum + entry.itemsSynced, 0),
      detailsFetched: results.reduce((sum, entry) => sum + entry.detailsFetched, 0),
      failures: results.reduce((sum, entry) => sum + entry.failures.length, 0),
    },
  });
  return results;
}

function interruptibleSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      wakeResolve = null;
      resolve();
    }, ms);
    wakeResolve = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
}

export const graphSyncRunnerService: BackgroundService = {
  name: "GraphSyncRunner",
  async start() {
    if (isRunning) return;
    isRunning = true;

    console.log("[GraphSyncRunner] Starting graph sync runner service");
    console.log(`[GraphSyncRunner] Poll interval: ${SYNC_LOOP_INTERVAL_MS / 1000}s`);

    if (isRunning) {
      try {
        await executeLoggedGraphSyncIteration("Starting graph signal sync", "startup");
      } catch (error) {
        console.error("[GraphSyncRunner] Error in initial run:", error);
      }
    }

    void (async () => {
      while (isRunning) {
        await interruptibleSleep(SYNC_LOOP_INTERVAL_MS);
        if (!isRunning) break;
        try {
          await executeLoggedGraphSyncIteration("Running scheduled graph signal sync", "timer");
        } catch (error) {
          console.error("[GraphSyncRunner] Error in loop:", error);
        }
      }
    })();
  },
  async stop() {
    isRunning = false;
    if (wakeResolve) {
      wakeResolve();
    }
  },
};

export async function triggerGraphSyncNow(options?: GraphSyncIterationOptions) {
  if (!isRunning) {
    return { success: false as const, error: "GraphSyncRunner is not running." };
  }
  const results = await executeLoggedGraphSyncIteration("Running manual graph signal sync", "manual", {
    force: options?.force ?? true,
  });
  if (wakeResolve) {
    wakeResolve();
  }
  return {
    success: true as const,
    forced: options?.force ?? true,
    results,
  };
}
