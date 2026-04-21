# Development Setup

This guide will help you set up a development environment for contributing to Flazz.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Development Commands](#development-commands)
- [IDE Setup](#ide-setup)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js**: Version 18 or higher
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify: `node --version`

- **pnpm**: Version 8 or higher
  - Install: `npm install -g pnpm`
  - Verify: `pnpm --version`

- **Git**: Latest version
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify: `git --version`

### Recommended Software

- **VS Code**: Recommended IDE with excellent TypeScript support
- **GitHub Desktop**: For easier Git workflow (optional)

### System Requirements

- **Windows**: Windows 10 or later
- **macOS**: macOS 10.15 (Catalina) or later
- **Linux**: Ubuntu 20.04 or equivalent

## Installation

### 1. Clone the Repository

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/flazz.git
cd flazz

# Add upstream remote
git remote add upstream https://github.com/flazz/flazz.git
```

### 2. Configure pnpm

Flazz uses pnpm with hoisted node-linker. Configure this before installing:

```bash
# Set node-linker to hoisted
pnpm config set node-linker hoisted
```

Or create a `.npmrc` file in the project root:

```
node-linker=hoisted
```

### 3. Install Dependencies

```bash
# Install all dependencies
pnpm install
```

This will install dependencies for all workspace packages:
- `apps/main` - Electron main process
- `apps/renderer` - React UI
- `apps/preload` - IPC bridge
- `packages/core` - Business logic
- `packages/shared` - Shared types

### 4. Set Up Environment Variables

Create a `.env` file in the project root (optional for development):

```env
# LLM Provider API Keys (optional - can be set in UI)
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# Development Settings
NODE_ENV=development
LOG_LEVEL=debug
```

### 5. Start Development Server

```bash
# Start the development server
pnpm run dev
```

This will:
1. Build the renderer in watch mode
2. Build the main process in watch mode
3. Start Electron with hot reload

The application will open automatically. Changes to code will trigger automatic rebuilds.

## Project Structure

```
flazz/
├── apps/
│   ├── main/           # Electron main process
│   │   ├── src/
│   │   │   ├── main.ts       # Entry point
│   │   │   ├── ipc.ts        # IPC handlers
│   │   │   └── window.ts     # Window management
│   │   └── package.json
│   ├── renderer/       # React UI
│   │   ├── src/
│   │   │   ├── App.tsx       # Root component
│   │   │   ├── features/     # Feature modules
│   │   │   ├── components/   # Reusable components
│   │   │   └── hooks/        # React hooks
│   │   └── package.json
│   └── preload/        # IPC bridge
│       ├── src/
│       │   └── index.ts      # Preload script
│       └── package.json
├── packages/
│   ├── core/           # Business logic
│   │   ├── src/
│   │   │   ├── agents/       # Agent runtime
│   │   │   ├── memory/       # Memory system
│   │   │   ├── skills/       # Skill management
│   │   │   ├── workspace/    # Workspace operations
│   │   │   └── integrations/ # External integrations
│   │   └── package.json
│   └── shared/         # Shared types
│       ├── src/
│       │   ├── ipc.ts        # IPC contracts
│       │   ├── runs.ts       # Run events
│       │   └── agent.ts      # Agent types
│       └── package.json
├── docs/               # Documentation
├── scripts/            # Build and utility scripts
├── assets/             # Icons and images
└── package.json        # Root package.json
```

### Workspace Packages

Flazz uses pnpm workspaces for monorepo management:

- **apps/main**: Electron main process (Node.js environment)
- **apps/renderer**: React UI (browser environment)
- **apps/preload**: Secure IPC bridge
- **packages/core**: Application logic (Node.js environment)
- **packages/shared**: Shared contracts and types

### Runtime Data Location

User data is stored outside the repository:

- **Windows**: `%USERPROFILE%\Flazz`
- **macOS**: `~/Flazz`
- **Linux**: `~/Flazz`

This directory contains:
- `memory/` - Knowledge graph and memories
- `skills/` - User and AI-generated skills
- `workspace/` - Notes and documents
- `config/` - User configuration

## Development Commands

### Building

```bash
# Build all packages
pnpm run build

# Build specific package
pnpm --filter @flazz/renderer build
pnpm --filter @flazz/main build
pnpm --filter @flazz/core build

# Build in watch mode
pnpm run dev
```

### Linting

```bash
# Run ESLint on all packages
pnpm run lint

# Fix auto-fixable issues
pnpm run lint:fix

# Lint specific package
pnpm --filter @flazz/renderer lint
```

### Type Checking

```bash
# Type check all packages
pnpm run type-check

# Type check specific package
pnpm --filter @flazz/core type-check
```

### Testing

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage

# Test specific package
pnpm --filter @flazz/core test
```

### Packaging

```bash
# Package for current platform
pnpm --filter @flazz/main package

# Create distributable installer
pnpm --filter @flazz/main make
```

### Cleaning

```bash
# Clean build artifacts
pnpm run clean

# Clean and reinstall dependencies
pnpm run clean:all
pnpm install
```

## IDE Setup

### VS Code

Recommended extensions:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss"
  ]
}
```

Recommended settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### Debugging

VS Code launch configuration (`.vscode/launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/apps/main",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": [".", "--remote-debugging-port=9223"],
      "outputCapture": "std"
    },
    {
      "name": "Debug Renderer Process",
      "type": "chrome",
      "request": "attach",
      "port": 9223,
      "webRoot": "${workspaceFolder}/apps/renderer",
      "timeout": 30000
    }
  ],
  "compounds": [
    {
      "name": "Debug All",
      "configurations": ["Debug Main Process", "Debug Renderer Process"]
    }
  ]
}
```

## Troubleshooting

### pnpm install fails

**Issue**: `node-linker` not set to hoisted

**Solution**:
```bash
pnpm config set node-linker hoisted
# or add to .npmrc
echo "node-linker=hoisted" > .npmrc
pnpm install
```

### Build fails with module errors

**Issue**: Stale build artifacts

**Solution**:
```bash
pnpm run clean
pnpm install
pnpm run build
```

### Electron won't start

**Issue**: Main process build failed

**Solution**:
```bash
# Check for build errors
pnpm --filter @flazz/main build

# Check logs
# Look for errors in terminal output
```

### Hot reload not working

**Issue**: Watch mode not detecting changes

**Solution**:
```bash
# Restart dev server
# Press Ctrl+C to stop
pnpm run dev
```

### TypeScript errors in IDE

**Issue**: IDE using wrong TypeScript version

**Solution**:
- In VS Code: Press `Cmd/Ctrl+Shift+P`
- Type "TypeScript: Select TypeScript Version"
- Choose "Use Workspace Version"

### Port already in use

**Issue**: Development server port is occupied

**Solution**:
```bash
# Find and kill process using port 5173 (renderer)
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:5173 | xargs kill -9
```

### Memory issues during build

**Issue**: Node runs out of memory

**Solution**:
```bash
# Increase Node memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm run build
```

### Git submodule issues

**Issue**: Submodules not initialized

**Solution**:
```bash
git submodule update --init --recursive
```

## Next Steps

- Read the [Architecture Overview](../architecture/overview.md)
- Check the [Contributing Guide](../../CONTRIBUTING.md)
- Explore the [Agent Guide](../../AGENTS.md)
- Start with a [good first issue](https://github.com/flazz/flazz/labels/good%20first%20issue)

## Getting Help

If you encounter issues not covered here:

1. Check [existing issues](https://github.com/flazz/flazz/issues)
2. Search [documentation](../README.md)
3. Ask in [discussions](https://github.com/flazz/flazz/discussions)
4. Create a new issue with the `question` label
