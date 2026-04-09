# ADR 001: IPC Adapter Layer

**Date:** 2024-05-18
**Status:** Accepted

## Context

The Renderer process needs to communicate with the Main process to interact with OS-level APIs (file system, process execution, etc.) using IPC (Inter-Process Communication). Directly invoking `window.ipc.invoke(...)` throughout the React components and UI logic tightly couples the UI to the specific IPC interface and makes testing and refactoring difficult. It also spreads domain-specific error handling and data serialization logic everywhere.

## Decision

We introduced a "Services" layer in the renderer (`apps/renderer/src/services/`). These services act as domain-specific adapters wrapping the raw `window.ipc` calls.

1. **Abstraction:** Components call methods on these service objects (e.g., `TopicService.extractTopics()`) instead of raw IPC methods.
2. **Centralization:** All IPC calls are grouped by domain and exported centrally from `apps/renderer/src/services/index.ts`.
3. **Type Safety:** The service layer provides typed interfaces based on the shared contracts between the Main and Renderer processes.

## Consequences

*   **Easier Testing:** We can more easily mock these services when testing UI components, instead of mocking the global `window.ipc` object.
*   **Decoupled UI:** UI components are unaware of how data is fetched or actions are executed, focusing only on presentation and local state.
*   **Centralized Error Handling:** We can add centralized error handling or logging within the service adapters in the future.
*   **Slight Overhead:** Adds a small layer of boilerplate code, requiring developers to write an adapter method for every new IPC call.
