# Agent Guide For Flazz

## Project Summary

Flazz is a local-first Electron desktop app with an AI copilot and long-lived knowledge workspace.

Core layers:

- `apps/renderer`: React UI, screen state, presentation logic
- `apps/main`: Electron bootstrap, window lifecycle, IPC wiring, platform services
- `apps/preload`: secure bridge exposing a narrow renderer API
- `packages/core`: application logic, runtime orchestration, integrations, workspace services
- `packages/shared`: shared schemas, IPC contracts, event types, DTOs

Runtime workspace data is stored outside the repo in `~/Flazz`. Do not confuse repo source code with runtime data.

## Architecture Rules

### System Goal

The target architecture for this repo is:

- `renderer` for presentation and screen orchestration
- `main` for Electron hosting and IPC composition
- `core` for application logic and domain orchestration
- `shared` for contracts and schemas
- infrastructure code isolated behind adapters where practical

Every meaningful change should move the codebase toward clearer boundaries, not blur them.

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
- direct knowledge of persistence details
- low-level integration logic for OAuth, MCP, Composio, or model providers

Renderer feature modules should preferably be organized by domain:

- chat
- knowledge
- settings
- background tasks
- shared presentation primitives

Prefer:

- screen hooks
- feature services or adapters
- small composition components

Avoid:

- giant root state bags
- cross-feature helper files with unclear ownership
- direct IPC calls scattered across many components

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
- renderer-oriented data shaping
- large domain workflows beyond bootstrapping and dispatch

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

Core should be split conceptually into:

- domain or use-case orchestration
- repositories
- infrastructure adapters
- runtime pipelines

Prefer moving code in this direction:

- handlers call use cases
- use cases call repos and adapters
- repos and adapters hide implementation details

Avoid keeping these responsibilities in one place when they can be separated:

- input parsing
- external API calls
- state mutation
- event emission
- response formatting

### Shared

Any contract used across boundaries belongs in `packages/shared`:

- IPC schemas
- events
- model DTOs
- run messages

If you change an IPC request or response, update `packages/shared` first.

Shared must remain dependency-light and stable. Do not move app-specific orchestration into `shared`.

## Domain Boundaries

Preferred domain split:

- `chat`
- `knowledge`
- `workspace`
- `runs`
- `agents`
- `integrations`
- `search`
- `config`
- `security`
- `background-jobs`

Each domain should ideally have:

- a clear public entrypoint
- its own helpers and types
- minimal knowledge of other domains' internals

If a change touches 3 or more domains, stop and check whether a missing boundary or shared abstraction is the real problem.

## Hotspots To Treat Carefully

- `apps/renderer/src/App.tsx`
- `apps/main/src/ipc.ts`
- `packages/core/src/agents/runtime.ts`
- `packages/core/src/application/lib/builtin-tools.ts`
- `packages/core/src/search/search.ts`
- `packages/core/src/workspace/workspace.ts`

Changes in these files should prefer extraction and isolation over in-place growth.

If a hotspot file grows further, the default move is to extract a module, not add another section to the same file.

## Preferred Module Direction

- UI -> feature hooks/services -> IPC adapter -> main/core
- main -> core use cases/services
- core -> infrastructure adapters
- shared -> imported by all layers, but should not import app-specific logic

Additional preferred dependency direction:

- components -> feature modules -> shared UI helpers
- IPC handlers -> use cases -> repositories/adapters
- runtime orchestration -> execution helpers -> infrastructure

When in doubt, dependencies should point inward toward more stable abstractions.

Avoid reverse dependencies such as:

- core importing renderer code
- shared importing main or core modules
- renderer importing deep internals from main
- one feature module importing another feature module's private files
- main importing deep implementation details from renderer-facing code

## Architectural Invariants

These rules should stay true unless there is a deliberate architecture decision recorded elsewhere:

- all cross-layer contracts are defined in `packages/shared`
- workspace path safety is enforced before filesystem mutations
- command execution remains behind permission and policy boundaries
- run events remain append-only and schema-validated
- renderer does not become the source of truth for domain data contracts
- main process remains a host layer, not a second application core

## Refactor Decision Rules

When deciding whether code belongs in a new module, extract it if any of these are true:

- it has a reusable domain concept
- it carries non-trivial invariants
- it mixes multiple responsibilities
- it is hard to test in its current location
- it is likely to be edited frequently by multiple future tasks

When deciding whether to create a new abstraction, do it only if:

- it clarifies ownership
- it removes coupling
- it creates a stable boundary

Do not create abstractions that only rename complexity without isolating it.

## Anti-Patterns To Avoid

- god components
- god services
- utils folders that become dumping grounds
- IPC handlers with mixed domain behavior
- adapters leaking external API shapes into the rest of the codebase
- feature code reaching into another feature's internal state
- direct filesystem or shell access from presentation code
- copying schemas instead of importing shared contracts

## File Size And Ownership Heuristics

Heuristics, not hard laws:

- files above roughly 400-500 lines should be reviewed for extraction
- a file that changes in many unrelated tasks probably owns too much
- a module with no obvious owner is a likely architecture smell
- helpers should live close to the domain that owns them, not in generic global folders by default

## Architecture Review Checklist

Before merging a structural change, ask:

1. Did this change improve or worsen layer boundaries?
2. Did any contract change without updating `shared`?
3. Did any feature gain new knowledge of infrastructure details?
4. Could a future change in this area happen with fewer touched files now?
5. Is the new dependency direction cleaner than before?
6. Did we add tests around the boundary or invariant we changed?

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
- do not let adapters become orchestration layers
- do not put integration-specific branching logic into presentation components
- do not add new cross-domain dependencies without checking ownership first

When adding a new feature:

1. decide the owning domain
2. define or reuse shared contracts
3. add use-case entrypoints in the correct layer
4. connect the UI through adapters or handlers
5. add tests at the boundary that changed

## Git And Branching

Recommended branch prefixes:

- `refactor/...`
- `arch/...`
- `fix/...`

For large refactors:

- one task per branch
- one implementation step per commit
- do not mix renderer cleanup, core runtime changes, and tooling changes in one branch unless the task explicitly spans them

## Project-Specific Guardrails

- `.local/` is for local planning and should not be committed.
- Generated outputs like `dist/`, `.package/`, and logs should stay out of git.
- Treat `~/Flazz` as user data, not repo state.
- Search and filesystem code must remain portable on Windows.
- Security-sensitive command execution should continue to honor allowlist and permission flow.

## What Good Looks Like

A good change in this repo usually has these traits:

- small surface area
- clear layer ownership
- shared contracts updated when boundaries change
- focused tests for risky logic
- no unnecessary coupling added across renderer/main/core
- domain logic moved closer to domain modules
- infrastructure details hidden better than before
