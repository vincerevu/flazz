# Memory System

Flazz's memory system enables the AI to learn from your interactions and remember context across sessions.

## Overview

The memory system consists of three layers:

1. **Short-term Memory** - Current conversation context
2. **Graph Memory** - Knowledge graph of facts and relationships
3. **Behavioral Learning** - Pattern recognition and preferences

## How Memory Works

### Automatic Learning

Flazz automatically learns from your conversations:

```
You: My favorite programming language is Python

[Flazz stores: User prefers Python]

Later...

You: Suggest a web framework

Flazz: Since you prefer Python, I recommend Django or Flask
```

### Memory Types

**Factual Memory:**
- Personal information
- Preferences
- Project details
- Technical knowledge

**Behavioral Memory:**
- Communication style
- Common tasks
- Workflow patterns
- Error patterns

**Contextual Memory:**
- Current project
- Recent topics
- Active goals
- Related documents

## Graph Memory

### What is Graph Memory?

A knowledge graph that stores:
- **Nodes**: Concepts, entities, facts
- **Edges**: Relationships between nodes
- **Properties**: Attributes and metadata

### Viewing the Graph

Access memory graph:

1. Click "Memory" tab
2. Select "Graph View"
3. Explore nodes and connections

**Features:**
- Interactive visualization
- Search nodes
- Filter by type
- Export graph

### Graph Structure

**Node Types:**
- Person (you, team members)
- Project (your projects)
- Concept (technical concepts)
- Preference (your preferences)
- Task (recurring tasks)
- Document (workspace files)

**Relationship Types:**
- `PREFERS` - User preferences
- `WORKS_ON` - Project relationships
- `USES` - Tool/technology usage
- `RELATED_TO` - Concept connections
- `DEPENDS_ON` - Dependencies

### Example Graph

```
[You]
  ├─ PREFERS → [Python]
  ├─ WORKS_ON → [Flazz Project]
  │   ├─ USES → [TypeScript]
  │   ├─ USES → [React]
  │   └─ RELATED_TO → [Electron]
  └─ PREFERS → [Dark Theme]
```

## Behavioral Learning

### Pattern Recognition

Flazz learns your patterns:

**Code Style:**
```
You consistently use:
- 2-space indentation
- Single quotes
- Semicolons

Flazz adapts code generation to match
```

**Communication:**
```
You prefer:
- Concise explanations
- Code examples
- Step-by-step guides

Flazz adjusts response style
```

**Workflow:**
```
You often:
1. Ask for code
2. Request tests
3. Ask for documentation

Flazz proactively offers these
```

### Learning Rate

Control how quickly Flazz learns:

Settings → Memory → Learning Rate

- **Low (0.1)**: Slow, cautious learning
- **Medium (0.5)**: Balanced (default)
- **High (0.9)**: Fast, aggressive learning

### Confidence Threshold

Minimum confidence before applying learned behavior:

Settings → Memory → Confidence Threshold

- **Low (0.3)**: Apply uncertain patterns
- **Medium (0.7)**: Balanced (default)
- **High (0.9)**: Only apply certain patterns

## Memory Management

### Viewing Memory

**All Memory:**
1. Memory tab → "All Memories"
2. Browse by category
3. Search memories

**Recent Memory:**
1. Memory tab → "Recent"
2. See what Flazz learned recently

**By Topic:**
1. Memory tab → "Topics"
2. Filter by project, concept, etc.

### Editing Memory

**Correct Memory:**
1. Find memory in list
2. Click "Edit"
3. Update information
4. Save

**Delete Memory:**
1. Find memory
2. Click "Delete"
3. Confirm

**Add Memory Manually:**
1. Memory tab → "Add Memory"
2. Enter information
3. Set relationships
4. Save

### Memory Privacy

**What Flazz Remembers:**
- ✅ Conversation content
- ✅ Preferences you state
- ✅ Project information
- ✅ Technical knowledge
- ❌ API keys or passwords
- ❌ Sensitive personal data (unless you explicitly share)

**Control:**
- All memory stored locally
- Never shared with AI providers
- Can be deleted anytime
- Export for backup

## Context Window

### How Context Works

Each conversation has a context window:

```
[System Prompt]
[Relevant Memories]
[Previous Messages]
[Current Message]
```

### Context Limits

**Token Limits:**
- GPT-4: 128K tokens (~96K words)
- Claude 3: 200K tokens (~150K words)
- Gemini: 1M tokens (~750K words)

**Flazz Management:**
- Automatically summarizes old messages
- Keeps relevant memories
- Removes redundant context
- Prioritizes recent messages

### Manual Context Control

**Clear Context:**
```
/clear
```
Removes old messages, keeps memories

**Reset Chat:**
```
/reset
```
Clears everything, starts fresh

**Include Specific Memory:**
```
@memory:project-details
```

## Memory Configuration

### Settings

Settings → Memory

**Enable/Disable:**
- Graph Memory
- Behavioral Learning
- Auto-summarization

**Retention:**
- Short-term: 7 days
- Medium-term: 30 days
- Long-term: Forever

**Storage:**
- Max nodes: 10,000
- Max relationships: 50,000
- Prune old nodes: Yes/No

### Advanced Configuration

```json
{
  "memory": {
    "graphMemory": {
      "enabled": true,
      "maxNodes": 10000,
      "maxEdges": 50000,
      "pruneThreshold": 0.1,
      "retentionDays": 90
    },
    "behavioralLearning": {
      "enabled": true,
      "learningRate": 0.5,
      "minConfidence": 0.7,
      "adaptationSpeed": "medium"
    },
    "contextWindow": {
      "maxMessages": 50,
      "maxTokens": 100000,
      "summarizationThreshold": 0.8
    }
  }
}
```

## Memory in Action

### Example 1: Project Context

```
Day 1:
You: I'm building a React app with TypeScript

[Flazz stores: Project = React + TypeScript]

Day 2:
You: How do I handle state?

Flazz: For your React TypeScript project, I recommend...
```

### Example 2: Preferences

```
You: I prefer functional components over class components

[Flazz stores: Preference = Functional components]

Later:
You: Create a button component

Flazz: [Generates functional component]
```

### Example 3: Workflow

```
Pattern detected:
1. You ask for code
2. You ask for tests
3. You ask for docs

Next time:
You: Create a user service

Flazz: Here's the service, tests, and documentation
```

## Memory Export & Import

### Export Memory

Backup your memory:

1. Memory tab → Settings
2. Click "Export Memory"
3. Choose format: JSON, CSV
4. Save file

**Use cases:**
- Backup before reset
- Transfer to new machine
- Share with team (carefully!)

### Import Memory

Restore from backup:

1. Memory tab → Settings
2. Click "Import Memory"
3. Select file
4. Review and confirm

**Options:**
- Merge with existing
- Replace existing
- Import specific categories

## Troubleshooting

### Memory Not Working

**Check:**
1. Memory is enabled (Settings → Memory)
2. Sufficient disk space
3. No corruption (run integrity check)

**Fix:**
```
Memory tab → Settings → Repair Memory
```

### Incorrect Memories

**Flazz remembers wrong information:**

1. Find incorrect memory
2. Edit or delete
3. Provide correction in chat

**Prevent:**
- Be explicit when stating facts
- Correct mistakes immediately
- Review memories periodically

### Memory Too Large

**Symptoms:**
- Slow performance
- High disk usage

**Solutions:**
1. Prune old memories
2. Reduce retention period
3. Delete unused projects

```
Memory tab → Settings → Prune Memories
```

### Context Overflow

**Error:** "Context window exceeded"

**Solutions:**
- Start new chat
- Clear old messages: `/clear`
- Reduce memory inclusion
- Use model with larger context

## Best Practices

### Effective Memory Usage

**1. Be Explicit:**
```
❌ "I like this"
✅ "I prefer TypeScript over JavaScript"
```

**2. Correct Mistakes:**
```
You: Actually, I use Python 3.11, not 3.9
Flazz: [Updates memory]
```

**3. Organize by Project:**
```
/project my-app
Now all memories tagged with project
```

**4. Review Periodically:**
- Check memories monthly
- Remove outdated info
- Update preferences

### Privacy Tips

**Don't Share:**
- Passwords or API keys
- Sensitive personal data
- Confidential business info

**Do Share:**
- Preferences
- Project details
- Technical knowledge
- Workflow patterns

### Performance Tips

**Keep Memory Lean:**
- Delete unused projects
- Prune old memories
- Limit retention period

**Optimize Context:**
- Clear old messages
- Use summarization
- Reference specific memories

## Advanced Topics

- [Graph Memory Architecture](./graph-memory.md) - Technical details
- [Behavioral Learning Algorithm](./behavioral-learning.md) - How learning works
- [Context Optimization](./context-optimization.md) - Advanced techniques

## Related Features

- [Chat](../chat/README.md) - How memory enhances chat
- [Skills](../skills/README.md) - Memory-aware skills
- [Workspace](../workspace/README.md) - Memory + knowledge base

## Next Steps

- [Graph Memory](./graph-memory.md) - Deep dive into graph
- [Behavioral Learning](./behavioral-learning.md) - Understanding patterns
- [Skills](../skills/README.md) - Create memory-aware skills

## Support

- [FAQ](../../faq.md) - Common questions
- [Troubleshooting](../../troubleshooting.md) - Fix issues
- [GitHub Issues](https://github.com/yourusername/flazz/issues) - Report bugs
