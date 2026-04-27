const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { build, Platform, Arch } = require('electron-builder');

const repoRoot = path.resolve(__dirname, '../../..');
const mainRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(mainRoot, '.package');
const appStageRoot = path.join(packageRoot, 'app');
const releaseRoot = path.join(repoRoot, 'release');

function run(command, cwd) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
  });
}

function ensureCleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function stageApp(pkg) {
  console.log('Cleaning staging and release directories...');
  ensureCleanDir(packageRoot);
  ensureCleanDir(releaseRoot);
  fs.mkdirSync(appStageRoot, { recursive: true });

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
    description: pkg.description,
    main: 'dist/main.cjs',
  };

  fs.writeFileSync(
    path.join(appStageRoot, 'package.json'),
    JSON.stringify(minimalPackageJson, null, 2),
  );

  const stagedMainDir = path.join(appStageRoot, 'dist');
  fs.mkdirSync(stagedMainDir, { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'dist', 'main.cjs'), path.join(stagedMainDir, 'main.cjs'));

  fs.cpSync(path.join(repoRoot, 'apps', 'preload', 'dist'), path.join(appStageRoot, 'preload', 'dist'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'apps', 'renderer', 'dist'), path.join(appStageRoot, 'renderer', 'dist'), { recursive: true });
}

function buildTarget() {
  switch (process.platform) {
    case 'win32':
      return Platform.WINDOWS.createTarget(['nsis', 'zip'], Arch.x64);
    case 'darwin':
      return Platform.MAC.createTarget(['dmg', 'zip'], Arch.arm64);
    case 'linux':
      return Platform.LINUX.createTarget(['deb', 'rpm', 'zip'], Arch.x64);
    default:
      throw new Error(`Unsupported platform for packaging: ${process.platform}`);
  }
}

async function main() {
  const pkg = require(path.join(mainRoot, 'package.json'));
  const electronVersion = pkg.devDependencies?.electron?.replace(/^[^\d]*/, '');

  if (!electronVersion) {
    throw new Error('Unable to determine Electron version from apps/main/package.json');
  }

  stageApp(pkg);

  console.log(`Packaging ${process.platform} with electron-builder...`);

  await build({
    targets: buildTarget(),
    projectDir: appStageRoot,
    config: {
      appId: 'com.flazz.app',
      productName: 'Flazz',
      electronVersion,
      directories: {
        output: releaseRoot,
        buildResources: path.join(repoRoot, 'assets'),
      },
      files: ['**/*'],
      extraResources: [
        {
          from: path.join(repoRoot, 'packages', 'core', 'src', 'application', 'assistant', 'skills'),
          to: 'skills',
        },
      ],
      asar: true,
      npmRebuild: false,
      buildDependenciesFromSource: false,
      publish: null,
      dmg: {
        sign: false,
      },
      win: {
        icon: path.join(repoRoot, 'assets', 'icon.ico'),
        target: ['nsis', 'zip'],
        artifactName: 'Flazz-win32-x64.${ext}',
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        artifactName: 'FlazzSetup.${ext}',
      },
      linux: {
        icon: path.join(repoRoot, 'assets', 'icons', 'png'),
        category: 'Office',
        synopsis: pkg.description,
        target: ['deb', 'rpm', 'zip'],
        artifactName: 'Flazz-linux-x64.${ext}',
      },
      mac: {
        category: 'public.app-category.productivity',
        icon: path.join(repoRoot, 'assets', 'icon.icns'),
        target: ['dmg', 'zip'],
        artifactName: 'Flazz-darwin-arm64.${ext}',
      },
    },
  });

  console.log(`Artifacts written to ${releaseRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
