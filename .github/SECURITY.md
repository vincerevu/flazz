# Security Policy

## Supported Versions

Security fixes are provided on the default branch only:

- `main`

Feature branches, archived branches, and old snapshots are not supported for security updates.

## Reporting A Vulnerability

Please do not open a public GitHub issue for sensitive vulnerabilities.

To report a vulnerability:

1. Email the maintainer at `vndt181204@gmail.com`.
2. Include a clear description, impact, reproduction steps, and any proof of concept you have.
3. If the issue affects local data, command execution, OAuth tokens, or external integrations, call that out explicitly.

Target response times:

- initial acknowledgement: within 72 hours
- initial triage: within 7 days

## Scope

This policy especially covers:

- command execution and permission boundaries
- workspace filesystem access and path traversal risks
- OAuth and token handling
- MCP and external integration boundaries
- local data exposure in `~/.rowboat`
- background services and sync pipelines

## Security Expectations For Contributors

- Never bypass workspace path safety guards.
- Never weaken command permission or allowlist checks without a clear review.
- Do not commit secrets, API keys, tokens, or local workspace data.
- Treat `~/.rowboat` as user data, not repo state.
- Prefer narrow contracts between renderer, main, and core.

## Sensitive Areas In This Repository

- `packages/core/src/application/lib/command-executor.ts`
- `packages/core/src/config/security.ts`
- `packages/core/src/workspace/workspace.ts`
- `packages/core/src/agents/runtime.ts`
- `apps/main/src/ipc.ts`
- `apps/main/src/oauth-handler.ts`
- `apps/main/src/composio-handler.ts`

## Disclosure

Please allow time for validation and remediation before public disclosure.
