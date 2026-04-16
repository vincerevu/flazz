# Agent Runtime - Context Builder

## Overview

The Context Builder is responsible for intelligently selecting and formatting context for agent execution. It implements a 2-layer memory architecture:

1. **Hot Memory** (Layer 1) - Always included, free via prefix cache
2. **Cold Storage** (Layer 2) - Conditionally included when needed

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  CONTEXT BUILDER                         │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Hot Memory   │  │   Skills     │  │   Memory     │  │
│  │ (Always)     │  │ (Relevant)   │  │ (Conditional)│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         └─────────────────┴─────────────────┘           │
│                           │                             │
│                           ▼                             │
│                  Unified Context                        │
│                           │                             │
└───────────────────────────┼─────────────────────────────┘
                            │
                            ▼
                    Agent System Prompt
```

## Components

### ContextBuilder

Main class that orchestrates context building.

**Methods:**
- `buildContext(query, options)` - Build context array for agent

**Options:**
- `includeMemory` (default: true) - Include hot memory
- `includeSkills` (default: true) - Include relevant skills
- `includeMemorySearch` (default: false) - Include memory search results
- `memorySearchLimit` (default: 5) - Max memory results

### Memory Integration

Hot memory is always included in context (unless explicitly disabled). This provides:
- Agent notes (MEMORY.md) - 2,200 chars
- User profile (USER.md) - 1,375 chars
- Free via prefix caching (frozen snapshot pattern)

### Skills Integration

Skills are loaded based on relevance to the query:
- Keyword matching against skill name, description, tags, category
- Only relevant skills are included
- Formatted with clear section headers

### Memory Search Integration

Memory search is conditionally included:
- Only when `includeMemorySearch: true`
- Uses MemorySearchProvider for structured search
- Returns preview + path (agent can read full content if needed)
- Configurable limit (default: 5 results)

## Usage

### In Agent Runtime

```typescript
import { contextBuilder } from '../../di/container.js';

// Build context for agent
const contextParts = await contextBuilder.buildContext(query, {
  includeMemory: true,
  includeSkills: true,
  includeMemorySearch: false,
});

// Inject into system prompt
const contextSection = contextParts.join('\n\n');
const systemPrompt = `${agent.instructions}\n\n${contextSection}`;
```

### Context Options

**Default (Copilot agent):**
```typescript
{
  includeMemory: true,    // Always include hot memory
  includeSkills: true,    // Include relevant skills
  includeMemorySearch: false // Don't auto-search memory
}
```

**Memory-heavy agent:**
```typescript
{
  includeMemory: true,
  includeSkills: true,
  includeMemorySearch: true,  // Enable memory search
  memorySearchLimit: 10       // More results
}
```

**Minimal context:**
```typescript
{
  includeMemory: true,
  includeSkills: false,
  includeMemorySearch: false
}
```

## Context Format

### Memory Section

```
══════════════════════════════════════════════
MEMORY (your personal notes) [45% — 990/2,200 chars]
══════════════════════════════════════════════
§ User prefers TypeScript with strict mode
§ Project uses pnpm for package management
§ Flazz architecture: renderer → main → core

══════════════════════════════════════════════
USER PROFILE (who the user is) [30% — 412/1,375 chars]
══════════════════════════════════════════════
§ Name: John (prefers casual tone)
§ Role: Senior Engineer at Acme Corp
§ Timezone: PST (UTC-8)
```

### Skills Section

```
══════════════════════════════════════════════
AVAILABLE SKILLS (2)
══════════════════════════════════════════════

## Skill: debug-typescript

---
name: debug-typescript
description: Debug TypeScript compilation errors
category: coding
tags: [typescript, debugging, errors]
---

When encountering TypeScript errors:
1. Read the error message carefully
2. Check type definitions
3. Use type assertions if needed
...

---

## Skill: setup-react-project

---
name: setup-react-project
description: Set up a new React project with TypeScript
category: coding
tags: [react, typescript, setup]
---

Steps to create a new React + TypeScript project:
1. Run: npm create vite@latest
2. Select React + TypeScript template
...

---
```

### Memory Section

```
══════════════════════════════════════════════
RELEVANT MEMORY NOTES (3 notes)
══════════════════════════════════════════════

### TypeScript Best Practices
Path: memory/Topics/typescript-best-practices.md
Preview: Use strict mode, avoid any, prefer interfaces over types...

### Flazz Architecture
Path: memory/Projects/flazz-architecture.md
Preview: Flazz is organized into layers: renderer, main, core, shared...

### React Performance Tips
Path: memory/Topics/react-performance.md
Preview: Use React.memo, useMemo, useCallback for optimization...

Use workspace-readFile to read full content if needed.
```

## Performance

### Memory
- **Load time:** <10ms (cached)
- **Cost:** Free (prefix cache)
- **Size:** ~3.5KB (2,200 + 1,375 chars)

### Skills
- **Load time:** ~50ms per skill
- **Cost:** Free (file-based)
- **Size:** Variable (typically 1-5KB per skill)

### Memory Search
- **Load time:** ~100ms (search)
- **Cost:** Included in prompt tokens
- **Size:** Variable (preview only, ~500 chars per result)

## Best Practices

### When to Include Memory
- **Always** for copilot agent (user preferences, environment facts)
- **Optional** for specialized agents (note_creation, email-draft)

### When to Include Skills
- **Always** for copilot agent (procedural memory)
- **Selective** for specialized agents (only relevant skills)

### When to Include Memory Search
- **Never by default** (too expensive)
- **Only when needed** (user asks about past notes, historical context)
- **Use search tool instead** (let agent decide when to search)

## Integration with Memory Archiver

When memory gets full, use MemoryArchiver to move content into durable workspace notes:

```typescript
import { memoryArchiver } from '../../di/container.js';

// Archive agent memory into a durable note
await memoryArchiver.archive('agent', 'Projects/my-project.md');

// Memory is cleared, content is stored in workspace memory
// Graph is updated automatically
```

## Future Enhancements

### Semantic Search for Skills
Replace keyword matching with embedding-based semantic search:
- More accurate skill selection
- Better handling of synonyms
- Relevance scoring

### Graph Traversal
Add graph traversal for related concepts:
- Follow edges from query entities
- Include connected notes
- Depth-limited traversal

### Context Caching Strategy
Optimize caching for different context types:
- Memory: Always cached (frozen snapshot)
- Skills: Cache per-skill (stable content)
- Memory search: No caching (dynamic search)

### Adaptive Context Selection
Dynamically adjust context based on:
- Token budget
- Query complexity
- Agent type
- User preferences
