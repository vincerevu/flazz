# Installation

This guide will help you install Flazz on your system.

## System Requirements

- Windows 10/11, macOS 10.15+, or Linux
- 4GB RAM minimum (8GB recommended)
- 500MB disk space
- Internet connection for AI providers

## Download

### Pre-built Binaries (Recommended)

Download the latest release for your platform:

**Windows**
- [FlazzSetup.exe](https://github.com/yourusername/flazz/releases/latest) - Installer
- [Flazz-win32-x64.zip](https://github.com/yourusername/flazz/releases/latest) - Portable

**macOS**
- [Flazz.dmg](https://github.com/yourusername/flazz/releases/latest) - Disk image
- [Flazz-darwin-x64.zip](https://github.com/yourusername/flazz/releases/latest) - Portable

**Linux**
- [flazz.deb](https://github.com/yourusername/flazz/releases/latest) - Debian/Ubuntu
- [flazz.rpm](https://github.com/yourusername/flazz/releases/latest) - Fedora/RHEL
- [Flazz-linux-x64.zip](https://github.com/yourusername/flazz/releases/latest) - Portable

## Installation Steps

### Windows

**Using Installer:**
1. Download `FlazzSetup.exe`
2. Run the installer
3. Follow the installation wizard
4. Launch Flazz from Start Menu

**Portable Version:**
1. Download `Flazz-win32-x64.zip`
2. Extract to your preferred location
3. Run `Flazz.exe`

**Note:** Windows may show a SmartScreen warning for unsigned apps. Click "More info" → "Run anyway"

### macOS

**Using DMG:**
1. Download `Flazz.dmg`
2. Open the DMG file
3. Drag Flazz to Applications folder
4. Launch from Applications

**First Launch:**
- Right-click Flazz → Open (to bypass Gatekeeper)
- Or: System Preferences → Security & Privacy → Open Anyway

**Portable Version:**
1. Download `Flazz-darwin-x64.zip`
2. Extract and run `Flazz.app`

### Linux

**Debian/Ubuntu:**
```bash
sudo dpkg -i flazz.deb
# Or
sudo apt install ./flazz.deb
```

**Fedora/RHEL:**
```bash
sudo rpm -i flazz.rpm
# Or
sudo dnf install flazz.rpm
```

**Portable Version:**
```bash
unzip Flazz-linux-x64.zip
cd Flazz-linux-x64
./flazz
```

## Build from Source

If you prefer to build from source:

```bash
# Clone repository
git clone https://github.com/yourusername/flazz.git
cd flazz

# Install dependencies
pnpm install

# Build
pnpm run deps
cd apps/renderer && pnpm run build && cd ../main
pnpm run build && pnpm run make
```

See [Building Guide](../development/building.md) for detailed instructions.

## Verify Installation

After installation, verify Flazz is working:

1. Launch Flazz
2. You should see the welcome screen
3. The app should be ready to configure

## Next Steps

- [Quick Start](./quick-start.md) - Get started in 5 minutes
- [Configuration](./configuration.md) - Set up API keys and preferences

## Troubleshooting

**App won't start:**
- Check system requirements
- Try running as administrator (Windows) or with sudo (Linux)
- Check antivirus isn't blocking the app

**Installation fails:**
- Ensure you have write permissions
- Free up disk space
- Try portable version instead

For more help, see [Troubleshooting Guide](../troubleshooting.md) or [open an issue](https://github.com/yourusername/flazz/issues).
