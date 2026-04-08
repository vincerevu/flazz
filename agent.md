# Agent Guide For Rowboat

## Project Summary

Rowboat is a local-first Electron desktop app with an AI copilot and long-lived knowledge workspace.

Core layers:

- `apps/renderer`: React UI, screen state, presentation logic
- `apps/main`: Electron bootstrap, window lifecycle, IPC wiring, platform services
- `apps/preload`: secure bridge exposing a narrow renderer API
- `packages/core`: application logic, runtime orchestration, integrations, workspace services
- `packages/shared`: shared schemas, IPC contracts, event types, DTOs

Runtime workspace data is stored outside the repo in `~/.rowboat`. Do not confuse repo source code with runtime data.

## Architecture Rules

### Renderer

Renderer should contain:

- UI components
- screen-level hooks
- presentation helpers
- feature modules for chat, knowledge, tabs, dialogs

Renderer should not contain:

- Electron APIs directly
- business rules that belong in `core`
- ad hoc IPC contracts duplicated from `shared`

### Main Process

Main process should contain:

- Electron app bootstrap
- `BrowserWindow` setup
- protocol registration
- IPC registration and emitters
- startup and shutdown orchestration

Main process should not contain:

- reusable business logic
- deep storage logic
- feature rules that belong in `packages/core`

### Core

Core should contain:

- use-case orchestration
- run and agent runtime logic
- workspace operations
- search
- sync and background jobs
- integrations and adapters

Core should not depend on:

- renderer state
- Electron renderer APIs

### Shared

Any contract used across boundaries belongs in `packages/shared`:

- IPC schemas
- events
- model DTOs
- run messages

If you change an IPC request or response, update `packages/shared` first.

## Hotspots To Treat Carefully

- `apps/renderer/src/App.tsx`
- `apps/main/src/ipc.ts`
- `packages/core/src/agents/runtime.ts`
- `packages/core/src/application/lib/builtin-tools.ts`
- `packages/core/src/search/search.ts`
- `packages/core/src/workspace/workspace.ts`

Changes in these files should prefer extraction and isolation over in-place growth.

## Preferred Module Direction

- UI -> feature hooks/services -> IPC adapter -> main/core
- main -> core use cases/services
- core -> infrastructure adapters
- shared -> imported by all layers, but should not import app-specific logic

Avoid reverse dependencies such as:

- core importing renderer code
- shared importing main or core modules
- renderer importing deep internals from main

## Development Workflow

Useful commands from repo root:

- `npm run dev`
- `npm run deps`
- `npm run lint`

Before merging meaningful changes:

- run lint
- run the relevant build or smoke flow
- verify the touched user flow manually if runtime, IPC, search, or workspace logic changed

## Refactor Guidance

Prefer this order:

1. isolate contracts
2. extract helpers
3. extract domain module
4. add tests around the boundary
5. remove dead paths

When refactoring:

- keep behavior stable unless the task explicitly changes behavior
- do not rename IPC channels casually
- do not change run event sequencing without regression coverage
- do not move filesystem writes outside workspace safety guards

## Git And Branching

Recommended branch prefixes:

- `codex/refactor/...`
- `codex/arch/...`
- `codex/fix/...`

For large refactors:

- one task per branch
- one implementation step per commit
- do not mix renderer cleanup, core runtime changes, and tooling changes in one branch unless the task explicitly spans them

## Project-Specific Guardrails

- `.local/` is for local planning and should not be committed.
- Generated outputs like `dist/`, `.package/`, and logs should stay out of git.
- Treat `~/.rowboat` as user data, not repo state.
- Search and filesystem code must remain portable on Windows.
- Security-sensitive command execution should continue to honor allowlist and permission flow.

## What Good Looks Like

A good change in this repo usually has these traits:

- small surface area
- clear layer ownership
- shared contracts updated when boundaries change
- focused tests for risky logic
- no unnecessary coupling added across renderer/main/core
