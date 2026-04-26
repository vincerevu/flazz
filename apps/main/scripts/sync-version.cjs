const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const sourceVersion = process.env.RELEASE_VERSION || process.env.GITHUB_REF_NAME || pkg.version;
const normalizedVersion = sourceVersion.startsWith('v') ? sourceVersion.slice(1) : sourceVersion;

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
  throw new Error(`Invalid release version: ${sourceVersion}`);
}

pkg.version = normalizedVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Synced apps/main/package.json version to ${normalizedVersion}`);
