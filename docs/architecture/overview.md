# Architecture Overview

This document provides a high-level overview of Flazz's architecture, design principles, and system components.

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [System Architecture](#system-architecture)
- [Layer Responsibilities](#layer-responsibilities)
- [Data Flow](#data-flow)
- [Key Components](#key-components)
- [Integration Points](#integration-points)
- [Security Model](#security-model)

## Design Philosophy

Flazz is built on several core principles:

### Local-First Architecture

- All data stored locally in `~/Flazz` directory
- No cloud dependencies for core functionality
- User maintains full control over their data
- Privacy by default

### Clear Layer Boundaries

- Separation of concerns across renderer, main, and core layers
- Contracts defined in shared package
- Dependencies flow inward toward stable abstractions
- No circular dependencies between layers

### Extensibility

- Plugin-like skill system
- MCP server integration for external tools
- Composio adapter for platform integrations
- Modular architecture for easy feature additions

### Performance

- Streaming responses for real-time feedback
- Efficient context management
- Lazy loading of resources
- Optimized search indexing

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Renderer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Chat   │  │ Knowledge│  │  Skills  │  │ Settings │   │
│  │ Features │  │   Graph  │  │  Manager │  │    UI    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│         │              │              │              │      │
│         └──────────────┴──────────────┴──────────────┘      │
│                          │                                  │
│                     IPC Bridge (Preload)                    │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    Main Process                             │
│  ┌──────────────────────┴────────────────────────────────┐ │
│  │              IPC Handler Registry                     │ │
│  └──────────────────────┬────────────────────────────────┘ │
│                         │                                   │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    Core Package                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Agent   │  │  Memory  │  │  Skills  │  │Workspace │   │
│  │ Runtime  │  │  Manager │  │   Repo   │  │ Service  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │              │              │         │
│  ┌────┴─────────────┴──────────────┴──────────────┴─────┐  │
│  │              Integration Layer                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │   LLM    │  │   MCP    │  │ Composio │           │  │
│  │  │Providers │  │ Servers  │  │ Adapter  │           │  │
│  │  └──────────┘  └──────────┘  └──────────┘           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   External Services   │
              │  ┌─────────────────┐  │
              │  │ OpenAI/Anthropic│  │
              │  │ Google/Mistral  │  │
              │  │ Ollama (local)  │  │
              │  └─────────────────┘  │
              │  ┌─────────────────┐  │
              │  │ MCP Servers     │  │
              │  │ (filesystem,    │  │
              │  │  database, etc) │  │
              │  └─────────────────┘  │
              │  ┌─────────────────┐  │
              │  │ Composio APIs   │  │
              │  │ (Gmail, Slack,  │  │
              │  │  GitHub, etc)   │  │
              │  └─────────────────┘  │
              └───────────────────────┘
```

## Layer Responsibilities

### Renderer Layer (`apps/renderer`)

**Purpose**: User interface and presentation logic

**Responsibilities**:
- React components and UI state
- User interaction handling
- Screen-level orchestration
- Feature modules (chat, knowledge, settings)
- Presentation helpers

**Should NOT contain**:
- Business logic
- Direct Electron API access
- Persistence logic
- Integration details

**Key directories**:
- `src/features/` - Feature-specific UI modules
- `src/components/` - Reusable UI components
- `src/hooks/` - React hooks
- `src/lib/` - Presentation utilities

### Main Process Layer (`apps/main`)

**Purpose**: Electron application host and IPC coordination

**Responsibilities**:
- Electron app lifecycle
- Window management
- IPC handler registration
- Protocol registration
- Startup/shutdown orchestration

**Should NOT contain**:
- Business logic
- Deep domain workflows
- Data transformation logic
- Feature-specific rules

**Key files**:
- `src/main.ts` - Application entry point
- `src/ipc.ts` - IPC handler registry
- `src/window.ts` - Window management

### Preload Layer (`apps/preload`)

**Purpose**: Secure bridge between renderer and main

**Responsibilities**:
- Expose safe IPC API to renderer
- Type-safe communication contracts
- Security boundary enforcement

**Key files**:
- `src/index.ts` - Preload script

### Core Package (`packages/core`)

**Purpose**: Business logic and domain orchestration

**Responsibilities**:
- Agent runtime and execution
- Memory management and knowledge graph
- Skill repository and execution
- Workspace operations
- Search and indexing
- Integration adapters

**Should NOT depend on**:
- Renderer code
- Electron renderer APIs
- UI-specific logic

**Key directories**:
- `src/agents/` - Agent runtime and orchestration
- `src/memory/` - Memory system and graph
- `src/skills/` - Skill management
- `src/workspace/` - Workspace operations
- `src/integrations/` - External integrations
- `src/search/` - Search and indexing

### Shared Package (`packages/shared`)

**Purpose**: Cross-layer contracts and types

**Responsibilities**:
- IPC schemas and contracts
- Event types
- Data transfer objects (DTOs)
- Shared type definitions

**Should NOT contain**:
- Implementation logic
- Layer-specific code
- Heavy dependencies

**Key files**:
- `src/ipc.ts` - IPC contracts
- `src/runs.ts` - Run event types
- `src/agent.ts` - Agent types
- `src/llm-step-events.ts` - LLM event types

## Data Flow

### Chat Message Flow

```
User Input (Renderer)
    │
    ├─> IPC: sendMessage
    │
    ├─> Main: Route to Core
    │
    ├─> Core: Agent Runtime
    │   ├─> Context Engine (build context)
    │   ├─> Memory Manager (retrieve relevant memories)
    │   ├─> LLM Provider (stream response)
    │   ├─> Tool Orchestrator (execute tools)
    │   └─> Memory Manager (store interaction)
    │
    ├─> Main: Stream events back
    │
    └─> Renderer: Update UI
```

### Memory Storage Flow

```
Interaction
    │
    ├─> Memory Manager
    │   ├─> Extract entities and relationships
    │   ├─> Update knowledge graph
    │   ├─> Store behavioral patterns
    │   └─> Index for search
    │
    └─> Workspace
        └─> Persist to ~/Flazz/memory/
```

### Skill Execution Flow

```
Agent needs tool
    │
    ├─> Skill Repository
    │   ├─> Match skill by name/description
    │   ├─> Load skill definition
    │   └─> Validate parameters
    │
    ├─> Skill Executor
    │   ├─> Execute skill code
    │   ├─> Handle errors
    │   └─> Return result
    │
    └─> Agent Runtime
        └─> Continue with result
```

## Key Components

### Agent Runtime

**Location**: `packages/core/src/agents/runtime.ts`

**Purpose**: Orchestrates agent execution loop

**Key features**:
- Manages conversation context
- Coordinates tool execution
- Handles streaming responses
- Implements retry logic
- Manages rate limits

### Memory Manager

**Location**: `packages/core/src/memory/`

**Purpose**: Manages knowledge graph and behavioral learning

**Key features**:
- Entity extraction and linking
- Relationship tracking
- Behavioral pattern recognition
- Context-aware retrieval
- Memory consolidation

### Skill Repository

**Location**: `packages/core/src/skills/skill-repo.ts`

**Purpose**: Manages skill lifecycle

**Key features**:
- Skill discovery and loading
- Fuzzy matching for skill selection
- Skill validation
- Version management
- AI-generated skill support

### Tool Orchestrator

**Location**: `packages/core/src/agents/runtime/tool-orchestrator.ts`

**Purpose**: Coordinates tool execution

**Key features**:
- Built-in tool routing
- MCP server integration
- Composio tool delegation
- Error handling and retries
- Result normalization

### Workspace Service

**Location**: `packages/core/src/workspace/workspace.ts`

**Purpose**: Manages workspace files and operations

**Key features**:
- File CRUD operations
- Wiki link resolution
- Search indexing
- Template management
- Path safety validation

## Integration Points

### LLM Providers

**Supported providers**:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- Mistral
- Groq
- Ollama (local)
- OpenRouter
- Azure OpenAI

**Integration pattern**:
- Provider adapters in `packages/core/src/integrations/`
- Unified interface for all providers
- Streaming support
- Error handling and retries

### MCP Servers

**Purpose**: Extend agent capabilities with external tools

**Integration pattern**:
- MCP client in `packages/core/src/integrations/mcp/`
- Dynamic server discovery
- Tool schema validation
- Bidirectional communication

### Composio

**Purpose**: Connect to 100+ platforms with single API

**Integration pattern**:
- Composio adapter in `packages/core/src/integrations/composio/`
- OAuth flow handling
- Action execution
- Webhook support

## Security Model

### Sandboxing

- Renderer runs in sandboxed environment
- No direct Node.js access from renderer
- All privileged operations through IPC

### Command Execution

- Allowlist-based command approval
- User confirmation for sensitive operations
- Workspace path validation
- No arbitrary code execution

### Data Privacy

- All data stored locally
- No telemetry by default
- API keys stored securely
- Memory data encrypted at rest (optional)

### Integration Security

- OAuth tokens stored in system keychain
- API keys never exposed to renderer
- Rate limiting on external calls
- Input validation on all boundaries

## Performance Considerations

### Context Management

- Efficient context window utilization
- Smart truncation strategies
- Caching of frequently accessed data
- Lazy loading of large resources

### Search Optimization

- Inverted index for full-text search
- Incremental indexing
- Query result caching
- Fuzzy matching optimization

### Memory Efficiency

- Streaming responses to avoid buffering
- Incremental graph updates
- Periodic memory consolidation
- Resource cleanup on idle

## Extension Points

### Adding New Features

1. Define contracts in `packages/shared`
2. Implement logic in `packages/core`
3. Add IPC handlers in `apps/main`
4. Create UI in `apps/renderer`

### Adding New Integrations

1. Create adapter in `packages/core/src/integrations/`
2. Implement standard interface
3. Add configuration schema
4. Register with tool orchestrator

### Adding New Skills

1. Create skill file in `~/Flazz/skills/`
2. Define parameters and description
3. Implement execution logic
4. Test with agent

## Further Reading

- [Development Setup](../development/setup.md)
- [Contributing Guide](../../CONTRIBUTING.md)
- [Build and Release](../development/building.md)
- [Agent Guide](../../AGENTS.md)
