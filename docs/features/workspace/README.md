# Workspace

Your personal knowledge base integrated with AI.

## Overview

The Workspace is where you:
- Store notes and documents
- Organize knowledge
- Link related content
- Search everything instantly
- Reference in chat

## Getting Started

### Creating Notes

**New Note:**
- Click "New Note" button
- Press `Ctrl+Alt+N` / `Cmd+Opt+N`
- Type `/note` in chat

**From Chat:**
```
You: Save this to my workspace

Flazz: What should I name it?

You: "Project Ideas"

Flazz: [Creates note with chat content]
Note created: [[Project Ideas]]
```

### Note Format

Notes support Markdown:

```markdown
# My Note

## Section 1

Regular text with **bold** and *italic*.

- Lists
- Items

`code inline`

```python
# Code blocks
def hello():
    print("Hello")
```

Links: [External](https://example.com)
Wiki links: [[Other Note]]
```

## Wiki Links

### What are Wiki Links?

Connect notes together:

```markdown
I'm working on [[Project X]] using [[TypeScript]].
See also: [[Architecture Decisions]]
```

**Benefits:**
- Easy navigation
- Discover connections
- Build knowledge graph
- Context for AI

### Creating Links

**Syntax:**
```markdown
[[Note Name]]
[[Note Name|Display Text]]
[[folder/Note Name]]
```

**Auto-complete:**
- Type `[[`
- Start typing note name
- Select from suggestions
- Press Enter

**Create New:**
```markdown
[[New Note That Doesn't Exist]]
```
Click link → Creates new note

### Backlinks

See what links to current note:

1. Open note
2. Sidebar shows "Backlinks"
3. Click to navigate

**Example:**
```
Note: TypeScript
Backlinks:
- [[Project X]] mentions this
- [[Learning Resources]] mentions this
- [[Code Standards]] mentions this
```

## Organization

### Folders

Organize notes in folders:

```
Workspace/
├── Projects/
│   ├── Project X/
│   │   ├── Overview.md
│   │   ├── Architecture.md
│   │   └── Tasks.md
│   └── Project Y/
├── Learning/
│   ├── TypeScript.md
│   └── React.md
└── Personal/
    └── Ideas.md
```

**Create Folder:**
1. Right-click in workspace
2. "New Folder"
3. Name it

**Move Notes:**
- Drag and drop
- Right-click → "Move to"
- Cut and paste

### Tags

Tag notes for easy filtering:

```markdown
---
tags: [typescript, tutorial, beginner]
---

# TypeScript Basics
```

**Add Tags:**
1. Edit note frontmatter
2. Or right-click → "Add Tags"

**Filter by Tag:**
- Click tag in note
- Or search: `tag:typescript`

### Favorites

Pin important notes:

1. Right-click note
2. "Add to Favorites"
3. Appears in sidebar

## Search

### Quick Search

**Open Search:**
- Press `Ctrl+K` / `Cmd+K`
- Click search icon
- Type `/search`

**Search Syntax:**
```
typescript          # Full-text search
tag:tutorial        # By tag
folder:Projects     # In folder
created:today       # By date
modified:this-week  # By modification
```

**Filters:**
- Type
- Date range
- Tags
- Folders
- Size

### Advanced Search

**Boolean Operators:**
```
typescript AND react
python OR javascript
code NOT tutorial
```

**Wildcards:**
```
type*        # Matches typescript, types, etc.
*script      # Matches typescript, javascript, etc.
```

**Regex:**
```
/function \w+\(/  # Find function definitions
```

### Search in Chat

Reference search results:

```
You: Find notes about TypeScript

Flazz: Found 5 notes:
1. [[TypeScript Basics]]
2. [[Advanced TypeScript]]
...

You: Summarize the first one

Flazz: [Reads and summarizes note]
```

## Using Workspace in Chat

### Referencing Notes

**Mention Note:**
```
You: Based on [[Project X]], what should we do next?

Flazz: [Reads Project X note]
According to your project notes...
```

**Multiple Notes:**
```
You: Compare [[Option A]] and [[Option B]]

Flazz: [Reads both notes]
Here's a comparison...
```

**Folder:**
```
You: Summarize everything in [[Projects/]]

Flazz: [Reads all notes in Projects folder]
```

### Saving to Workspace

**Save Response:**
```
Flazz: [Long response]

You: Save this as "Solution"

Flazz: [Creates note]
Saved to [[Solution]]
```

**Append to Note:**
```
You: Add this to [[Project X]]

Flazz: [Appends to existing note]
Added to [[Project X]]
```

**Create from Template:**
```
You: Create a meeting note

Flazz: [Uses template]
Created [[Meeting 2024-01-15]]
```

## Templates

### Using Templates

**Create from Template:**
1. New Note → "From Template"
2. Select template
3. Fill in placeholders
4. Save

**Templates:**
- Meeting Notes
- Project Overview
- Daily Journal
- Code Review
- Research Notes

### Creating Templates

**Template Format:**
```markdown
---
template: meeting-notes
---

# Meeting: {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}

## Agenda
- {{agenda-item-1}}
- {{agenda-item-2}}

## Notes
{{notes}}

## Action Items
- [ ] {{action-1}}
- [ ] {{action-2}}

## Next Meeting
{{next-meeting}}
```

**Variables:**
- `{{variable}}` - User input
- `{{date}}` - Current date
- `{{time}}` - Current time
- `{{user}}` - Your name

## Knowledge Graph

### Viewing the Graph

Visualize note connections:

1. Workspace → "Graph View"
2. See all notes and links
3. Interactive exploration

**Features:**
- Zoom and pan
- Filter by tag/folder
- Highlight connections
- Click to open note

### Graph Insights

**Find:**
- Orphaned notes (no links)
- Hub notes (many links)
- Clusters (related topics)
- Missing connections

**Use Cases:**
- Discover patterns
- Find gaps in knowledge
- Organize better
- Generate ideas

## Sync & Backup

### Auto-save

Notes save automatically:
- Every 30 seconds
- On focus loss
- On close

**Configure:**
```json
{
  "workspace": {
    "autoSave": true,
    "autoSaveInterval": 30000
  }
}
```

### Backup

**Automatic Backup:**
```json
{
  "workspace": {
    "backup": {
      "enabled": true,
      "interval": 86400000,  // 24 hours
      "location": "~/Flazz/backups",
      "keep": 7  // Keep 7 days
    }
  }
}
```

**Manual Backup:**
1. Workspace → Settings
2. "Create Backup"
3. Choose location
4. Save

**Restore:**
1. Workspace → Settings
2. "Restore from Backup"
3. Select backup file
4. Confirm

### Export

**Export Workspace:**
1. Workspace → Settings
2. "Export"
3. Choose format:
   - Markdown (folder structure)
   - JSON (with metadata)
   - PDF (compiled)
   - HTML (website)

**Export Single Note:**
1. Right-click note
2. "Export"
3. Choose format

## Collaboration

### Sharing Notes

**Share Link:**
1. Right-click note
2. "Share"
3. Copy link
4. Send to others

**Export for Sharing:**
- Markdown file
- PDF document
- HTML page

### Import from Others

**Import Notes:**
1. Workspace → "Import"
2. Select files
3. Choose destination folder
4. Import

**Supported Formats:**
- Markdown (.md)
- Text (.txt)
- Word (.docx)
- PDF (.pdf)
- Notion export
- Obsidian vault

## Advanced Features

### Frontmatter

Add metadata to notes:

```markdown
---
title: My Note
date: 2024-01-15
tags: [typescript, tutorial]
author: John Doe
status: draft
---

# Content here
```

**Custom Fields:**
```markdown
---
project: Project X
priority: high
due: 2024-02-01
---
```

### Embeds

Embed content in notes:

**Images:**
```markdown
![Alt text](image.png)
![Remote](https://example.com/image.png)
```

**Code:**
```markdown
```python
def hello():
    print("Hello")
```
```

**Other Notes:**
```markdown
![[Other Note]]  # Embeds entire note
```

**Files:**
```markdown
[Download](file.pdf)
```

### Custom CSS

Style your workspace:

```css
/* workspace.css */
.note {
  font-family: 'Georgia';
  line-height: 1.6;
}

.wiki-link {
  color: #0066cc;
}
```

**Apply:**
```
Settings → Workspace → Custom CSS → Load file
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New note |
| `Ctrl/Cmd + K` | Search |
| `Ctrl/Cmd + O` | Open note |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + F` | Find in note |
| `Ctrl/Cmd + [` | Navigate back |
| `Ctrl/Cmd + ]` | Navigate forward |
| `Ctrl/Cmd + \` | Toggle sidebar |

## Tips & Best Practices

### Organization

**Do:**
- Use folders for projects
- Tag for topics
- Link related notes
- Regular cleanup

**Don't:**
- Create too many folders
- Over-tag
- Duplicate content
- Ignore orphaned notes

### Naming

**Good Names:**
- "TypeScript Basics"
- "Project X - Architecture"
- "2024-01-15 Meeting Notes"

**Bad Names:**
- "Note 1"
- "Untitled"
- "asdf"

### Linking

**Link Often:**
- Related concepts
- Project notes
- References
- Follow-ups

**Review Links:**
- Check backlinks
- Update broken links
- Add missing links

## Troubleshooting

### Note Not Saving

**Check:**
1. Disk space available
2. Permissions correct
3. Auto-save enabled

**Fix:**
- Manual save: `Ctrl/Cmd + S`
- Check error log
- Restart Flazz

### Search Not Working

**Solutions:**
- Rebuild index: Settings → Workspace → Rebuild Index
- Check search syntax
- Clear cache

### Broken Links

**Find:**
```
Workspace → Tools → Find Broken Links
```

**Fix:**
- Update link target
- Delete link
- Create missing note

## Advanced Topics

- [Knowledge Base](./knowledge-base.md) - Building knowledge
- [Wiki Links](./wiki-links.md) - Advanced linking
- [Search](./search.md) - Search techniques
- [Templates](./templates.md) - Custom templates

## Related Features

- [Chat](../chat/README.md) - Reference workspace in chat
- [Memory](../memory/README.md) - Workspace + memory
- [Skills](../skills/README.md) - Workspace-aware skills

## Next Steps

- [Knowledge Base Guide](./knowledge-base.md) - Organize knowledge
- [Wiki Links Guide](./wiki-links.md) - Master linking
- [Search Guide](./search.md) - Find anything

## Support

- [FAQ](../../faq.md) - Common questions
- [Troubleshooting](../../troubleshooting.md) - Fix issues
- [GitHub Issues](https://github.com/vincerevu/flazz/issues) - Report bugs
