# Architecture Documentation

This directory contains documentation detailing the architecture of the application.

## Architecture Decision Records (ADRs)

We use Architecture Decision Records to document significant architectural decisions. This helps new developers understand *why* the codebase is structured the way it is and what trade-offs were considered.

*   [ADR 001: IPC Adapter Layer](./adr/001-ipc-adapter-layer.md)
*   [ADR 002: Runtime Decomposition](./adr/002-runtime-decomposition.md)
*   [ADR 003: Background Service Lifecycle and State Merging](./adr/003-background-service-lifecycle.md)

### Adding a new ADR

To add a new ADR, copy the template from [adr/000-template.md](./adr/000-template.md), rename it with the next available sequential number (e.g., `004-my-new-decision.md`), and fill in the details.
