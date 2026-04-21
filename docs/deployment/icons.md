# Icon Generation Guide

This guide explains how to generate application icons for Flazz across all platforms.

## Table of Contents

- [Overview](#overview)
- [Icon Requirements](#icon-requirements)
- [Automated Generation](#automated-generation)
- [Manual Generation](#manual-generation)
- [Troubleshooting](#troubleshooting)

## Overview

Flazz requires platform-specific icon formats:

- **Windows**: `.ico` file with multiple sizes
- **macOS**: `.icns` file with multiple sizes
- **Linux**: `.png` file (typically 512x512)

The source icon should be a high-resolution PNG (at least 1024x1024) with transparency.

## Icon Requirements

### Source Icon

- **Format**: PNG with transparency
- **Size**: 1024x1024 pixels (minimum)
- **Location**: `assets/icon.png` or `apps/renderer/public/icon.png`
- **Design**: Simple, recognizable at small sizes

### Platform-Specific Formats

#### Windows (.ico)

Required sizes embedded in single file:
- 16x16
- 24x24
- 32x32
- 48x48
- 64x64
- 128x128
- 256x256

#### macOS (.icns)

Required sizes embedded in single file:
- 16x16
- 32x32
- 64x64
- 128x128
- 256x256
- 512x512
- 1024x1024

#### Linux (.png)

Single PNG file:
- 512x512 pixels (recommended)
- PNG with transparency

## Automated Generation

### Using the Generation Script

The easiest way to generate icons is using the provided script:

```bash
# Run from project root
node scripts/generate-icons.js
```

Or on Windows:

```powershell
.\scripts\generate-icons.bat
```

### What the Script Does

1. Checks for source icon at `assets/icon.png`
2. Attempts to generate icons using available tools:
   - **ImageMagick** (preferred)
   - **GraphicsMagick**
   - **Sharp** (Node.js library)
3. Outputs platform-specific icons to `assets/` directory
4. Provides instructions if no tools are available

### Script Output

```
Checking for source icon...
✓ Found source icon: assets/icon.png

Attempting icon generation...
✓ Generated assets/icon.ico (Windows)
✓ Generated assets/icon.icns (macOS)
✓ Generated assets/icon.png (Linux)

Icon generation complete!
```

## Manual Generation

If automated generation fails, you can create icons manually.

### Method 1: Using ImageMagick (Recommended)

#### Install ImageMagick

**Windows**:
```powershell
# Using Chocolatey
choco install imagemagick

# Or download from https://imagemagick.org/
```

**macOS**:
```bash
brew install imagemagick
```

**Linux**:
```bash
sudo apt-get install imagemagick
```

#### Generate Icons

```bash
# Windows .ico
magick convert assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 assets/icon.ico

# macOS .icns (requires iconutil on macOS)
mkdir -p icon.iconset
magick convert assets/icon.png -resize 16x16 icon.iconset/icon_16x16.png
magick convert assets/icon.png -resize 32x32 icon.iconset/icon_16x16@2x.png
magick convert assets/icon.png -resize 32x32 icon.iconset/icon_32x32.png
magick convert assets/icon.png -resize 64x64 icon.iconset/icon_32x32@2x.png
magick convert assets/icon.png -resize 128x128 icon.iconset/icon_128x128.png
magick convert assets/icon.png -resize 256x256 icon.iconset/icon_128x128@2x.png
magick convert assets/icon.png -resize 256x256 icon.iconset/icon_256x256.png
magick convert assets/icon.png -resize 512x512 icon.iconset/icon_256x256@2x.png
magick convert assets/icon.png -resize 512x512 icon.iconset/icon_512x512.png
magick convert assets/icon.png -resize 1024x1024 icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o assets/icon.icns
rm -rf icon.iconset

# Linux .png (just copy or resize)
magick convert assets/icon.png -resize 512x512 assets/icon.png
```

### Method 2: Using Online Tools

#### For Windows (.ico)

1. Go to [icoconvert.com](https://icoconvert.com/)
2. Upload your PNG icon
3. Select sizes: 16, 24, 32, 48, 64, 128, 256
4. Download as `icon.ico`
5. Place in `assets/icon.ico`

#### For macOS (.icns)

1. Go to [cloudconvert.com](https://cloudconvert.com/png-to-icns)
2. Upload your PNG icon
3. Convert to ICNS format
4. Download as `icon.icns`
5. Place in `assets/icon.icns`

### Method 3: Using Electron Icon Maker

```bash
# Install electron-icon-maker globally
npm install -g electron-icon-maker

# Generate icons
electron-icon-maker --input=assets/icon.png --output=assets
```

This will create:
- `assets/icons/mac/icon.icns`
- `assets/icons/win/icon.ico`
- `assets/icons/png/` (various sizes)

Move the files to the correct locations:
```bash
mv assets/icons/mac/icon.icns assets/icon.icns
mv assets/icons/win/icon.ico assets/icon.ico
```

### Method 4: Using Sharp (Node.js)

Create a script `generate-icons-sharp.js`:

```javascript
import sharp from 'sharp';
import fs from 'fs';

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const source = 'assets/icon.png';

// Generate PNG sizes
for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .toFile(`assets/icon-${size}.png`);
}

console.log('Generated PNG icons');
console.log('Use ImageMagick or online tools to create .ico and .icns from these PNGs');
```

Run:
```bash
npm install sharp
node generate-icons-sharp.js
```

## Icon Design Guidelines

### Best Practices

1. **Keep it simple**: Icons should be recognizable at 16x16 pixels
2. **Use transparency**: PNG with alpha channel for smooth edges
3. **Avoid text**: Text becomes unreadable at small sizes
4. **High contrast**: Ensure icon stands out on various backgrounds
5. **Consistent style**: Match your app's visual identity

### Testing Icons

Test your icons at different sizes:

```bash
# View at different sizes (macOS)
qlmanage -p assets/icon.icns

# View in Finder (Windows)
explorer assets\icon.ico
```

### Common Mistakes

- Using low-resolution source image
- Including too much detail
- Using colors that don't contrast well
- Forgetting transparency
- Not testing at small sizes

## Troubleshooting

### "Source icon not found"

**Issue**: Script can't find source icon

**Solution**:
```bash
# Ensure icon exists at one of these locations:
# - assets/icon.png
# - apps/renderer/public/icon.png

# Or specify custom path in script
```

### "No icon generation tools available"

**Issue**: ImageMagick, GraphicsMagick, or Sharp not installed

**Solution**:
```bash
# Install ImageMagick (recommended)
# Windows: choco install imagemagick
# macOS: brew install imagemagick
# Linux: sudo apt-get install imagemagick

# Or use online tools (see Manual Generation)
```

### Generated icons look blurry

**Issue**: Source image too small or low quality

**Solution**:
- Use source image at least 1024x1024
- Ensure source is PNG with transparency
- Use vector graphics if possible, export at high resolution

### Icons not showing in built app

**Issue**: Icon paths incorrect in forge.config.js

**Solution**:
```javascript
// forge.config.js
export default {
  packagerConfig: {
    icon: '../../../assets/icon', // No extension
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: '../../../assets/icon.ico', // Full path with extension
      },
    },
    // ...
  ],
};
```

### macOS icon not updating

**Issue**: macOS caches icons

**Solution**:
```bash
# Clear icon cache
sudo rm -rf /Library/Caches/com.apple.iconservices.store
killall Finder
killall Dock
```

### Windows icon shows default Electron icon

**Issue**: Icon not properly embedded in executable

**Solution**:
- Ensure `icon.ico` exists in `assets/`
- Rebuild application: `pnpm run build && pnpm --filter @flazz/main make`
- Check forge.config.js paths

## Icon Locations

After generation, icons should be at:

```
flazz/
├── assets/
│   ├── icon.png      # Source and Linux icon
│   ├── icon.ico      # Windows icon
│   └── icon.icns     # macOS icon
```

These are referenced in:
- `apps/main/forge.config.js` - Build configuration
- `apps/renderer/public/` - May have copy for renderer
- `package.json` - App metadata

## Further Reading

- [Electron Icon Documentation](https://www.electronjs.org/docs/latest/tutorial/application-distribution#application-icon)
- [ImageMagick Documentation](https://imagemagick.org/index.php)
- [macOS Icon Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Windows Icon Guidelines](https://docs.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-design)
