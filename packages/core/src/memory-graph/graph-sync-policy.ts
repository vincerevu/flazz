export type GraphSyncSource =
  | "github"
  | "jira"
  | "linear"
  | "googlecalendar"
  | "record"
  | "file"
  | "spreadsheet"
  | "document"
  | "email"
  | "conversation";

export type GraphSyncPolicy = {
  source: GraphSyncSource;
  activeCadenceMinutes: number;
  idleCadenceMinutes: number;
  dailyClassificationBudget: number;
  dailyDistillBudget: number;
  priority: "p0" | "p1" | "p2";
};

export const GRAPH_SYNC_POLICIES: Record<GraphSyncSource, GraphSyncPolicy> = {
  github: {
    source: "github",
    activeCadenceMinutes: 60,
    idleCadenceMinutes: 120,
    dailyClassificationBudget: 12,
    dailyDistillBudget: 30,
    priority: "p0",
  },
  jira: {
    source: "jira",
    activeCadenceMinutes: 60,
    idleCadenceMinutes: 120,
    dailyClassificationBudget: 12,
    dailyDistillBudget: 30,
    priority: "p0",
  },
  linear: {
    source: "linear",
    activeCadenceMinutes: 60,
    idleCadenceMinutes: 120,
    dailyClassificationBudget: 12,
    dailyDistillBudget: 30,
    priority: "p0",
  },
  googlecalendar: {
    source: "googlecalendar",
    activeCadenceMinutes: 60,
    idleCadenceMinutes: 120,
    dailyClassificationBudget: 6,
    dailyDistillBudget: 12,
    priority: "p0",
  },
  document: {
    source: "document",
    activeCadenceMinutes: 180,
    idleCadenceMinutes: 480,
    dailyClassificationBudget: 10,
    dailyDistillBudget: 20,
    priority: "p1",
  },
  record: {
    source: "record",
    activeCadenceMinutes: 60,
    idleCadenceMinutes: 240,
    dailyClassificationBudget: 8,
    dailyDistillBudget: 16,
    priority: "p1",
  },
  file: {
    source: "file",
    activeCadenceMinutes: 120,
    idleCadenceMinutes: 360,
    dailyClassificationBudget: 6,
    dailyDistillBudget: 10,
    priority: "p2",
  },
  spreadsheet: {
    source: "spreadsheet",
    activeCadenceMinutes: 120,
    idleCadenceMinutes: 360,
    dailyClassificationBudget: 6,
    dailyDistillBudget: 12,
    priority: "p2",
  },
  email: {
    source: "email",
    activeCadenceMinutes: 60,
    idleCadenceMinutes: 180,
    dailyClassificationBudget: 6,
    dailyDistillBudget: 12,
    priority: "p2",
  },
  conversation: {
    source: "conversation",
    activeCadenceMinutes: 0,
    idleCadenceMinutes: 0,
    dailyClassificationBudget: 0,
    dailyDistillBudget: 24,
    priority: "p1",
  },
};

export function getGraphSyncPolicy(source: GraphSyncSource): GraphSyncPolicy {
  return GRAPH_SYNC_POLICIES[source];
}

export function getCadenceMinutes(source: GraphSyncSource, options?: { idle?: boolean }) {
  const policy = getGraphSyncPolicy(source);
  return options?.idle ? policy.idleCadenceMinutes : policy.activeCadenceMinutes;
}
