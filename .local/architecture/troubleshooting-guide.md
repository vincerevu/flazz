# Observability and Troubleshooting Guide

This guide covers how to trace execution flows in the system to diagnose issues, with a focus on log tracing.

## Core Concepts

* **`runId`**: Uniquely identifies a single workflow run execution within the system. It tracks what task the system is trying to accomplish.
* **`correlationId`**: Uniquely identifies an internal or external invocation path (a sub-task, service start, or runtime trigger) that may span multiple services or components. Used to trace execution through the renderer -> main -> core -> provider layers.

## Log Structure

Core system logs have been standardized to JSON lines format, outputted to `stdout` for the runtime or written to the respective log files (like `services.jsonl` for backend services). The standard log fields include:

```json
{
  "ts": "2024-05-18T12:00:00.000Z",
  "level": "info", // "info", "warn", "error"
  "service": "agent-runtime", // or "gmail", "calendar", etc.
  "runId": "agent_abc123",
  "correlationId": "uuid-v4-string",
  "message": "Human-readable description of event",
  ...extra_fields
}
```

## How to Troubleshoot

### 1. Identify the Failing Action
Look at the user interface or top-level log for the `runId` or `correlationId`. If an error occurred in an agent or a service, it usually prints an initial error object.

### 2. Search by `correlationId`
If you have a `correlationId`, you can `grep` for it across logs to trace the entire sequence of events that led to the error, even if the work spawned multiple internal agents or tool calls.

```bash
grep "your-correlation-id" ~/Flazz/logs/*.jsonl
```

### 3. Search by `runId`
To see the full context of a single run from start to finish, use the `runId`:

```bash
grep "your-run-id" ~/Flazz/logs/*.jsonl
```

### 4. Key Log Points to Look For
* **Run Start**: Search for `"message": "Run processing started"` or `"type": "run_start"`.
* **Tool Call Execution**: Look for `"message": "tool call start"` and `"message": "tool call end"` to see what input was given to a tool and what it returned.
* **Tool Call Error**: Search for `"message": "tool call error"`.
* **Provider Error**: Search for `"message": "provider error"` which indicates the LLM returned a stream error (e.g., token limit reached or API timeout).
* **Permission Requests**: Search for `"message": "permission request"` to see if an action paused waiting for a human approval.

## Common Issues

* **Provider Timeout/Error**: Trace the `provider error` log. It contains the exact `error` string and the number of messages in context, which can help diagnose prompt limit issues.
* **Tool Failing Silently**: Look for a `tool call start` without a corresponding `tool call end`. This means the tool hung or an uncaught exception crashed the process.

## Tracing from Renderer to Core

When an IPC request originates in the renderer, a `correlationId` is generated. It's passed down to the main process, which injects it into Core services via `serviceLogger.startRun({ correlationId })` or the `AgentRuntime` execution. Matching this ID allows full-stack tracing.