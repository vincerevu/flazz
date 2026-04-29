import fs from "node:fs";
import path from "node:path";
import type { GraphSignal as GraphSignalSchema } from "@flazz/shared/dist/graph-signals.js";
import { z } from "zod";
import { getCadenceMinutes, getGraphSyncPolicy, type GraphSyncSource } from "./graph-sync-policy.js";
import type { GraphSyncAppState, GraphSyncSourceState, IGraphSyncStateRepo } from "./graph-sync-state-repo.js";

type GraphSignalRecord = z.infer<typeof GraphSignalSchema>;
const GRAPH_SYNC_BOOTSTRAP_VERSION = 2;

function getDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function minutesBetween(olderIso: string | undefined, now: Date) {
  if (!olderIso) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - new Date(olderIso).getTime()) / 60000));
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value}m`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function buildObjectFingerprint(item: { id?: string; title?: string; updatedAt?: string; timestamp?: string; startAt?: string; snippet?: string; preview?: string; status?: string }) {
  return [
    item.id,
    item.title,
    item.updatedAt,
    item.timestamp,
    item.startAt,
    item.status,
    item.snippet,
    item.preview,
  ].filter(Boolean).join("|");
}

export function mapAppToGraphSyncSource(app: string, resourceType?: string): GraphSyncSource | null {
  if (app === "github") return "github";
  if (app === "jira") return "jira";
  if (app === "linear") return "linear";
  if (app === "googlecalendar") return "googlecalendar";
  if (app === "gmail" || app === "outlook") return "email";
  if (resourceType === "record" || app === "linkedin" || app === "hubspot" || app === "salesforce" || app === "pipedrive") return "record";
  if (resourceType === "file" || app === "googledrive" || app === "dropbox" || app === "box") return "file";
  if (resourceType === "spreadsheet" || app === "googlesheets" || app === "airtable") return "spreadsheet";
  if (resourceType === "document" || app === "notion" || app === "googledocs" || app === "confluence") return "document";
  return null;
}

export class GraphSyncService {
  private readonly reviewPath: string;

  constructor(private repo: IGraphSyncStateRepo, workDir: string) {
    this.reviewPath = path.join(workDir, "memory", "Signals", "Reviews", "sync-budget-status.md");
  }

  async recordRead(app: string, resourceType: string | undefined, itemCount: number, at = new Date(), mode: "list" | "detail" = "list") {
    const source = mapAppToGraphSyncSource(app, resourceType);
    if (!source) return null;
    const day = getDayKey(at);
    const current = await this.repo.getSourceState(source, day);
    const appState = await this.repo.getAppState(app, source, day);
    const next: GraphSyncSourceState = {
      ...current,
      lastReadAt: at.toISOString(),
      readsToday: current.readsToday + 1,
      itemsSeenToday: current.itemsSeenToday + Math.max(0, itemCount),
    };
    await this.repo.upsertSourceState(next);
    const nextAppState: GraphSyncAppState = {
      ...appState,
      lastListReadAt: mode === "list" ? at.toISOString() : appState.lastListReadAt,
      lastDetailReadAt: mode === "detail" ? at.toISOString() : appState.lastDetailReadAt,
      listReadsToday: appState.listReadsToday + (mode === "list" ? 1 : 0),
      detailReadsToday: appState.detailReadsToday + (mode === "detail" ? 1 : 0),
      lastError: undefined,
    };
    await this.repo.upsertAppState(nextAppState);
    await this.writeReviewNote(at);
    return next;
  }

  async observeItems(app: string, items: Array<{ id?: string; title?: string; updatedAt?: string; timestamp?: string; startAt?: string; snippet?: string; preview?: string; status?: string }>, at = new Date()) {
    for (const item of items) {
      if (!item.id) continue;
      const current = await this.repo.getObjectState(app, item.id);
      await this.repo.upsertObjectState({
        app,
        objectId: item.id,
        lastSeenAt: at.toISOString(),
        lastDetailAt: current?.lastDetailAt,
        lastFingerprint: buildObjectFingerprint(item),
      });
    }
    await this.writeReviewNote(at);
  }

  shouldFollowUpDetail(
    app: string,
    item: { id?: string; title?: string; updatedAt?: string; timestamp?: string; startAt?: string; snippet?: string; preview?: string; status?: string },
    options?: { now?: Date; cooldownMinutes?: number },
  ) {
    return this.shouldFollowUpDetailAsync(app, item, options);
  }

  async shouldFollowUpDetailAsync(
    app: string,
    item: { id?: string; title?: string; updatedAt?: string; timestamp?: string; startAt?: string; snippet?: string; preview?: string; status?: string },
    options?: { now?: Date; cooldownMinutes?: number },
  ) {
    if (!item.id) return false;
    const now = options?.now ?? new Date();
    const cooldownMinutes = options?.cooldownMinutes ?? 360;
    const current = await this.repo.getObjectState(app, item.id);
    if (!current) return true;
    const nextFingerprint = buildObjectFingerprint(item);
    if (current.lastFingerprint && nextFingerprint && current.lastFingerprint !== nextFingerprint) {
      return true;
    }
    return minutesBetween(current.lastDetailAt, now) >= cooldownMinutes;
  }

  async recordDetailFetch(
    app: string,
    resourceType: string | undefined,
    item: { id?: string; title?: string; updatedAt?: string; timestamp?: string; startAt?: string; snippet?: string; preview?: string; status?: string },
    at = new Date(),
  ) {
    if (!item.id) return null;
    await this.recordRead(app, resourceType, 1, at, "detail");
    const current = await this.repo.getObjectState(app, item.id);
    await this.repo.upsertObjectState({
      app,
      objectId: item.id,
      lastSeenAt: current?.lastSeenAt ?? at.toISOString(),
      lastDetailAt: at.toISOString(),
      lastFingerprint: buildObjectFingerprint(item),
    });
    return this.repo.getObjectState(app, item.id);
  }

  async getAppStatus(app: string, resourceType: string | undefined, at = new Date()) {
    const source = mapAppToGraphSyncSource(app, resourceType);
    if (!source) return null;
    const day = getDayKey(at);
    const state = await this.repo.getAppState(app, source, day);
    const backoffUntil = state.backoffUntil ? new Date(state.backoffUntil) : null;
    return {
      app,
      source,
      state,
      inBackoff: Boolean(backoffUntil && backoffUntil.getTime() > at.getTime()),
      backoffMinutesRemaining: backoffUntil ? Math.max(0, minutesBetween(at.toISOString(), backoffUntil)) : 0,
    };
  }

  async shouldBootstrapApp(app: string, resourceType: string | undefined) {
    const source = mapAppToGraphSyncSource(app, resourceType);
    if (!source) return false;
    const current = await this.repo.getLatestAppState(app, source);
    if ((current?.bootstrapVersion ?? 0) < GRAPH_SYNC_BOOTSTRAP_VERSION) {
      return true;
    }
    return !(await this.repo.hasAppHistory(app, source));
  }

  async markBootstrapComplete(app: string, resourceType: string | undefined, at = new Date()) {
    const source = mapAppToGraphSyncSource(app, resourceType);
    if (!source) return null;
    const day = getDayKey(at);
    const current = await this.repo.getAppState(app, source, day);
    const nextState: GraphSyncAppState = {
      ...current,
      bootstrapVersion: GRAPH_SYNC_BOOTSTRAP_VERSION,
      bootstrapCompletedAt: at.toISOString(),
    };
    await this.repo.upsertAppState(nextState);
    await this.writeReviewNote(at);
    return nextState;
  }

  async recordAppFailure(app: string, resourceType: string | undefined, error: string, at = new Date()) {
    const source = mapAppToGraphSyncSource(app, resourceType);
    if (!source) return null;
    const day = getDayKey(at);
    const current = await this.repo.getAppState(app, source, day);
    const consecutiveFailures = current.consecutiveFailures + 1;
    const backoffMinutes = Math.min(360, 5 * Math.pow(2, Math.max(0, consecutiveFailures - 1)));
    const nextState: GraphSyncAppState = {
      ...current,
      consecutiveFailures,
      backoffUntil: addMinutes(at, backoffMinutes).toISOString(),
      lastError: error,
    };
    await this.repo.upsertAppState(nextState);
    await this.writeReviewNote(at);
    return nextState;
  }

  async recordAppSuccess(app: string, resourceType: string | undefined, at = new Date()) {
    const source = mapAppToGraphSyncSource(app, resourceType);
    if (!source) return null;
    const day = getDayKey(at);
    const current = await this.repo.getAppState(app, source, day);
    const nextState: GraphSyncAppState = {
      ...current,
      consecutiveFailures: 0,
      backoffUntil: undefined,
      lastError: undefined,
    };
    await this.repo.upsertAppState(nextState);
    await this.writeReviewNote(at);
    return nextState;
  }

  async recordSignalBatch(signals: GraphSignalRecord[], at = new Date()) {
    if (!signals.length) return;
    const grouped = new Map<GraphSyncSource, number>();
    for (const signal of signals) {
      const source = signal.source as GraphSyncSource;
      grouped.set(source, (grouped.get(source) ?? 0) + 1);
    }
    const day = getDayKey(at);
    for (const [source, count] of grouped.entries()) {
      const current = await this.repo.getSourceState(source, day);
      await this.repo.upsertSourceState({
        ...current,
        lastSignalAt: at.toISOString(),
        signalsToday: current.signalsToday + count,
      });
    }
    await this.writeReviewNote(at);
  }

  async recordClassification(source: GraphSyncSource, count = 1, at = new Date()) {
    const day = getDayKey(at);
    const current = await this.repo.getSourceState(source, day);
    await this.repo.upsertSourceState({
      ...current,
      classificationCallsToday: current.classificationCallsToday + count,
    });
    await this.writeReviewNote(at);
  }

  async recordDistill(source: GraphSyncSource, count = 1, at = new Date()) {
    const day = getDayKey(at);
    const current = await this.repo.getSourceState(source, day);
    await this.repo.upsertSourceState({
      ...current,
      distillCallsToday: current.distillCallsToday + count,
    });
    await this.writeReviewNote(at);
  }

  async getStatus(source: GraphSyncSource, options?: { idle?: boolean; now?: Date }) {
    const now = options?.now ?? new Date();
    const day = getDayKey(now);
    const current = await this.repo.getSourceState(source, day);
    const policy = getGraphSyncPolicy(source);
    const cadenceMinutes = getCadenceMinutes(source, { idle: options?.idle });
    const minutesSinceLastRead = minutesBetween(current.lastReadAt, now);
    const dueInMinutes = cadenceMinutes === 0 ? 0 : Math.max(0, cadenceMinutes - minutesSinceLastRead);
    return {
      source,
      policy,
      state: current,
      cadenceMinutes,
      minutesSinceLastRead,
      dueInMinutes,
      shouldSync: cadenceMinutes === 0 ? false : minutesSinceLastRead >= cadenceMinutes,
      distillBudgetRemaining: Math.max(0, policy.dailyDistillBudget - current.distillCallsToday),
      classificationBudgetRemaining: Math.max(0, policy.dailyClassificationBudget - current.classificationCallsToday),
    };
  }

  async listStatuses(options?: { idle?: boolean; now?: Date }) {
    const sources: GraphSyncSource[] = ["github", "jira", "linear", "googlecalendar", "record", "file", "spreadsheet", "document", "email", "conversation"];
    return Promise.all(sources.map((source) => this.getStatus(source, options)));
  }

  async writeReviewNote(at = new Date()) {
    const statuses = await this.listStatuses({ now: at });
    const appStates = await this.repo.listAppStatesForDay(getDayKey(at));
    fs.mkdirSync(path.dirname(this.reviewPath), { recursive: true });
    fs.writeFileSync(
      this.reviewPath,
      [
        "# Sync Budget Status",
        "",
        `**Generated:** ${at.toISOString()}`,
        "",
        "## Sources",
        "",
        ...statuses.map((status) => `- ${status.source}: cadence=${status.cadenceMinutes}m | dueIn=${formatMinutes(status.dueInMinutes)} | reads=${status.state.readsToday} | items=${status.state.itemsSeenToday} | signals=${status.state.signalsToday} | classifyLeft=${status.classificationBudgetRemaining} | distillLeft=${status.distillBudgetRemaining}`),
        "",
        "## Apps",
        "",
        ...(appStates.length
          ? appStates
              .sort((a, b) => a.app.localeCompare(b.app))
              .map((state) => `- ${state.app}: listReads=${state.listReadsToday} | detailReads=${state.detailReadsToday} | failures=${state.consecutiveFailures} | bootstrapVersion=${state.bootstrapVersion ?? 0} | bootstrapCompletedAt=${state.bootstrapCompletedAt ?? "-"} | backoffUntil=${state.backoffUntil ?? "-"} | lastList=${state.lastListReadAt ?? "-"} | lastDetail=${state.lastDetailReadAt ?? "-"} | lastError=${state.lastError ?? "-"}`)
          : ["- No app activity recorded yet."]),
      ].join("\n"),
      "utf8",
    );
    return this.reviewPath;
  }
}
