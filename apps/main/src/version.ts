import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const rootPackageJsonPath = path.join(repoRoot, 'package.json');

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function readRootPackageVersion(): string | null {
  try {
    const raw = fs.readFileSync(rootPackageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function readLatestGitTagVersion(): string | null {
  try {
    const result = execSync('git describe --tags --abbrev=0', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();

    return result ? normalizeVersion(result) : null;
  } catch {
    return null;
  }
}

export function getCurrentAppVersion(): string {
  if (app.isPackaged) {
    return app.getVersion();
  }

  return readLatestGitTagVersion() ?? readRootPackageVersion() ?? app.getVersion();
}
