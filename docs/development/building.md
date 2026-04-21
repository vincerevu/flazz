# Building and Releasing Flazz

This guide covers building Flazz for distribution and creating releases for Windows, macOS, and Linux.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build Configuration](#build-configuration)
- [Building for Development](#building-for-development)
- [Building for Distribution](#building-for-distribution)
- [Platform-Specific Instructions](#platform-specific-instructions)
- [Automated Releases](#automated-releases)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### All Platforms

- Node.js 18+ and pnpm 8+
- Git
- Project dependencies installed (`pnpm install`)

### Windows

- Windows 10 or later
- No additional tools required (Squirrel.Windows is used)

### macOS

- macOS 10.15 (Catalina) or later
- Xcode Command Line Tools: `xcode-select --install`
- For code signing (optional):
  - Apple Developer account
  - Valid Developer ID certificate

### Linux

- Ubuntu 20.04 or equivalent
- For building deb packages: `dpkg`, `fakeroot`
- For building rpm packages: `rpm-build`

## Build Configuration

### Electron Forge Configuration

Build configuration is in `apps/main/forge.config.js`:

```javascript
export default {
  packagerConfig: {
    name: 'Flazz',
    executableName: 'flazz',
    icon: '../../../assets/icon',
    appBundleId: 'com.flazz.app',
    appCategoryType: 'public.app-category.productivity',
    // ... more config
  },
  makers: [
    // Windows: Squirrel installer
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Flazz',
        setupIcon: '../../../assets/icon.ico',
      },
    },
    // macOS: DMG installer
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: '../../../assets/icon.icns',
        format: 'ULFO',
      },
    },
    // Linux: deb and rpm packages
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: '../../../assets/icon.png',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: '../../../assets/icon.png',
        },
      },
    },
  ],
};
```

### Package.json Configuration

Key fields in `apps/main/package.json`:

```json
{
  "name": "@flazz/main",
  "version": "0.1.0",
  "main": "dist/main.js",
  "type": "module",
  "scripts": {
    "package": "electron-forge package",
    "make": "electron-forge make"
  }
}
```

## Building for Development

### Quick Build

```bash
# Build all packages
pnpm run build

# Or build individually
pnpm --filter @flazz/renderer build
pnpm --filter @flazz/main build
```

### Development Mode with Hot Reload

```bash
# Start development server
pnpm run dev
```

This runs the app with:
- Hot reload for renderer changes
- Automatic restart for main process changes
- Source maps for debugging

## Building for Distribution

### Complete Build Process

```bash
# 1. Clean previous builds
pnpm run clean

# 2. Install dependencies
pnpm install

# 3. Build all packages
pnpm run build

# 4. Package the application
pnpm --filter @flazz/main package

# 5. Create distributable installer
pnpm --filter @flazz/main make
```

### Output Locations

After running `make`, installers will be in:

```
apps/main/out/make/
├── squirrel.windows/
│   └── x64/
│       └── FlazzSetup.exe          # Windows installer
├── dmg/
│   └── x64/
│       └── Flazz-0.1.0.dmg         # macOS installer
├── deb/
│   └── x64/
│       └── flazz_0.1.0_amd64.deb   # Debian package
└── rpm/
    └── x64/
        └── flazz-0.1.0.x86_64.rpm  # RPM package
```

## Platform-Specific Instructions

### Windows

#### Building on Windows

```powershell
# PowerShell script
.\scripts\build-windows.ps1
```

Or manually:

```powershell
# Set node-linker
pnpm config set node-linker hoisted

# Install and build
pnpm install
pnpm run build

# Create installer
cd apps/main
pnpm run make
```

#### Output

- `FlazzSetup.exe` - Squirrel installer
- Installs to `%LOCALAPPDATA%\Flazz`
- Creates Start Menu shortcuts
- Supports auto-updates

#### Code Signing (Optional)

For production releases, sign the executable:

```powershell
# Using signtool (Windows SDK)
signtool sign /f certificate.pfx /p password /tr http://timestamp.digicert.com /td sha256 /fd sha256 FlazzSetup.exe
```

### macOS

#### Building on macOS

```bash
# Bash script
./scripts/build-macos.sh
```

Or manually:

```bash
# Install and build
pnpm install
pnpm run build

# Create DMG
cd apps/main
pnpm run make
```

#### Output

- `Flazz-0.1.0.dmg` - Disk image installer
- Drag-and-drop installation
- Installs to `/Applications`

#### Code Signing (Optional)

For distribution outside the App Store:

```bash
# Sign the app
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" --options runtime Flazz.app

# Notarize with Apple
xcrun notarytool submit Flazz-0.1.0.dmg --apple-id your@email.com --password app-specific-password --team-id TEAMID

# Staple the notarization
xcrun stapler staple Flazz-0.1.0.dmg
```

#### Entitlements

Entitlements are configured in `apps/main/entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
</dict>
</plist>
```

### Linux

#### Building on Linux

```bash
# Install build dependencies
sudo apt-get install -y rpm fakeroot dpkg

# Build
pnpm install
pnpm run build

# Create packages
cd apps/main
pnpm run make
```

#### Output

- `flazz_0.1.0_amd64.deb` - Debian/Ubuntu package
- `flazz-0.1.0.x86_64.rpm` - Fedora/RHEL package

#### Installation

```bash
# Debian/Ubuntu
sudo dpkg -i flazz_0.1.0_amd64.deb
sudo apt-get install -f  # Fix dependencies

# Fedora/RHEL
sudo rpm -i flazz-0.1.0.x86_64.rpm
```

## Automated Releases

### GitHub Actions Workflow

Automated builds are configured in `.github/workflows/release.yml`.

#### Trigger Release

```bash
# Create and push a version tag
git tag v0.1.0
git push origin v0.1.0
```

Or manually trigger from GitHub Actions UI.

#### Workflow Steps

1. **Checkout code** - Clone repository
2. **Setup Node.js** - Install Node.js 18
3. **Setup pnpm** - Install pnpm with caching
4. **Install dependencies** - Run `pnpm install`
5. **Build packages** - Build renderer, main, and core
6. **Package application** - Create platform-specific packages
7. **Create release** - Upload installers to GitHub Releases

#### Workflow Configuration

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:

jobs:
  release:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm run build
      
      - name: Package
        run: pnpm --filter @flazz/main make
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-installer
          path: apps/main/out/make/**/*
```

### Release Checklist

Before creating a release:

- [ ] Update version in `package.json` files
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Test build on all platforms
- [ ] Run full test suite
- [ ] Update documentation if needed
- [ ] Create git tag with version number
- [ ] Push tag to trigger release workflow
- [ ] Verify installers work on each platform
- [ ] Update release notes on GitHub

## Troubleshooting

### Build Fails with "node-linker" Error

**Issue**: pnpm not configured correctly

**Solution**:
```bash
pnpm config set node-linker hoisted
# or add to .npmrc
echo "node-linker=hoisted" > .npmrc
```

### "module is not defined" Error

**Issue**: CommonJS syntax in ES module

**Solution**: Convert to ES module syntax
```javascript
// Bad (CommonJS)
module.exports = { ... }

// Good (ES module)
export default { ... }
```

### Icons Not Found

**Issue**: Icon files missing or wrong path

**Solution**:
```bash
# Generate icons from source
node scripts/generate-icons.js

# Or manually place icons in assets/
# - assets/icon.ico (Windows)
# - assets/icon.icns (macOS)
# - assets/icon.png (Linux)
```

### Package Size Too Large

**Issue**: Unnecessary files included in package

**Solution**: Add to `.gitignore` and Electron Forge ignore patterns:
```javascript
// forge.config.js
packagerConfig: {
  ignore: [
    /^\/\.git/,
    /^\/node_modules\/\.cache/,
    /^\/\.local/,
    /^\/docs/,
  ],
}
```

### macOS Gatekeeper Blocks App

**Issue**: App not signed or notarized

**Solution**: Either:
1. Sign and notarize the app (for distribution)
2. Right-click app → Open (for testing)
3. System Preferences → Security → Allow app

### Windows SmartScreen Warning

**Issue**: App not signed with trusted certificate

**Solution**: Either:
1. Sign with EV code signing certificate (for distribution)
2. Click "More info" → "Run anyway" (for testing)

### Linux Missing Dependencies

**Issue**: Required libraries not installed

**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libdrm2 libgbm1 libxcb-dri3-0

# Fedora/RHEL
sudo dnf install -y gtk3 libnotify nss libXScrnSaver libXtst xdg-utils at-spi2-core libdrm mesa-libgbm libxcb
```

## Further Reading

- [Development Setup](setup.md)
- [Icon Generation Guide](../deployment/icons.md)
- [Electron Forge Documentation](https://www.electronforge.io/)
- [Electron Builder vs Forge](https://www.electronforge.io/core-concepts/why-electron-forge)
