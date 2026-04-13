# Memory System

Hot memory system for Flazz AI agent with bounded memory and automatic curation.
Implementation matches Hermes AI architecture for maximum compatibility and proven patterns.

## Overview

The memory system provides a lightweight, always-in-context memory layer for the AI agent. It consists of two sections:

- **Agent Memory** (2,200 chars): Agent's own notes, learnings, and task context
- **User Profile** (1,375 chars): User preferences, habits, and profile information

Memory is automatically curated when it exceeds the character limit, keeping only the most recent entries.

## Key Features (Hermes-Compatible)

✅ **Frozen Snapshot Pattern** - System prompt stays frozen entire session (preserves prefix cache)
✅ **Multiline Entries** - Entries can span multiple lines using `\n§\n` delimiter
✅ **Substring Matching** - Replace/remove entries by substring (no IDs needed)
✅ **Atomic Writes** - Temp file + rename for concurrent-safe writes
✅ **Auto-Deduplication** - Duplicate entries automatically removed on load
✅ **Bounded Memory** - Character limits enforced (2,200 + 1,375)

## Architecture

```
┌─────────────────┐
│  Memory Tool    │  ← Agent interacts via single tool
└────────┬────────┘
         │
┌────────▼────────┐
│ MemoryManager   │  ← Frozen snapshot + bounded memory
└────────┬────────┘
         │
┌────────▼────────┐
│   MemoryRepo    │  ← Atomic file I/O (MEMORY.md, USER.md)
└─────────────────┘
```

## Components

### MemoryRepo

File-based storage for memory sections.

**Location**: `~/Flazz/memory/`
- `MEMORY.md` - Agent memory (your notes)
- `USER.md` - User profile

**Format** (Hermes-compatible):
```markdown
§
Entry 1 content
Can be multiline
§
Entry 2 content
Can also be multiline
§
```

**Delimiter**: `\n§\n` (newline + § + newline)

### MemoryManager

Manages bounded memory with frozen snapshot pattern.

**Features**:
- Frozen snapshot captured at session start
- Snapshot never changes mid-session (preserves prefix cache)
- Tool writes update files on disk immediately
- Next session loads fresh snapshot
- Substring matching for replace/remove
- Auto-deduplication

### Memory Tool

Single tool with multiple actions (Hermes API):

```typescript
memory({
  action: "add",
  target: "memory", // or "user"
  content: "Project: Acme Integration. Contact: John Smith."
})

memory({
  action: "replace",
  target: "memory",
  old_text: "John Smith",
  content: "Project: Acme Integration. Contact: Jane Doe."
})

memory({
  action: "remove",
  target: "memory",
  old_text: "Acme Integration"
})
```

## Usage

### Adding Memory

```typescript
await memoryManager.add('agent', 'User prefers TypeScript over JavaScript');
// Returns: { success: true, message: "Entry added.", usage: "15% — 45/2,200 chars" }
```

### Replacing Memory

```typescript
await memoryManager.replace('agent', 'TypeScript', 'User prefers TypeScript with strict mode');
// Finds entry containing "TypeScript" and replaces it
```

### Removing Memory

```typescript
await memoryManager.remove('agent', 'TypeScript');
// Finds and removes entry containing "TypeScript"
```

### Getting Context (System Prompt)

```typescript
const context = await memoryManager.getContext();
// Returns frozen snapshot (never changes mid-session)
```

## Configuration

```typescript
const config = {
  agentMaxChars: 2200,     // Max chars for agent memory
  userMaxChars: 1375,      // Max chars for user memory
  delimiter: '\n§\n',      // Entry delimiter (Hermes format)
};
```

## Frozen Snapshot Pattern

**Critical for prefix cache optimization:**

```
Session Start:
1. Load memory files from disk
2. Build snapshot string
3. Freeze snapshot (never changes)
4. Inject into system prompt

Mid-Session:
- Tool calls update files on disk
- Snapshot stays frozen
- Prefix cache remains valid

Next Session:
- Load fresh snapshot from updated files
- Freeze new snapshot
- Repeat cycle
```

**Benefits:**
- Prefix cache valid entire session
- Huge cost savings (free tokens)
- Memory persists immediately (durable)
- No mid-session context changes

## Substring Matching

**Replace/remove by substring (no IDs needed):**

```typescript
// User: "Replace the entry about Python"
await memoryManager.replace('agent', 'Python', 'Python 3.12 installed');
// Finds entry containing "Python" and replaces it

// Multiple matches?
// Returns error: "Multiple entries matched 'Python'. Be more specific."

// All matches identical?
// Replaces first one (deduplication)
```

## Automatic Curation

When memory exceeds limit:

1. Keep entries from newest to oldest
2. Stop when limit reached
3. Discard older entries
4. Atomic write with curated content

## Integration

Memory system is initialized in `packages/core/src/di/container.ts`:

```typescript
const memoryRepo = new MemoryRepo(WorkDir);
const memoryManager = new MemoryManager(memoryRepo, config);
await memoryManager.initialize(); // Capture frozen snapshot
setMemoryManager(memoryManager);
```

Memory tool is registered in `packages/core/src/application/lib/builtin-tools.ts`.

## Cost Optimization

- Hot memory always in context (free via prefix cache)
- Frozen snapshot = stable prefix cache entire session
- Bounded size prevents context bloat
- Estimated cost: $0.02 per conversation (87% reduction vs email sync)

## Hermes AI Compatibility

This implementation matches Hermes AI patterns:

| Feature | Hermes | Flazz | Match |
|---------|--------|-------|-------|
| Character limits | 2,200 + 1,375 | 2,200 + 1,375 | ✅ |
| Delimiter | `\n§\n` | `\n§\n` | ✅ |
| Multiline entries | Yes | Yes | ✅ |
| Frozen snapshot | Yes | Yes | ✅ |
| Substring matching | Yes | Yes | ✅ |
| Atomic writes | Yes | Yes | ✅ |
| Auto-dedupe | Yes | Yes | ✅ |
| Tool API | add/replace/remove | add/replace/remove | ✅ |

## Future Enhancements (Phase 3)

- Archive old memories to LLM wiki
- Semantic search across archived memories
- Memory graph visualization
- Automatic memory importance scoring
- Security scanning for injection patterns
