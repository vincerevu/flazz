# Icon Generation Guide

This guide explains how to generate all required icon formats for Flazz.

## Required Formats

- **Windows**: `icon.ico` (multi-size: 256, 128, 64, 48, 32, 16)
- **macOS**: `icon.icns` (multi-size: 1024@2x, 512@2x, 512, 256@2x, 256, 128@2x, 128, 32@2x, 32, 16@2x, 16)
- **Linux**: `icon.png` (512x512 or 1024x1024)

## Quick Start (Recommended)

### Option 1: Online Tools (Easiest)

1. **Prepare source icon**
   - Use `assets/icon.png` (should be 1024x1024 for best quality)
   - Ensure it's a square PNG with transparent background

2. **Generate Windows .ico**
   - Go to https://convertico.com/
   - Upload `assets/icon.png`
   - Select sizes: 256, 128, 64, 48, 32, 16
   - Download as `icon.ico`
   - Save to `assets/icon.ico`

3. **Generate macOS .icns**
   - Go to https://cloudconvert.com/png-to-icns
   - Upload `assets/icon.png`
   - Download as `icon.icns`
   - Save to `assets/icon.icns`

4. **Linux** - Already done! (`assets/icon.png`)

### Option 2: Automated Script

```bash
# Install electron-icon-builder globally
npm install -g electron-icon-builder

# Run generation script
node scripts/generate-icons.js
```

This will automatically generate:
- `assets/icon.ico` (Windows)
- `assets/icon.icns` (macOS)

### Option 3: Manual with ImageMagick

#### Install ImageMagick

**Windows:**
```bash
choco install imagemagick
```

**macOS:**
```bash
brew install imagemagick
```

**Linux:**
```bash
sudo apt install imagemagick  # Ubuntu/Debian
sudo dnf install imagemagick  # Fedora
```

#### Generate Windows .ico

```bash
cd assets
magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

#### Generate macOS .icns

```bash
cd assets

# Create iconset directory
mkdir icon.iconset

# Generate all required sizes
magick icon.png -resize 16x16     icon.iconset/icon_16x16.png
magick icon.png -resize 32x32     icon.iconset/icon_16x16@2x.png
magick icon.png -resize 32x32     icon.iconset/icon_32x32.png
magick icon.png -resize 64x64     icon.iconset/icon_32x32@2x.png
magick icon.png -resize 128x128   icon.iconset/icon_128x128.png
magick icon.png -resize 256x256   icon.iconset/icon_128x128@2x.png
magick icon.png -resize 256x256   icon.iconset/icon_256x256.png
magick icon.png -resize 512x512   icon.iconset/icon_256x256@2x.png
magick icon.png -resize 512x512   icon.iconset/icon_512x512.png
magick icon.png -resize 1024x1024 icon.iconset/icon_512x512@2x.png

# Convert to .icns (macOS only)
iconutil -c icns icon.iconset

# Clean up
rm -rf icon.iconset
```

## Verification

After generation, verify you have all files:

```bash
node scripts/generate-icons.js
```

Expected output:
```
📁 Expected file structure:

  assets/
  ├── icon.png   ✓ (source)
  ├── icon.ico   ✓ (needed for Windows)
  └── icon.icns  ✓ (needed for macOS)
```

## Icon Design Guidelines

### Size Requirements
- **Minimum**: 512x512 pixels
- **Recommended**: 1024x1024 pixels
- **Format**: PNG with transparency

### Design Tips
1. **Keep it simple** - Icons should be recognizable at small sizes (16x16)
2. **Use transparency** - Transparent background works on all platforms
3. **Avoid text** - Text becomes unreadable at small sizes
4. **Test at multiple sizes** - Check how it looks at 16x16, 32x32, 64x64
5. **High contrast** - Ensure icon stands out on both light and dark backgrounds

### Platform-Specific Considerations

**Windows:**
- Supports transparency
- Will be displayed on taskbar, start menu, file explorer
- Test on both light and dark themes

**macOS:**
- Supports transparency
- Will be displayed in dock, finder, launchpad
- macOS applies subtle shadow automatically
- Test on both light and dark mode

**Linux:**
- Supports transparency
- Will be displayed in application menu, dock/panel
- Different desktop environments may render differently

## Troubleshooting

### Icon not showing in built app

1. **Clear Electron cache:**
   ```bash
   # Windows
   rmdir /s /q %APPDATA%\Flazz

   # macOS
   rm -rf ~/Library/Application\ Support/Flazz

   # Linux
   rm -rf ~/.config/Flazz
   ```

2. **Rebuild app:**
   ```bash
   cd apps/main
   rm -rf out
   pnpm run make
   ```

### Wrong icon size/quality

- Ensure source `icon.png` is at least 1024x1024
- Regenerate icons from high-quality source
- Check that .ico includes all sizes (256, 128, 64, 48, 32, 16)

### macOS icon looks blurry

- Ensure .icns includes @2x retina sizes
- Source should be 1024x1024 minimum
- Use `iconutil` on macOS for best results

### Windows icon has white background

- Ensure source PNG has transparency
- Some converters don't preserve transparency - try different tool
- Use ImageMagick for guaranteed transparency support

## Testing Icons

### Test in Development
```bash
pnpm run dev
```
Check icon in:
- Window title bar
- Taskbar/dock
- Alt+Tab switcher

### Test in Production Build
```bash
cd apps/main
pnpm run make
```

Install the built app and check icon in:
- Application shortcut
- Start menu / Launchpad
- Running application
- File associations (if applicable)

## Resources

- [Electron Icon Requirements](https://www.electronjs.org/docs/latest/tutorial/application-distribution#platform-specific-considerations)
- [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)
- [ImageMagick Documentation](https://imagemagick.org/index.php)
- [macOS Icon Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Windows Icon Guidelines](https://docs.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-design)
