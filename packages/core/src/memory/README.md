# Memory System

Hot memory system for Flazz AI agent with bounded memory and automatic curation.

## Overview

The memory system provides a lightweight, always-in-context memory layer for the AI agent. It consists of two sections:

- **Agent Memory** (2,200 chars): Agent's own notes, learnings, and task context
- **User Profile** (1,375 chars): User preferences, habits, and profile information

Memory is automatically curated when it exceeds the character limit, keeping only the most recent entries.

## Architecture

```
┌─────────────────┐
│  Memory Tools   │  ← Agent interacts via tools
└────────┬────────┘
         │
┌────────▼────────┐
│ MemoryManager   │  ← Bounded memory + snapshot caching
└────────┬────────┘
         │
┌────────▼────────┐
│   MemoryRepo    │  ← File I/O (agent.md, user.md)
└─────────────────┘
```

## Components

### MemoryRepo

File-based storage for memory sections.

**Location**: `~/Flazz/memory/`
- `agent.md` - Agent memory
- `user.md` - User profile

**Format**:
```markdown
# Agent Memory

§ 2026-04-13: User prefers TypeScript over JavaScript
§ 2026-04-13: Working on memory system implementation
```

### MemoryManager

Manages bounded memory with automatic curation and snapshot caching.

**Features**:
- Bounded memory (2,200 + 1,375 chars)
- Automatic curation when limit exceeded
- Snapshot caching (5 min TTL) for prefix cache optimization
- Search functionality

### Memory Tools

Three tools for agent interaction:

1. **memory_read** - Read hot memory context
2. **memory_write** - Write to agent or user memory
3. **memory_search** - Search within memory

## Usage

### Reading Memory

```typescript
const context = await memoryManager.getContext();
// Returns formatted snapshot with both sections
```

### Writing Memory

```typescript
await memoryManager.append('agent', 'User prefers concise responses');
await memoryManager.append('user', 'Name: John, Role: Developer');
```

### Searching Memory

```typescript
const results = await memoryManager.search('TypeScript');
// Returns matching entries with timestamps
```

## Configuration

```typescript
const config = {
  agentMaxChars: 2200,  // Max chars for agent memory
  userMaxChars: 1375,   // Max chars for user memory
  delimiter: '§',       // Entry delimiter
};
```

## Snapshot Caching

Memory snapshots are cached for 5 minutes to optimize prefix caching:

- First read: Build snapshot from files
- Subsequent reads (within 5 min): Return cached snapshot
- After write: Invalidate cache

This ensures the snapshot remains stable for Claude's prefix cache while staying reasonably fresh.

## Automatic Curation

When memory exceeds the character limit:

1. Keep entries from newest to oldest
2. Stop when limit reached
3. Discard older entries
4. Rewrite file with curated content

## Integration

Memory system is initialized in `packages/core/src/di/container.ts`:

```typescript
const memoryRepo = new MemoryRepo(WorkDir);
const memoryManager = new MemoryManager(memoryRepo, config);
setMemoryManager(memoryManager);
```

Memory tools are registered in `packages/core/src/application/lib/builtin-tools.ts`.

## Cost Optimization

- Hot memory always in context (free via prefix cache)
- Bounded size prevents context bloat
- 5-minute snapshot TTL balances freshness vs cache hits
- Estimated cost: $0.02 per conversation (87% reduction vs email sync)

## Future Enhancements (Phase 3)

- Archive old memories to LLM wiki
- Semantic search across archived memories
- Memory graph visualization
- Automatic memory importance scoring
