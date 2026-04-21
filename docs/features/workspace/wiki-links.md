# Wiki Links

Learn how to link notes together using wiki-style links in Flazz.

## Overview

Wiki links allow you to:
- Connect related notes
- Build a knowledge graph
- Navigate between notes
- Track relationships

## Basic Syntax

### Simple Link

```markdown
[[Note Name]]
```

Creates a link to "Note Name.md"

### Link with Alias

```markdown
[[Note Name|display text]]
```

Shows "display text" but links to "Note Name"

### Link to Heading

```markdown
[[Note Name#Heading]]
```

Links to specific heading in note

### Link to Block

```markdown
[[Note Name^block-id]]
```

Links to specific block in note

## Creating Links

### Type to Link

1. Type `[[`
2. Start typing note name
3. Select from autocomplete
4. Press Enter

### Link Existing Text

1. Select text
2. Press `Cmd/Ctrl + K`
3. Type note name
4. Press Enter

### Create New Note from Link

1. Type `[[New Note Name]]`
2. Click the link
3. New note is created automatically

## Link Types

### Internal Links

Link to notes in workspace:

```markdown
See [[Project Documentation]] for details.
```

### External Links

Regular markdown links:

```markdown
See [Google](https://google.com) for search.
```

### Relative Links

Link to files:

```markdown
![Image](./images/screenshot.png)
[PDF](./files/document.pdf)
```

## Backlinks

### Automatic Backlinks

Flazz tracks all links to a note:

```markdown
# My Note

## Backlinks
- [[Daily/2024-03-15]] - Mentioned here
- [[Project A]] - Referenced in project
```

### View Backlinks

- Open note
- See "Backlinks" section
- Click to navigate

### Unlinked Mentions

Flazz also finds unlinked mentions:

```markdown
## Unlinked Mentions
- "My Note" mentioned in [[Other Note]]
```

## Link Graph

### Visualize Connections

View your knowledge graph:

1. Click graph icon
2. See all notes and connections
3. Click nodes to navigate

### Graph Features

- **Node size**: Based on number of links
- **Connection strength**: Based on link frequency
- **Clusters**: Related notes grouped together
- **Filters**: Filter by tag, folder, date

## Advanced Features

### Link Aliases

Use different text for link:

```markdown
Read about [[React Hooks|hooks in React]].
```

### Link to Sections

Link to specific sections:

```markdown
See [[Architecture#Database Design]] for schema.
```

### Embed Notes

Embed entire note content:

```markdown
![[Meeting Notes]]
```

### Embed Sections

Embed specific section:

```markdown
![[Architecture#Database Design]]
```

### Embed Blocks

Embed specific block:

```markdown
![[Daily Note^important-task]]
```

## Link Management

### Find Broken Links

Settings → Workspace → Check Links

Shows:
- Broken links (target doesn't exist)
- Orphaned notes (no links to/from)
- Duplicate links

### Fix Broken Links

1. Click broken link
2. Choose action:
   - Create missing note
   - Change link target
   - Remove link

### Rename Notes

When renaming notes:
- All links update automatically
- Backlinks preserved
- No broken links

### Move Notes

When moving notes:
- Links update automatically
- Relative paths adjusted
- Backlinks preserved

## Use Cases

### Project Documentation

```markdown
# Project A

## Overview
See [[Project A/Architecture]] for system design.

## Tasks
Current tasks in [[Project A/Tasks]].

## Team
Team members: [[People/Alice]], [[People/Bob]]
```

### Learning Notes

```markdown
# Machine Learning

## Fundamentals
- [[Linear Regression]]
- [[Neural Networks]]
- [[Deep Learning]]

## Applications
- [[Computer Vision]]
- [[Natural Language Processing]]
```

### Daily Notes

```markdown
# 2024-03-15

## Meetings
- Met with [[People/Sarah]] about [[Projects/Q1 Integration]]
- Discussed [[Topics/API Design]]

## Tasks
- [ ] Review [[Projects/Q1 Integration/PR-123]]
```

## Best Practices

### Consistent Naming

Use consistent note names:
- ✅ "React Hooks"
- ❌ "react hooks", "React hooks", "Hooks (React)"

### Meaningful Links

Link when it adds value:
- ✅ "See [[Architecture]] for system design"
- ❌ "The [[project]] uses [[React]]" (too many links)

### Bidirectional Links

Create links in both directions:

```markdown
# Note A
Related: [[Note B]]

# Note B
Related: [[Note A]]
```

### Link Context

Provide context for links:
- ✅ "See [[Architecture#Database]] for schema design"
- ❌ "See [[Architecture]]"

## Keyboard Shortcuts

- `[[`: Start wiki link
- `Cmd/Ctrl + K`: Create link from selection
- `Cmd/Ctrl + Click`: Open link in new pane
- `Alt + Click`: Open link in new window

## Troubleshooting

### Link Not Working

If link doesn't work:
1. Check note exists
2. Verify spelling
3. Check file extension
4. Try absolute path

### Autocomplete Not Showing

If autocomplete doesn't appear:
1. Type more characters
2. Check note exists
3. Restart Flazz
4. Rebuild search index

### Backlinks Not Updating

If backlinks don't update:
1. Save the note
2. Wait a moment
3. Refresh backlinks
4. Rebuild graph

## Further Reading

- [Knowledge Base](knowledge-base.md)
- [Search Guide](search.md)
- [Graph Memory](../memory/graph-memory.md)
