import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function existsDir(value: string | undefined): value is string {
  return Boolean(value && fs.existsSync(value) && fs.statSync(value).isDirectory());
}

function mergePathList(existing: string | undefined, additions: string[]): string {
  const values = [
    ...additions,
    ...(existing ? existing.split(path.delimiter) : []),
  ].filter(Boolean);
  return [...new Set(values)].join(path.delimiter);
}

export function getFlazzRuntimeHome(): string {
  if (process.env.FLAZZ_RUNTIME_HOME) return process.env.FLAZZ_RUNTIME_HOME;

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "Flazz", "runtimes");
  }

  return path.join(os.homedir(), ".flazz", "runtimes");
}

export function resolveSkillResourceRoot(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    process.env.FLAZZ_SKILL_ROOT,
    resourcesPath ? path.join(resourcesPath, "skills") : undefined,
    path.resolve(process.cwd(), "packages/core/src/application/assistant/skills"),
    path.resolve(process.cwd(), "../packages/core/src/application/assistant/skills"),
    path.resolve(process.cwd(), "../../packages/core/src/application/assistant/skills"),
    path.resolve(process.cwd(), "../../../packages/core/src/application/assistant/skills"),
  ];

  const found = candidates.find(existsDir);
  return found ?? path.join(getFlazzRuntimeHome(), "skills");
}

export function resolveNodeModuleRoots(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    process.env.FLAZZ_NODE_MODULES,
    path.resolve(process.cwd(), "node_modules"),
    path.resolve(process.cwd(), "../node_modules"),
    path.resolve(process.cwd(), "../../node_modules"),
    path.resolve(process.cwd(), "../../../node_modules"),
    path.resolve(process.cwd(), "apps/main/node_modules"),
    path.resolve(process.cwd(), "../apps/main/node_modules"),
    path.resolve(process.cwd(), "../../apps/main/node_modules"),
    resourcesPath ? path.join(resourcesPath, "node_modules") : undefined,
    resourcesPath ? path.join(resourcesPath, "app.asar.unpacked", "node_modules") : undefined,
  ];

  return candidates.filter(existsDir);
}

export function getExternalRuntimeEnv(): NodeJS.ProcessEnv {
  const nodeModuleRoots = resolveNodeModuleRoots();
  return {
    ...process.env,
    FLAZZ_RUNTIME_HOME: getFlazzRuntimeHome(),
    FLAZZ_SKILL_ROOT: resolveSkillResourceRoot(),
    ...(nodeModuleRoots.length
      ? {
          FLAZZ_NODE_MODULES: nodeModuleRoots[0],
          NODE_PATH: mergePathList(process.env.NODE_PATH, nodeModuleRoots),
        }
      : {}),
  };
}

export function getExternalRuntimePrompt(): string {
  const nodeModuleRoots = resolveNodeModuleRoots();

  return [
    "## Flazz External Runtimes",
    `- Runtime/cache home: \`${getFlazzRuntimeHome()}\` exposed as \`FLAZZ_RUNTIME_HOME\`.`,
    `- Skill resources: \`${resolveSkillResourceRoot()}\` exposed as \`FLAZZ_SKILL_ROOT\`.`,
    nodeModuleRoots.length
      ? `- App Node dependency roots detected: \`${nodeModuleRoots.join(path.delimiter)}\` exposed through \`NODE_PATH\`; first root exposed as \`FLAZZ_NODE_MODULES\`.`
      : "- App Node dependency roots: not found. Do not install npm packages into the user's workspace; report this as an app packaging/runtime dependency issue.",
    "- Node packages required by built-in skills, such as `pptxgenjs`, are app dependencies. Do not run `npm install`, `pnpm add`, `yarn add`, or `npm install -g` in the user's workspace for built-in skill dependencies.",
    "- If a built-in Python workflow is missing Python or required Python packages, report it as a runtime prerequisite or packaging issue. Do not run `winget install`, `pip install`, or other package installers from the built-in skill flow.",
  ].join("\n");
}
