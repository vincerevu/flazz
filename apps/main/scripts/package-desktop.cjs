const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { build, Platform, Arch } = require('electron-builder');

const repoRoot = path.resolve(__dirname, '../../..');
const mainRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(mainRoot, '.package');
const appStageRoot = path.join(packageRoot, 'app');
const releaseRoot = path.join(repoRoot, 'release');
const projectHomepage = 'https://github.com/vincerevu/flazz';
const packageAuthor = {
  name: 'Flazzlabs',
  email: 'vincerevu@users.noreply.github.com',
};
const linuxMaintainer = `${packageAuthor.name} <${packageAuthor.email}>`;

function getTargetArch() {
  switch (process.arch) {
    case 'x64':
      return Arch.x64;
    case 'arm64':
      return Arch.arm64;
    default:
      throw new Error(`Unsupported architecture for packaging: ${process.arch}`);
  }
}

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
    author: packageAuthor,
    description: pkg.description,
    homepage: projectHomepage,
    repository: {
      type: 'git',
      url: `${projectHomepage}.git`,
    },
    main: 'dist/main.cjs',
  };

  fs.writeFileSync(
    path.join(appStageRoot, 'package.json'),
    JSON.stringify(minimalPackageJson, null, 2),
  );

  const stagedMainDir = path.join(appStageRoot, 'dist');
  fs.mkdirSync(stagedMainDir, { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'dist', 'main.cjs'), path.join(stagedMainDir, 'main.cjs'));

  const stagedNativeDir = path.join(appStageRoot, 'build', 'Release');
  fs.mkdirSync(stagedNativeDir, { recursive: true });
  fs.copyFileSync(
    path.join(mainRoot, 'build', 'Release', 'better_sqlite3.node'),
    path.join(stagedNativeDir, 'better_sqlite3.node'),
  );

  fs.cpSync(path.join(repoRoot, 'apps', 'preload', 'dist'), path.join(appStageRoot, 'preload', 'dist'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'apps', 'renderer', 'dist'), path.join(appStageRoot, 'renderer', 'dist'), { recursive: true });
}

function buildTarget() {
  const arch = getTargetArch();

  switch (process.platform) {
    case 'win32':
      return Platform.WINDOWS.createTarget(['nsis', 'zip'], arch);
    case 'darwin':
      return Platform.MAC.createTarget(['dmg', 'zip'], arch);
    case 'linux':
      return Platform.LINUX.createTarget(['deb', 'rpm', 'zip'], arch);
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
    publish: 'never',
    config: {
      appId: 'com.flazz.app',
      productName: 'Flazz',
      artifactName: 'Flazz-${os}-${arch}.${ext}',
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
      electronUpdaterCompatibility: '>=2.16',
      publish: [
        {
          provider: 'github',
          owner: 'vincerevu',
          repo: 'flazz',
          releaseType: 'release',
        },
      ],
      dmg: {
        sign: false,
      },
      win: {
        icon: path.join(repoRoot, 'assets', 'icon.ico'),
        target: ['nsis', 'zip'],
        artifactName: 'Flazz-win32-${arch}.${ext}',
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        artifactName: 'FlazzSetup-${arch}.${ext}',
      },
      linux: {
        icon: path.join(repoRoot, 'assets', 'icons', 'png'),
        category: 'Office',
        synopsis: pkg.description,
        maintainer: linuxMaintainer,
        target: ['deb', 'rpm', 'zip'],
        artifactName: 'Flazz-linux-${arch}.${ext}',
      },
      mac: {
        category: 'public.app-category.productivity',
        icon: path.join(repoRoot, 'assets', 'icon.icns'),
        target: ['dmg', 'zip'],
        artifactName: 'Flazz-darwin-${arch}.${ext}',
      },
    },
  });

  console.log(`Artifacts written to ${releaseRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
