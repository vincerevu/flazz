const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const packager = require('@electron/packager');
const { createWindowsInstaller } = require('electron-winstaller');

const repoRoot = path.resolve(__dirname, '../../..');
const mainRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(mainRoot, '.package');
const appStageRoot = path.join(packageRoot, 'app');
const releaseRoot = path.join(repoRoot, 'release');
const releaseAppPath = path.join(releaseRoot, 'Flazz-win32-x64');
const installerRoot = path.join(releaseRoot, 'installer');

function run(command, cwd) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureCleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

async function removeWithRetries(targetPath) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!error || (error.code !== 'EBUSY' && error.code !== 'EPERM')) {
        throw error;
      }

      try {
        execSync('taskkill /IM Flazz.exe /F', { stdio: 'ignore' });
      } catch {}

      await sleep(800 * (attempt + 1));
    }
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('package-win.cjs currently supports Windows packaging only.');
  }

  const pkg = require(path.join(mainRoot, 'package.json'));
  const electronVersion = pkg.devDependencies?.electron?.replace(/^[^\d]*/, '');
  if (!electronVersion) {
    throw new Error('Unable to determine Electron version from apps/main/package.json');
  }

  console.log('Cleaning staging and release directories...');
  ensureCleanDir(packageRoot);
  await removeWithRetries(releaseAppPath);
  await removeWithRetries(installerRoot);
  fs.mkdirSync(appStageRoot, { recursive: true });
  fs.mkdirSync(releaseRoot, { recursive: true });

  console.log('Building shared...');
  run('pnpm run build', path.join(repoRoot, 'packages', 'shared'));

  console.log('Building core...');
  run('pnpm run build', path.join(repoRoot, 'packages', 'core'));

  console.log('Building renderer...');
  run('pnpm run build', path.join(repoRoot, 'apps', 'renderer'));

  console.log('Building preload...');
  run('pnpm run build', path.join(repoRoot, 'apps', 'preload'));

  console.log('Building main (tsc)...');
  run('pnpm run build:tsc', mainRoot);

  console.log('Bundling main process...');
  run('node bundle.mjs', mainRoot);

  console.log('Staging packaged app files...');
  const minimalPackageJson = {
    name: 'flazz',
    productName: 'Flazz',
    version: pkg.version,
    author: 'Flazzlabs',
    main: 'dist/main.cjs',
  };
  fs.writeFileSync(path.join(appStageRoot, 'package.json'), JSON.stringify(minimalPackageJson, null, 2));

  const stagedMainDir = path.join(appStageRoot, 'dist');
  fs.mkdirSync(stagedMainDir, { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'dist', 'main.cjs'), path.join(stagedMainDir, 'main.cjs'));

  fs.cpSync(path.join(repoRoot, 'apps', 'preload', 'dist'), path.join(appStageRoot, 'preload', 'dist'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'apps', 'renderer', 'dist'), path.join(appStageRoot, 'renderer', 'dist'), { recursive: true });

  console.log('Packaging Windows executable...');
  const outputPaths = await packager({
    dir: appStageRoot,
    out: releaseRoot,
    platform: 'win32',
    arch: 'x64',
    electronVersion,
    overwrite: true,
    asar: true,
    executableName: 'Flazz',
    appBundleId: 'com.flazz.app',
    appCopyright: 'Flazzlabs',
    icon: path.join(repoRoot, 'assets', 'icon'),
    extraResource: [
      path.join(repoRoot, 'packages', 'core', 'src', 'application', 'assistant', 'skills'),
    ],
    ignore: [/node_modules/],
  });

  console.log('Packaged output:');
  for (const outputPath of outputPaths) {
    console.log(`- ${outputPath}`);
  }

  console.log('Creating Windows installer...');
  fs.mkdirSync(installerRoot, { recursive: true });
  await createWindowsInstaller({
    appDirectory: releaseAppPath,
    outputDirectory: installerRoot,
    authors: 'Flazzlabs',
    exe: 'Flazz.exe',
    title: 'Flazz',
    name: 'flazz',
    description: pkg.description,
    version: pkg.version,
    setupExe: 'FlazzSetup.exe',
    noMsi: true,
    setupIcon: path.join(repoRoot, 'assets', 'icon.ico'),
    iconUrl: 'https://example.com/flazz/icon.ico',
  });
  console.log(`Installer output: ${path.join(installerRoot, 'FlazzSetup.exe')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
