# Build and Release Guide

This guide explains how to build Flazz for multiple platforms and create releases.

## Prerequisites

- Node.js 18+
- pnpm
- Git

## Local Development Build

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run deps

# Start development server
pnpm run dev
```

## Building for Production

### Build for Current Platform

```bash
# Build dependencies
pnpm run deps

# Build renderer
cd apps/renderer && pnpm run build

# Build main
cd apps/main && pnpm run build

# Package the app
cd apps/main && pnpm run make
```

Output will be in `apps/main/out/make/`

### Platform-Specific Notes

#### Windows
- Output: `.exe` installer and `.zip` portable
- Location: `apps/main/out/make/squirrel.windows/`
- No code signing required (but recommended to avoid SmartScreen warnings)

#### macOS
- Output: `.dmg` installer and `.zip` portable
- Location: `apps/main/out/make/dmg/` and `apps/main/out/make/zip/`
- **Code signing required** for distribution (Apple Developer account needed)

#### Linux
- Output: `.deb`, `.rpm`, and `.zip`
- Location: `apps/main/out/make/deb/`, `apps/main/out/make/rpm/`, `apps/main/out/make/zip/`
- No code signing required

## Automated Release via GitHub Actions

### Setup

1. **Prepare Icons**
   - Place icons in `assets/` folder:
     - `icon.ico` - Windows (256x256 with multiple sizes)
     - `icon.icns` - macOS (512x512@2x and other sizes)
     - `icon.png` - Linux (512x512 or 1024x1024)

2. **Update Repository Settings**
   - Edit `apps/main/forge.config.js`
   - Change `yourusername` to your GitHub username
   - Update `iconUrl` to point to your repository

3. **Configure Secrets (Optional)**
   
   For macOS code signing, add these secrets in GitHub Settings → Secrets:
   - `APPLE_ID` - Your Apple ID email
   - `APPLE_PASSWORD` - App-specific password (not your Apple ID password)
   - `APPLE_TEAM_ID` - Your Apple Developer Team ID
   - `APPLE_IDENTITY` - Certificate identity (e.g., "Developer ID Application: Your Name")

### Creating a Release

1. **Update Version**
   ```bash
   # Update version in package.json
   npm version patch  # or minor, or major
   ```

2. **Create and Push Tag**
   ```bash
   git add .
   git commit -m "Release v1.0.0"
   git tag v1.0.0
   git push origin main --tags
   ```

3. **GitHub Actions Will Automatically:**
   - Build for Windows, macOS, and Linux
   - Create installers for each platform
   - Upload artifacts
   - Create a GitHub Release with all files

4. **Manual Trigger (Optional)**
   - Go to GitHub → Actions → Release Build
   - Click "Run workflow"
   - Select branch and run

### Release Workflow

The workflow (`.github/workflows/release.yml`) does:

1. **Build Windows** (on `windows-latest`)
   - Installs dependencies
   - Builds all packages
   - Creates `.exe` installer and `.zip` portable
   - Uploads artifacts

2. **Build macOS** (on `macos-latest`)
   - Installs dependencies
   - Builds all packages
   - Creates `.dmg` installer and `.zip` portable
   - (Optional) Code signs and notarizes if secrets are configured
   - Uploads artifacts

3. **Build Linux** (on `ubuntu-latest`)
   - Installs dependencies
   - Builds all packages
   - Creates `.deb`, `.rpm`, and `.zip`
   - Uploads artifacts

4. **Create Release**
   - Downloads all artifacts
   - Creates GitHub Release
   - Attaches all installers
   - Generates release notes

## Code Signing

### Windows

1. **Get a Code Signing Certificate**
   - Purchase from DigiCert, Sectigo, etc. (~$200-400/year)
   - Or use free certificate from SignPath.io (for open source)

2. **Configure in `forge.config.js`**
   ```javascript
   packagerConfig: {
     // ... other config
     windowsSign: {
       certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
       certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD
     }
   }
   ```

3. **Add Secrets to GitHub**
   - `WINDOWS_CERTIFICATE_FILE` - Base64 encoded .pfx file
   - `WINDOWS_CERTIFICATE_PASSWORD` - Certificate password

### macOS

1. **Get Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com

2. **Create Certificates**
   - Developer ID Application certificate
   - Developer ID Installer certificate

3. **Create App-Specific Password**
   - Go to https://appleid.apple.com
   - Sign in → Security → App-Specific Passwords
   - Generate new password

4. **Add Secrets to GitHub** (already documented above)

5. **Uncomment Code Signing Lines**
   - In `.github/workflows/release.yml`
   - Uncomment the `APPLE_*` environment variables

### Linux

No code signing required for Linux distributions.

## Troubleshooting

### Build Fails on GitHub Actions

1. **Check logs** in GitHub Actions tab
2. **Common issues:**
   - Missing dependencies: Update `pnpm install` step
   - Build errors: Test locally first with `pnpm run make`
   - Path issues: Ensure paths in workflow match your project structure

### macOS Build Fails

- **Without code signing:** Remove or comment out `osxSign` and `osxNotarize` in `forge.config.js`
- **With code signing:** Ensure all secrets are correctly set

### Windows SmartScreen Warning

- Users will see "Windows protected your PC" warning
- Solution: Get a code signing certificate
- Alternative: Users can click "More info" → "Run anyway"

### Linux Dependencies Missing

- Add required dependencies to `.deb` and `.rpm` config
- Example:
  ```javascript
  {
    name: '@electron-forge/maker-deb',
    config: {
      options: {
        depends: ['libgtk-3-0', 'libnotify4', 'libnss3']
      }
    }
  }
  ```

## Testing Builds Locally

### Test Windows Build (on Windows)
```bash
cd apps/main
pnpm run make
# Test the installer in out/make/squirrel.windows/
```

### Test macOS Build (on macOS)
```bash
cd apps/main
pnpm run make
# Test the .dmg in out/make/dmg/
```

### Test Linux Build (on Linux)
```bash
cd apps/main
pnpm run make
# Test .deb: sudo dpkg -i out/make/deb/x64/flazz_*.deb
# Test .rpm: sudo rpm -i out/make/rpm/x64/flazz-*.rpm
```

## Distribution

### GitHub Releases (Recommended)
- Automatic via GitHub Actions
- Users download from Releases page
- Supports auto-updates via `update-electron-app`

### Alternative Distribution
- **Homebrew (macOS):** Create a Homebrew Cask
- **Chocolatey (Windows):** Create a Chocolatey package
- **Snap (Linux):** Create a Snap package
- **Flatpak (Linux):** Create a Flatpak package

## Auto-Updates

Flazz uses `update-electron-app` for automatic updates:

```javascript
// In apps/main/src/main.ts
import { updateElectronApp } from 'update-electron-app';

updateElectronApp({
  repo: 'yourusername/flazz',
  updateInterval: '1 hour'
});
```

This checks GitHub Releases for new versions and prompts users to update.

## Version Numbering

Follow Semantic Versioning (semver):
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backwards compatible
- **Patch** (0.0.1): Bug fixes

```bash
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0
```

## Resources

- [Electron Forge Documentation](https://www.electronforge.io/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Apple Code Signing Guide](https://developer.apple.com/support/code-signing/)
- [Windows Code Signing Guide](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
