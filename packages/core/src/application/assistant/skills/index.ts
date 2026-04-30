import path from "node:path";
import { fileURLToPath } from "node:url";
import builtinToolsSkill from "./builtin-tools/skill.js";
import deletionGuardrailsSkill from "./deletion-guardrails/skill.js";
import docCollabSkill from "./doc-collab/skill.js";
import draftEmailsSkill from "./draft-emails/skill.js";
import mcpIntegrationSkill from "./mcp-integration/skill.js";
import meetingPrepSkill from "./meeting-prep/skill.js";
import organizeFilesSkill from "./organize-files/skill.js";
import slackSkill from "./slack/skill.js";
import backgroundAgentsSkill from "./background-agents/skill.js";
import createPresentationsSkill from "./create-presentations/skill.js";
import createDocumentsSkill from "./create-documents/skill.js";
import createSpreadsheetsSkill from "./create-spreadsheets/skill.js";
import webSearchSkill from "./web-search/skill.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PREFIX = "src/application/assistant/skills";

export type SkillDefinition = {
  id: string;  // Also used as folder name
  title: string;
  summary: string;
  content: string;
};

export type ResolvedSkill = {
  id: string;
  catalogPath: string;
  content: string;
};

export const builtInSkillDefinitions: SkillDefinition[] = [
  {
    id: "create-documents",
    title: "Create Documents",
    summary: "Create and edit explicitly requested document artifacts such as DOCX/PDF reports, proposals, memos, and long-form deliverables. Do not use for research or analysis unless the user asked for a file.",
    content: createDocumentsSkill,
  },
  {
    id: "create-spreadsheets",
    title: "Create Spreadsheets",
    summary: "Create and edit explicitly requested spreadsheet artifacts such as .xlsx reports, KPI tables, financial models, and tabular exports using the built-in workbook renderer for new files and XML-safe workflows for existing workbooks.",
    content: createSpreadsheetsSkill,
  },
  {
    id: "create-presentations",
    title: "Create Presentations",
    summary: "Create and edit explicitly requested native PowerPoint slide decks using workspace context, template editing workflows, and PptxGenJS generation with Node-based QA.",
    content: createPresentationsSkill,
  },
  {
    id: "doc-collab",
    title: "Document Collaboration",
    summary: "Collaborate on documents - create, edit, and refine notes and documents in workspace memory.",
    content: docCollabSkill,
  },
  {
    id: "draft-emails",
    title: "Draft Emails",
    summary: "Process incoming emails and create draft responses using calendar and workspace memory for context.",
    content: draftEmailsSkill,
  },
  {
    id: "meeting-prep",
    title: "Meeting Prep",
    summary: "Prepare for meetings by gathering context about attendees from workspace memory.",
    content: meetingPrepSkill,
  },
  {
    id: "organize-files",
    title: "Organize Files",
    summary: "Find, organize, and tidy up files on the user's machine. Move files to folders, clean up Desktop/Downloads, locate specific files.",
    content: organizeFilesSkill,
  },
  {
    id: "slack",
    title: "Slack Integration",
    summary: "Send Slack messages, view channel history, search conversations, find users, and manage team communication.",
    content: slackSkill,
  },
  {
    id: "background-agents",
    title: "Background Agents",
    summary: "Creating, editing, and scheduling background agents. Configure schedules in agent-schedule.json and build multi-agent workflows.",
    content: backgroundAgentsSkill,
  },
  {
    id: "builtin-tools",
    title: "Builtin Tools Reference",
    summary: "Understanding and using builtin tools (especially executeCommand for bash/shell) in agent definitions.",
    content: builtinToolsSkill,
  },
  {
    id: "mcp-integration",
    title: "MCP Integration Guidance",
    summary: "Discovering, executing, and integrating MCP tools. Use this to check what external capabilities are available and execute MCP tools on behalf of users.",
    content: mcpIntegrationSkill,
  },
  {
    id: "web-search",
    title: "Web Search",
    summary: "Searching the web, image results, or researching a topic. Guidance on when to use web-search, image-search, or research-search, and how many searches to do.",
    content: webSearchSkill,
  },
  {
    id: "deletion-guardrails",
    title: "Deletion Guardrails",
    summary: "Following the confirmation process before removing workflows or agents and their dependencies.",
    content: deletionGuardrailsSkill,
  },
];

export const builtInSkillEntries = builtInSkillDefinitions.map((definition) => ({
  ...definition,
  catalogPath: `${CATALOG_PREFIX}/${definition.id}/skill.ts`,
}));

const catalogSections = builtInSkillEntries.map((entry) => [
  `## ${entry.title}`,
  `- **Skill file:** \`${entry.catalogPath}\``,
  `- **Use it for:** ${entry.summary}`,
].join("\n"));

export const skillCatalog = [
  "# Flazz Skill Catalog",
  "",
  "Use this catalog to see which specialized skills you can load. Each entry lists the exact skill file plus a short description of when it helps.",
  "",
  catalogSections.join("\n\n"),
].join("\n");

const normalizeIdentifier = (value: string) =>
  value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");

const aliasMap = new Map<string, ResolvedSkill>();

const registerAlias = (alias: string, entry: ResolvedSkill) => {
  const normalized = normalizeIdentifier(alias);
  if (!normalized) return;
  aliasMap.set(normalized, entry);
};

const registerAliasVariants = (alias: string, entry: ResolvedSkill) => {
  const normalized = normalizeIdentifier(alias);
  if (!normalized) return;

  const variants = new Set<string>([normalized]);

  if (/\.(ts|js)$/i.test(normalized)) {
    variants.add(normalized.replace(/\.(ts|js)$/i, ""));
    variants.add(
      normalized.endsWith(".ts") ? normalized.replace(/\.ts$/i, ".js") : normalized.replace(/\.js$/i, ".ts"),
    );
  } else {
    variants.add(`${normalized}.ts`);
    variants.add(`${normalized}.js`);
  }

  for (const variant of variants) {
    registerAlias(variant, entry);
  }
};

for (const entry of builtInSkillEntries) {
  const absoluteTs = path.join(CURRENT_DIR, entry.id, "skill.ts");
  const absoluteJs = path.join(CURRENT_DIR, entry.id, "skill.js");
  const resolvedEntry: ResolvedSkill = {
    id: entry.id,
    catalogPath: entry.catalogPath,
    content: entry.content,
  };

  const baseAliases = [
    entry.id,
    `${entry.id}/skill`,
    `${entry.id}/skill.ts`,
    `${entry.id}/skill.js`,
    `skills/${entry.id}/skill.ts`,
    `skills/${entry.id}/skill.js`,
    `${CATALOG_PREFIX}/${entry.id}/skill.ts`,
    `${CATALOG_PREFIX}/${entry.id}/skill.js`,
    absoluteTs,
    absoluteJs,
  ];

  for (const alias of baseAliases) {
    registerAliasVariants(alias, resolvedEntry);
  }
}

export const availableSkills = builtInSkillEntries.map((entry) => entry.id);

export function resolveSkill(identifier: string): ResolvedSkill | null {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return null;

  return aliasMap.get(normalized) ?? null;
}
