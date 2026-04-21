# Search Guide

Learn how to search effectively in Flazz's knowledge workspace.

## Overview

Flazz provides powerful search capabilities:
- Full-text search across all notes
- Fuzzy matching
- Advanced filters
- Instant results
- Search in graph

## Quick Search

### Open Search

Press `Cmd/Ctrl + K` to open quick search.

### Basic Search

Just type to search:

```
machine learning
```

Finds all notes containing "machine learning"

### Fuzzy Matching

Search works with typos:

```
machin lerning  → Finds "machine learning"
```

## Search Operators

### Tag Search

Search by tag:

```
tag:javascript
#javascript
```

### Folder Search

Search in specific folder:

```
folder:Projects
in:Projects
```

### Date Search

Search by date:

```
created:2024-03-15
modified:today
modified:last-week
modified:this-month
```

### Content Search

Search in content only:

```
content:"specific phrase"
```

### Title Search

Search in titles only:

```
title:Architecture
```

### Combine Operators

Combine multiple operators:

```
tag:javascript folder:Projects modified:last-week
```

## Advanced Search

### Exact Phrase

Use quotes for exact match:

```
"machine learning algorithm"
```

### Boolean Operators

Use AND, OR, NOT:

```
javascript AND react
python OR javascript
machine learning NOT deep
```

### Wildcards

Use * for wildcards:

```
test*        → Finds test, testing, tests
*script      → Finds javascript, typescript
```

### Regular Expressions

Use regex for complex patterns:

```
/^function \w+/
```

## Search Filters

### Filter Panel

Open filter panel for advanced options:

1. Click filter icon
2. Select filters:
   - File type
   - Date range
   - Tags
   - Folders
   - Author

### Quick Filters

Use quick filter buttons:
- Recent
- Favorites
- Untagged
- Orphaned

## Search Results

### Result Display

Results show:
- Note title
- Matching snippet
- File path
- Last modified date
- Relevance score

### Sort Results

Sort by:
- Relevance (default)
- Date modified
- Date created
- Title (A-Z)
- File size

### Preview Results

Hover over result to see preview.

## Search in Note

### Find in Current Note

Press `Cmd/Ctrl + F` to search in current note.

### Find and Replace

Press `Cmd/Ctrl + H` for find and replace:

1. Enter search term
2. Enter replacement
3. Replace one or all

### Navigate Matches

- `Enter`: Next match
- `Shift + Enter`: Previous match
- `Esc`: Close search

## Graph Search

### Search in Graph View

1. Open graph view
2. Use search box
3. Matching nodes highlight

### Filter Graph

Filter graph by:
- Search term
- Tags
- Folders
- Date range

### Navigate from Search

Click search result to:
- Focus node in graph
- Open note
- Show connections

## Search Shortcuts

### Keyboard Shortcuts

- `Cmd/Ctrl + K`: Quick search
- `Cmd/Ctrl + F`: Find in note
- `Cmd/Ctrl + H`: Find and replace
- `Cmd/Ctrl + Shift + F`: Search in all files

### Search Modifiers

- `Cmd/Ctrl + Click`: Open in new pane
- `Alt + Click`: Open in new window
- `Shift + Click`: Add to selection

## Search Index

### Rebuild Index

If search is slow or incomplete:

1. Settings → Workspace → Search
2. Click "Rebuild Index"
3. Wait for completion

### Index Settings

Configure indexing:

```json
{
  "search": {
    "indexMarkdown": true,
    "indexCode": true,
    "indexPDF": false,
    "maxFileSize": "10MB"
  }
}
```

## Search Performance

### Optimize Search

For better performance:

1. **Exclude large files**:
   - Settings → Search → Exclude patterns
   - Add: `*.pdf`, `*.zip`, etc.

2. **Limit search scope**:
   - Search in specific folders
   - Use date filters

3. **Use specific terms**:
   - More specific = faster results
   - "react hooks" vs "react"

### Search Cache

Search results are cached:
- First search: Slower
- Subsequent: Instant
- Cache clears on file changes

## Use Cases

### Find Related Notes

```
tag:project-a
```

Shows all notes tagged with project-a

### Find Recent Work

```
modified:last-week
```

Shows notes modified in last week

### Find Unfinished Tasks

```
content:"[ ]"
```

Finds all unchecked tasks

### Find Code Examples

```
folder:Examples tag:javascript
```

Finds JavaScript examples

### Find Meeting Notes

```
title:meeting modified:this-month
```

Finds recent meeting notes

## Best Practices

### Use Specific Terms

More specific = better results:
- ✅ "react hooks useEffect"
- ❌ "react"

### Use Tags

Tag notes for easier search:

```markdown
---
tags: [javascript, react, tutorial]
---
```

Then search: `tag:react`

### Organize Folders

Use folders for broad categories:

```
Projects/
Topics/
Daily/
```

Then search: `folder:Projects`

### Regular Cleanup

Periodically:
- Remove duplicate notes
- Update outdated content
- Fix broken links
- Consolidate similar notes

## Troubleshooting

### No Results Found

If search returns no results:
1. Check spelling
2. Try broader terms
3. Remove filters
4. Rebuild search index

### Slow Search

If search is slow:
1. Reduce search scope
2. Exclude large files
3. Rebuild index
4. Check system resources

### Missing Results

If expected results missing:
1. Check file is in workspace
2. Verify file is indexed
3. Rebuild index
4. Check exclude patterns

### Incorrect Results

If results seem wrong:
1. Use exact phrase search
2. Add more specific terms
3. Use filters
4. Check relevance sorting

## Further Reading

- [Knowledge Base](knowledge-base.md)
- [Wiki Links](wiki-links.md)
- [Workspace Overview](README.md)
