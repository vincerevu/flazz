# ADR 002: Runtime Decomposition

**Date:** 2024-05-18
**Status:** Accepted

## Context

The Main process was growing increasingly complex as more agents and features were added. The logic for managing background agents, scheduled tasks, IPC handlers, and application lifecycle was tangled. This monolithic structure made the Main process difficult to maintain, test, and reason about.

## Decision

We decomposed the Main process runtime into smaller, distinct components with clear responsibilities, specifically by adopting an event-driven or heavily separated architecture for different systems.

Instead of a single giant "Main" class or file managing everything, we established isolated managers/services within the Main process, such as separating the agent scheduling logic from core app lifecycle logic. The runtime is now composed of specialized modules that are loosely coupled.

## Consequences

*   **Improved Maintainability:** Modules are smaller, focused, and easier to understand independently.
*   **Easier Testing:** Isolated components can be unit tested without starting the entire application or mocking out unrelated subsystems.
*   **Clearer Boundaries:** It forces developers to think about how different parts of the backend communicate, encouraging better design.
*   **Increased Complexity in Orchestration:** While individual components are simpler, the orchestration of how they start up and interact can be slightly more complex, requiring clear dependency management or event buses.
