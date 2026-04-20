/**
 * Script to generate all required icon formats for Electron app
 * 
 * Requirements:
 * - npm install -g electron-icon-builder
 * OR
 * - Use online tools (recommended for simplicity)
 * 
 * This script provides instructions and automation where possible
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SOURCE_ICON = path.join(ASSETS_DIR, 'icon.png');

console.log('🎨 Flazz Icon Generator\n');

// Check if source icon exists
if (!fs.existsSync(SOURCE_ICON)) {
  console.error('❌ Source icon not found: assets/icon.png');
  console.log('\nPlease ensure you have a high-resolution PNG icon (1024x1024 recommended) at:');
  console.log('  assets/icon.png\n');
  process.exit(1);
}

console.log('✓ Found source icon: assets/icon.png\n');

// Check icon size
try {
  // Try to get image dimensions (requires ImageMagick)
  const identify = execSync(`identify -format "%wx%h" "${SOURCE_ICON}"`, { encoding: 'utf8' });
  console.log(`  Current size: ${identify}`);
  
  const [width, height] = identify.split('x').map(Number);
  if (width < 512 || height < 512) {
    console.warn('  ⚠️  Warning: Icon should be at least 512x512 for best quality');
  }
} catch (e) {
  console.log('  (Could not detect size - ImageMagick not installed)');
}

console.log('\n📋 Required Icon Formats:\n');
console.log('  Windows (.ico):');
console.log('    - 256x256, 128x128, 64x64, 48x48, 32x32, 16x16');
console.log('    - All sizes embedded in one .ico file\n');
console.log('  macOS (.icns):');
console.log('    - 1024x1024@2x, 512x512@2x, 512x512, 256x256@2x, 256x256');
console.log('    - 128x128@2x, 128x128, 32x32@2x, 32x32, 16x16@2x, 16x16\n');
console.log('  Linux (.png):');
console.log('    - 512x512 or 1024x1024 PNG\n');

console.log('🔧 Generation Methods:\n');

// Method 1: electron-icon-builder
console.log('Method 1: Using electron-icon-builder (Recommended)\n');
console.log('  Install:');
console.log('    npm install -g electron-icon-builder\n');
console.log('  Generate:');
console.log('    electron-icon-builder --input=./assets/icon.png --output=./assets\n');

// Method 2: Online tools
console.log('Method 2: Online Tools (Easiest)\n');
console.log('  Windows .ico:');
console.log('    → https://convertico.com/');
console.log('    → https://icoconvert.com/\n');
console.log('  macOS .icns:');
console.log('    → https://cloudconvert.com/png-to-icns');
console.log('    → https://iconverticons.com/online/\n');

// Method 3: Manual with ImageMagick
console.log('Method 3: ImageMagick (Advanced)\n');
console.log('  Install ImageMagick, then run:\n');
console.log('  Windows .ico:');
console.log('    convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico\n');
console.log('  macOS .icns:');
console.log('    mkdir icon.iconset');
console.log('    sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png');
console.log('    sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png');
console.log('    sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png');
console.log('    sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png');
console.log('    sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png');
console.log('    sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png');
console.log('    sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png');
console.log('    sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png');
console.log('    sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png');
console.log('    sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png');
console.log('    iconutil -c icns icon.iconset\n');

// Try to auto-generate if electron-icon-builder is available
console.log('🚀 Attempting auto-generation...\n');

try {
  execSync('electron-icon-builder --version', { stdio: 'ignore' });
  console.log('✓ electron-icon-builder found!\n');
  console.log('Generating icons...');
  
  execSync(`electron-icon-builder --input="${SOURCE_ICON}" --output="${ASSETS_DIR}"`, {
    stdio: 'inherit'
  });
  
  console.log('\n✅ Icons generated successfully!\n');
  console.log('Generated files:');
  console.log('  ✓ assets/icon.ico   (Windows)');
  console.log('  ✓ assets/icon.icns  (macOS)');
  console.log('  ✓ assets/icon.png   (Linux - already exists)\n');
  
} catch (e) {
  console.log('❌ electron-icon-builder not found\n');
  console.log('Please install it or use one of the methods above:\n');
  console.log('  npm install -g electron-icon-builder');
  console.log('  node scripts/generate-icons.js\n');
  console.log('Or use online tools (easiest option):\n');
  console.log('  1. Go to https://convertico.com/');
  console.log('  2. Upload assets/icon.png');
  console.log('  3. Download as .ico and .icns');
  console.log('  4. Place in assets/ folder\n');
}

console.log('📁 Expected file structure:\n');
console.log('  assets/');
console.log('  ├── icon.png   ✓ (source)');
console.log('  ├── icon.ico   ' + (fs.existsSync(path.join(ASSETS_DIR, 'icon.ico')) ? '✓' : '✗ (needed for Windows)'));
console.log('  └── icon.icns  ' + (fs.existsSync(path.join(ASSETS_DIR, 'icon.icns')) ? '✓' : '✗ (needed for macOS)'));
console.log('');
