# ADR 003: Background Service Lifecycle and State Merging

**Date:** 2024-05-18
**Status:** Accepted

## Context

Background agents need to be scheduled, started, stopped, and monitored. There is persistent configuration for these agents (e.g., how often they should run, whether they are enabled) and there is volatile runtime status (e.g., whether they are currently running, last run time, current progress). Managing these two sources of truth in the UI was becoming complex, leading to synchronization issues.

## Decision

We implemented a state-merging pattern for the agent schedule in the renderer.

1.  **Separation of Concerns Backend:** The backend provides two distinct sets of data: persistent configuration (via `agent-schedule:getConfig`) and volatile runtime status (via `agent-schedule:getState`).
2.  **State Merging Frontend:** In the renderer, we fetch both sets of data and merge them into a single, cohesive `AgentSchedule` data structure.
3.  **Unified View:** The UI components consume this unified `AgentSchedule` state, combining both what the configuration says *should* happen and what the runtime status says is *actually* happening.

## Consequences

*   **Simplified UI Logic:** UI components only need to deal with one object containing all relevant information for an agent, simplifying rendering and logic.
*   **Clearer Data Flow:** It explicitly separates persistent settings from ephemeral state, reducing confusion about where data should be saved or updated.
*   **Merge Overhead:** Requires logic on the frontend to correctly merge the config and state objects, which needs to be maintained if the shape of either object changes.
