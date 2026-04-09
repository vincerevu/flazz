# Test Strategy

## Test Pyramid

The testing strategy is divided into three layers, forming a test pyramid:

1.  **Unit Tests (`*.unit.test.ts`)**
    *   **Scope:** Individual functions, classes, or small isolated components.
    *   **Environment:** Pure Node.js (for `@flazz/core`, `@flazz/shared`, `@flazz/main`) or JSDOM/Vite (for `@flazz/renderer`). No Electron, no real filesystem access (mocked if necessary).
    *   **Execution:** Fast, robust, run on every commit.
    *   **Examples:** Path safety validation, utility functions, parsing logic, state management hooks (mocking IPC).

2.  **Integration Tests (`*.integration.test.ts`)**
    *   **Scope:** Interaction between multiple components or modules.
    *   **Environment:** Node.js with real filesystem access (usually temporary directories) or mocked IPC boundaries. Still runs without full Electron if possible, or uses a stripped-down Electron runner.
    *   **Execution:** Slower than unit tests, but fast enough to run frequently.
    *   **Examples:** Database operations, complex filesystem operations (e.g., recursive directory reading), IPC handler logic calling core services.

3.  **Smoke/E2E Tests (`*.smoke.test.ts` or `*.e2e.test.ts`)**
    *   **Scope:** The entire application stack.
    *   **Environment:** Real Electron application running.
    *   **Execution:** Slow, runs in CI or before releases. Manual testing can also fall into this category.
    *   **Examples:** App launch, creating a workspace, sending a chat message, opening settings.

## Test Runner

We use the native Node.js test runner (`node:test` and `node:assert`) for the core package to minimize dependencies and utilize built-in capabilities. For TypeScript support, we use the `--experimental-strip-types` flag.

Command to run core tests:
```bash
npm run --filter @flazz/core test
```
Or from the core directory:
```bash
npm run test
```

For the renderer package, we use Vitest (via Vite) for testing React components and hooks, as it integrates seamlessly with the Vite build pipeline.

## Examples and Boundaries

*   **Workspace Path Safety:** Unit tests ensure `resolveWorkspacePath` correctly blocks directory traversal (`../`) and absolute paths outside the configured workspace directory.
*   **Run Event Hydration:** Unit tests for hooks like `use-chat-runtime` mock the IPC layer to verify that incoming run events correctly update the UI state.
*   **IPC Adapters:** Unit tests mock `window.ipc.invoke` to verify that service adapters call the correct channel with the correct payload structure.
