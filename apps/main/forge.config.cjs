// Electron Forge config file
// NOTE: Must be .cjs (CommonJS) because package.json has "type": "module"
// Forge loads configs with require(), which fails on ESM files

const path = require('path');
const pkg = require('./package.json');
const { createPackage } = require('@electron/asar');

const hasAppleNotarizationSecrets =
    Boolean(process.env.APPLE_ID) &&
    Boolean(process.env.APPLE_PASSWORD) &&
    Boolean(process.env.APPLE_TEAM_ID);

const packagerConfig = {
    executableName: 'Flazz',
    icon: './icons/icon',  // .icns extension added automatically
    appBundleId: 'com.flazz.app',
    appCategoryType: 'public.app-category.productivity',
    prebuiltAsar: path.join(__dirname, '.package', 'app.asar'),
    // The app is fully staged into a prebuilt ASAR during generateAssets.
    // Leave pnpm workspace node_modules alone; Forge's prune step tries to
    // walk @flazz/core symlink deps and fails on workspace-only packages.
    prune: false,
};

if (hasAppleNotarizationSecrets) {
    packagerConfig.osxSign = {
        batchCodesignCalls: true,
    };
    packagerConfig.osxNotarize = {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
    };
}

module.exports = {
    outDir: path.resolve(__dirname, '../../release'),
    packagerConfig,
    makers: [
        {
            name: '@electron-forge/maker-dmg',
            config: (arch) => ({
                format: 'ULFO',
                name: `Flazz-darwin-${arch}-${pkg.version}`,  // Architecture-specific name to avoid conflicts
            })
        },
        {
            name: '@electron-forge/maker-squirrel',
            config: (arch) => ({
                authors: 'Flazzlabs',
                description: 'AI coworker with memory',
                name: `Flazz-win32-${arch}`,
                setupExe: `Flazz-win32-${arch}-${pkg.version}-setup.exe`,
            })
        },
        {
            name: '@electron-forge/maker-deb',
            config: (arch) => ({
                options: {
                    name: `Flazz-linux`,
                    bin: "Flazz",
                    description: 'AI coworker with memory',
                    maintainer: 'Flazzlabs',
                    homepage: 'https://Flazzlabs.com'
                }
            })
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {
                options: {
                    name: `Flazz-linux`,
                    bin: "Flazz",
                    description: 'AI coworker with memory',
                    homepage: 'https://Flazzlabs.com'
                }
            }
        },
        {
            name: '@electron-forge/maker-zip',
            platform: ["darwin", "win32", "linux"],
        }
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'vincerevu',
                    name: 'flazz'
                },
                prerelease: true
            }
        }
    ],
    hooks: {
        // Hook signature: (forgeConfig, platform, arch)
        // Note: Console output only shows if DEBUG or CI env vars are set
        generateAssets: async (forgeConfig, platform, arch) => {
            const { execSync } = require('child_process');
            const fs = require('fs');

            const packageDir = path.join(__dirname, '.package');
            const appDir = path.join(packageDir, 'app');
            const asarPath = path.join(packageDir, 'app.asar');

            // Clean staging directory (ensures fresh build every time)
            console.log('Cleaning staging directory...');
            if (fs.existsSync(packageDir)) {
                fs.rmSync(packageDir, { recursive: true });
            }
            fs.mkdirSync(packageDir, { recursive: true });
            fs.mkdirSync(appDir, { recursive: true });

            // Build order matters! Dependencies must be built before dependents:
            // shared → core → (renderer, preload, main)

            // Build shared (TypeScript compilation) - no dependencies
            console.log('Building shared...');
            execSync('pnpm run build', {
                cwd: path.join(__dirname, '../../packages/shared'),
                stdio: 'inherit'
            });

            // Build core (TypeScript compilation) - depends on shared
            console.log('Building core...');
            execSync('pnpm run build', {
                cwd: path.join(__dirname, '../../packages/core'),
                stdio: 'inherit'
            });

            // Build renderer (Vite build) - depends on shared
            console.log('Building renderer...');
            execSync('pnpm run build', {
                cwd: path.join(__dirname, '../renderer'),
                stdio: 'inherit'
            });

            // Build preload (TypeScript compilation) - depends on shared
            console.log('Building preload...');
            execSync('pnpm run build', {
                cwd: path.join(__dirname, '../preload'),
                stdio: 'inherit'
            });

            // Build main (TypeScript compilation) - depends on core, shared
            console.log('Building main (tsc)...');
            execSync('pnpm run build:tsc', {
                cwd: __dirname,
                stdio: 'inherit'
            });

            // Bundle main process with esbuild (inlines all dependencies)
            console.log('Bundling main process...');
            execSync('node bundle.mjs', {
                cwd: __dirname,
                stdio: 'inherit'
            });

            const minimalPackageJson = {
                name: 'flazz',
                productName: 'Flazz',
                version: pkg.version,
                author: 'Flazzlabs',
                main: 'dist/main.cjs',
            };
            fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(minimalPackageJson, null, 2));

            // Copy bundled main entry into staging app
            console.log('Copying main bundle...');
            const mainDest = path.join(appDir, 'dist');
            fs.mkdirSync(mainDest, { recursive: true });
            fs.copyFileSync(path.join(packageDir, 'dist', 'main.cjs'), path.join(mainDest, 'main.cjs'));

            // Copy preload dist into staging directory
            console.log('Copying preload...');
            const preloadSrc = path.join(__dirname, '../preload/dist');
            const preloadDest = path.join(appDir, 'preload/dist');
            fs.mkdirSync(preloadDest, { recursive: true });
            fs.cpSync(preloadSrc, preloadDest, { recursive: true });

            // Copy renderer dist into staging directory
            console.log('Copying renderer...');
            const rendererSrc = path.join(__dirname, '../renderer/dist');
            const rendererDest = path.join(appDir, 'renderer/dist');
            fs.mkdirSync(rendererDest, { recursive: true });
            fs.cpSync(rendererSrc, rendererDest, { recursive: true });

            console.log('Creating prebuilt asar...');
            await createPackage(appDir, asarPath);

            console.log('✅ Prebuilt app.asar ready in .package/');
        },
    }
};
