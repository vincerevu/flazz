/**
 * Bundles the compiled main process into a single JavaScript file.
 * 
 * Why we bundle:
 * - pnpm uses symlinks for workspace packages (@flazz/core, @flazz/shared)
 * - Desktop packagers can stumble on these workspace symlinks while collecting runtime deps
 * - Bundling inlines all dependencies into a single file, eliminating node_modules
 * 
 * This script is called by the desktop packaging pipeline before packaging.
 */

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const mainRoot = process.cwd();
const repoRoot = path.resolve(mainRoot, '..', '..');

// In CommonJS, import.meta.url doesn't exist. We need to polyfill it.
// The banner defines __import_meta_url at the top of the bundle,
// and we use define to replace all import.meta.url references with it.
const cjsBanner = `var __import_meta_url = require('url').pathToFileURL(__filename).href;`;

function runNode(args, cwd = repoRoot) {
  execFileSync(process.execPath, args, {
    cwd,
    stdio: 'inherit',
  });
}

function runCommand(command, args, cwd = repoRoot) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

async function fileHash(filePath) {
  const bytes = await fs.readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function copyNativeBinding(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    const [sourceStat, targetStat] = await Promise.all([
      fs.stat(source),
      fs.stat(target).catch(() => null),
    ]);
    if (
      targetStat
      && sourceStat.size === targetStat.size
      && await fileHash(source) === await fileHash(target)
    ) {
      return;
    }
  } catch {
    // Fall through to copy; copyFile will report the actionable error if it still fails.
  }
  await fs.copyFile(source, target);
}

await esbuild.build({
  entryPoints: ['./dist/main.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: './.package/dist/main.cjs',
  external: ['electron'],  // Provided by Electron runtime
  // Use CommonJS format - many dependencies use require() which doesn't work
  // well with esbuild's ESM shim. CJS handles dynamic requires natively.
  format: 'cjs',
  // Inject the polyfill variable at the top
  banner: { js: cjsBanner },
  // Replace import.meta.url directly with our polyfill variable
  define: {
    'import.meta.url': '__import_meta_url',
  },
});

const electronVersion = require(path.join(repoRoot, 'node_modules', 'electron', 'package.json')).version;
const electronRebuildCli = path.join(repoRoot, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js');

runNode([
  electronRebuildCli,
  '-f',
  '-w',
  'better-sqlite3',
  '-v',
  electronVersion,
  '-m',
  repoRoot,
]);

const betterSqliteBinding = require.resolve('better-sqlite3/build/Release/better_sqlite3.node');
const nativeTargets = [
  path.resolve('build/Release/better_sqlite3.node'),
  path.resolve('.package/build/Release/better_sqlite3.node'),
];

await Promise.all(nativeTargets.map(async (target) => {
  await copyNativeBinding(betterSqliteBinding, target);
}));

runCommand('npm', ['rebuild', 'better-sqlite3']);

console.log('✅ Main process bundled to .package/dist-bundle/main.js');
