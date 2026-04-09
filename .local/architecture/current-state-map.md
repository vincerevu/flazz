# Current State Map

This document maps the current state of the architecture after the recent refactoring and roadmap completion.

## Core Boundaries and Principles

1. **Strict Dependency Graph:**
   - `shared` -> NO dependencies
   - `core` -> ONLY `shared`
   - `renderer` -> `shared` (UI and state logic)
   - `main` -> `core`, `shared` (Main process infrastructure and Electron API)
   - No cross-layer dependencies (e.g., `core` cannot import from `renderer`).

2. **IPC Abstraction:**
   - All IPC communication goes through domain-specific adapters in `apps/renderer/src/services/`.
   - `window.ipc` is fully abstracted away.

3. **Background Services Lifecycle:**
   - Handled by `ServiceRegistry` which manages startup/shutdown of standard services (e.g., MCP, File Watcher) uniformly to avoid `main.ts` clutter.

4. **Runtime Architecture:**
   - The LLM stream, tools, subflows, and permissions are handled by discrete orchestrators in `packages/core/src/agents/runtime/` instead of a monolithic loop.

5. **Security and Configuration:**
   - System policy is strictly isolated from user preferences, preventing user inputs from escalating or modifying core configuration silently.

6. **Testing Pyramid:**
   - Adopted a structured approach: `*.unit.test.ts`, `*.integration.test.ts`, and `*.smoke.test.ts` for respective testing layers, strictly bounded.

7. **Extensibility:**
   - Tools are abstracted through schemas and interfaces (e.g., `mcp`), avoiding central registry modifications.

8. **Observability:**
   - Standardized log formats (`{ ts, level, service, runId, correlationId, message, ...extra }`) to provide trace logs without guesswork.
