# Knowledge Base

Organize and manage your notes in Flazz's knowledge workspace.

## Overview

Flazz provides a markdown-first knowledge base where you can:
- Create and organize notes
- Link notes together
- Search across all content
- Version control with Git
- Export to any format

## Workspace Structure

Your workspace is located at `~/Flazz/`:

```
~/Flazz/
├── workspace/          # Your notes and documents
│   ├── Daily/         # Daily notes
│   ├── Projects/      # Project documentation
│   ├── People/        # People notes
│   └── Topics/        # Topic notes
├── memory/            # AI memory and knowledge graph
│   ├── People/        # Extracted people entities
│   ├── Organizations/ # Extracted organizations
│   ├── Projects/      # Extracted projects
│   └── Skills/        # AI skills
└── .config/           # Configuration files
```

## Creating Notes

### Quick Note

Press `Cmd/Ctrl + N` or click "New Note" to create a note.

### Note Templates

Use templates for consistent structure:

```markdown
---
title: My Note
date: 2024-03-15
tags: [tag1, tag2]
---

# My Note

Content goes here...
```

### Daily Notes

Create daily notes automatically:
- Press `Cmd/Ctrl + D`
- Or: "Create daily note for today"

Format:
```markdown
# 2024-03-15

## Tasks
- [ ] Task 1
- [ ] Task 2

## Notes
- Note 1
- Note 2

## Meetings
- Meeting 1
```

## Organizing Notes

### Folders

Organize notes in folders:

```
workspace/
├── Projects/
│   ├── Project A/
│   │   ├── README.md
│   │   ├── Architecture.md
│   │   └── Tasks.md
│   └── Project B/
└── Topics/
    ├── Machine Learning/
    └── Web Development/
```

### Tags

Add tags to notes:

```markdown
---
tags: [javascript, react, tutorial]
---
```

Search by tag: `#javascript`

### Categories

Use frontmatter for categories:

```markdown
---
category: tutorial
subcategory: web-development
---
```

## Linking Notes

### Wiki Links

Link notes with `[[brackets]]`:

```markdown
See [[Project A]] for details.
Related: [[Machine Learning Basics]]
```

### Backlinks

Flazz automatically tracks backlinks:

```markdown
# Project A

## Backlinks
- [[Daily/2024-03-15]] - Mentioned in daily note
- [[Topics/Web Development]] - Related topic
```

### Link Aliases

Use aliases for cleaner text:

```markdown
See [[Project A|the main project]] for details.
```

## Rich Content

### Code Blocks

```markdown
```javascript
function hello() {
  console.log("Hello, world!");
}
```
```

### Tables

```markdown
| Name | Role | Email |
|------|------|-------|
| Alice | Dev | alice@example.com |
| Bob | PM | bob@example.com |
```

### Images

```markdown
![Description](./images/screenshot.png)
```

### Embeds

Embed other notes:

```markdown
![[Other Note]]
```

## Search

### Full-Text Search

Press `Cmd/Ctrl + K` to search:
- Search across all notes
- Instant results
- Fuzzy matching

### Advanced Search

Use search operators:

```
tag:javascript          # Search by tag
folder:Projects         # Search in folder
created:2024-03-15      # Search by date
modified:last-week      # Recently modified
```

### Search in Note

Press `Cmd/Ctrl + F` to search within current note.

## Version Control

### Git Integration

Workspace is automatically Git-backed:

```bash
cd ~/Flazz
git log                 # View history
git diff                # See changes
git checkout <commit>   # Restore version
```

### Automatic Commits

Flazz auto-commits changes:
- Every save
- Meaningful commit messages
- Full history preserved

### Manual Commits

Commit manually:

```bash
cd ~/Flazz
git add .
git commit -m "Your message"
```

## Export

### Export Single Note

Right-click note → Export:
- Markdown
- HTML
- PDF
- Plain text

### Export Workspace

Export entire workspace:

```bash
# Already in markdown format
cp -r ~/Flazz/workspace ~/backup
```

### Export to Other Tools

Compatible with:
- Obsidian
- Notion (via import)
- Roam Research
- Any markdown editor

## Templates

### Create Template

Save in `~/Flazz/workspace/.templates/`:

```markdown
---
title: {{title}}
date: {{date}}
author: {{author}}
---

# {{title}}

## Overview

## Details

## References
```

### Use Template

1. New Note → From Template
2. Select template
3. Fill in variables

## Keyboard Shortcuts

### Navigation
- `Cmd/Ctrl + N`: New note
- `Cmd/Ctrl + D`: Daily note
- `Cmd/Ctrl + K`: Quick search
- `Cmd/Ctrl + P`: Command palette

### Editing
- `Cmd/Ctrl + B`: Bold
- `Cmd/Ctrl + I`: Italic
- `Cmd/Ctrl + K`: Insert link
- `Cmd/Ctrl + Shift + K`: Insert code block

### Organization
- `Cmd/Ctrl + Shift + N`: New folder
- `Cmd/Ctrl + Shift + M`: Move note
- `Cmd/Ctrl + Shift + T`: Add tag

## Best Practices

### Consistent Structure

Use consistent folder structure:
```
workspace/
├── Daily/          # Daily notes
├── Projects/       # Project docs
├── People/         # People notes
├── Topics/         # Learning notes
└── Archive/        # Old notes
```

### Meaningful Names

Use descriptive note names:
- ✅ "React Hooks Tutorial"
- ❌ "Note 1"

### Regular Reviews

Review notes weekly:
- Update outdated info
- Add new links
- Archive old notes
- Consolidate duplicates

### Backup

Backup regularly:
```bash
# Backup to external drive
cp -r ~/Flazz /path/to/backup

# Or use Git remote
cd ~/Flazz
git remote add origin <url>
git push
```

## Further Reading

- [Wiki Links](wiki-links.md)
- [Search Guide](search.md)
- [Workspace Overview](README.md)
