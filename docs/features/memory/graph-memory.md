# Graph Memory

Flazz's graph memory system automatically builds a knowledge graph from your interactions, creating a navigable network of interconnected information.

## Overview

Unlike traditional note-taking where you manually create links, Flazz automatically:
- Extracts entities (people, organizations, projects, topics)
- Creates bidirectional relationships
- Builds a navigable graph structure
- Updates connections as you interact

## How It Works

### Automatic Entity Extraction

When you interact with Flazz, it automatically identifies and extracts:

**People**
```
Email from "Sarah Chen" → Creates:
  People/Sarah Chen.md
```

**Organizations**
```
Mention of "Acme Corp" → Creates:
  Organizations/Acme Corp.md
```

**Projects**
```
Discussion about "Q1 Integration" → Creates:
  Projects/Q1 Integration.md
```

**Topics**
```
Conversation about "Machine Learning" → Creates:
  Topics/Machine Learning.md
```

### Bidirectional Linking

All entities are automatically linked:

```markdown
# People/Sarah Chen.md

## Relationships
- Works at: [[Organizations/Acme Corp]]
- Involved in: [[Projects/Q1 Integration]]
- Expertise: [[Topics/Machine Learning]]

## Recent Interactions
- 2024-03-15: Discussed API design
- 2024-03-10: Code review meeting
```

```markdown
# Projects/Q1 Integration.md

## Team Members
- [[People/Sarah Chen]] - Lead Developer
- [[People/John Doe]] - Product Manager

## Related Topics
- [[Topics/API Design]]
- [[Topics/Microservices]]
```

### Graph Structure

The knowledge graph is stored as markdown files with wiki-style links:

```
~/Flazz/memory/
├── People/
│   ├── Sarah Chen.md
│   └── John Doe.md
├── Organizations/
│   └── Acme Corp.md
├── Projects/
│   └── Q1 Integration.md
└── Topics/
    ├── Machine Learning.md
    └── API Design.md
```

## Viewing the Graph

### Graph Visualization

Open the graph view to see your knowledge network:

1. Click the graph icon in the sidebar
2. See all entities and their connections
3. Click nodes to navigate
4. Zoom and pan to explore

### Graph Features

**Node Types**
- People (blue circles)
- Organizations (green squares)
- Projects (orange diamonds)
- Topics (purple hexagons)

**Connection Types**
- Works at (solid line)
- Involved in (dashed line)
- Related to (dotted line)
- Mentioned with (thin line)

**Interactive Navigation**
- Click node to open entity page
- Hover to see quick info
- Double-click to expand connections
- Right-click for context menu

## Entity Pages

Each entity has a dedicated page with:

### Metadata
```markdown
---
type: person
created: 2024-03-15
last_updated: 2024-03-20
confidence: 0.95
---
```

### Relationships
```markdown
## Relationships
- Works at: [[Organizations/Acme Corp]]
- Reports to: [[People/Jane Smith]]
- Collaborates with: [[People/John Doe]]
```

### Interaction History
```markdown
## Recent Interactions
- 2024-03-20: Discussed deployment strategy
- 2024-03-18: Code review for PR #123
- 2024-03-15: Sprint planning meeting
```

### Extracted Information
```markdown
## Key Information
- Role: Senior Software Engineer
- Email: sarah.chen@acme.com
- Timezone: PST
- Preferences: Prefers async communication
```

## Graph Operations

### Search the Graph

Find entities quickly:

```
Cmd/Ctrl + K → Type entity name
```

Or use graph search:
```
@sarah → Shows all people named Sarah
#project → Shows all projects
$acme → Shows all organizations with "acme"
```

### Navigate Relationships

From any entity page:
- Click links to navigate to related entities
- Use breadcrumbs to go back
- See relationship strength (frequent vs rare)

### Filter the Graph

Filter by:
- Entity type (people, organizations, projects, topics)
- Date range (last week, month, year)
- Relationship type
- Confidence level

## Memory Consolidation

Flazz periodically consolidates memory:

### Duplicate Detection
```
"Sarah Chen" and "S. Chen" → Merged into one entity
```

### Relationship Strengthening
```
Frequent mentions → Stronger connection
Rare mentions → Weaker connection
```

### Confidence Scoring
```
High confidence: Explicitly mentioned multiple times
Medium confidence: Inferred from context
Low confidence: Tentative extraction
```

## Privacy & Control

### Entity Management

**Edit entities**:
1. Open entity page
2. Click edit icon
3. Modify information
4. Save changes

**Merge entities**:
1. Select two entities
2. Click merge
3. Choose primary entity
4. Confirm merge

**Delete entities**:
1. Open entity page
2. Click delete icon
3. Confirm deletion
4. All links are removed

### Disable Graph Building

If you don't want automatic graph building:

1. Settings → Memory → Graph Memory
2. Toggle "Enable automatic graph building"
3. Existing graph remains, but no new entities are extracted

## Advanced Features

### Custom Entity Types

Create custom entity types:

```markdown
# ~/Flazz/memory/.config/entity-types.json
{
  "custom_types": [
    {
      "name": "Book",
      "icon": "📚",
      "color": "#FF6B6B",
      "fields": ["author", "isbn", "genre"]
    }
  ]
}
```

### Relationship Rules

Define custom relationship rules:

```markdown
# ~/Flazz/memory/.config/relationship-rules.json
{
  "rules": [
    {
      "from": "Person",
      "to": "Organization",
      "type": "works_at",
      "bidirectional": true
    }
  ]
}
```

### Export Graph

Export your knowledge graph:

**GraphML format** (for Gephi, Cytoscape):
```bash
Settings → Memory → Export → GraphML
```

**JSON format** (for custom processing):
```bash
Settings → Memory → Export → JSON
```

**Markdown archive** (human-readable):
```bash
# Already in ~/Flazz/memory/
# Just copy the folder
```

## Use Cases

### Personal CRM

Track relationships automatically:
- Who you've talked to recently
- What you discussed
- Follow-up items
- Connection strength

### Project Management

See project relationships:
- Team members involved
- Related projects
- Key topics
- Timeline of activities

### Knowledge Management

Build a personal knowledge base:
- Topics you've learned
- Resources you've used
- Connections between concepts
- Evolution of understanding

### Research

Track research progress:
- Papers you've read
- Authors you follow
- Concepts you're exploring
- Connections between ideas

## Best Practices

### Let It Build Naturally

Don't force structure. Let the graph build organically from your interactions.

### Review Periodically

Check the graph weekly to:
- Merge duplicates
- Correct misidentifications
- Add missing information

### Use Consistent Names

Help Flazz by using consistent names:
- "Sarah Chen" not "Sarah" or "S. Chen"
- "Acme Corp" not "Acme" or "Acme Corporation"

### Add Context

When mentioning entities, add context:
- "Sarah Chen from Acme Corp" (better)
- "Sarah" (less clear)

## Troubleshooting

### Entity not detected

If Flazz doesn't detect an entity:
- Mention it more explicitly
- Add it manually
- Check confidence threshold in settings

### Wrong relationships

If relationships are incorrect:
- Edit the entity page
- Remove incorrect links
- Add correct links manually

### Duplicate entities

If you see duplicates:
- Use the merge feature
- Settings → Memory → Merge duplicates
- Or merge manually

## Further Reading

- [Memory System Overview](README.md)
- [Behavioral Learning](behavioral-learning.md)
- [Workspace Guide](../workspace/README.md)
