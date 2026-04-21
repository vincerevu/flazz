# Creating Skills

Learn how to create custom skills to extend Flazz's capabilities.

## Overview

Skills are reusable AI workflows stored as markdown files. They define:
- What the skill does
- Parameters it accepts
- Instructions for the AI
- Supporting files and templates

## Skill Structure

### Basic Skill File

```markdown
---
name: skill-name
description: Brief description of what this skill does
category: productivity
version: 1.0.0
author: Your Name
---

# Skill Name

Detailed description of the skill and what it accomplishes.

## Instructions

Step-by-step instructions for the AI to follow:

1. First step
2. Second step
3. Third step

## Parameters

- `param1`: Description of parameter 1
- `param2`: Description of parameter 2

## Examples

### Example 1
Input: ...
Output: ...

### Example 2
Input: ...
Output: ...

## Notes

Additional notes, tips, or warnings.
```

### Skill Location

Save skills in:
```
~/Flazz/memory/Skills/
├── my-skill.md
├── another-skill.md
└── category/
    └── specialized-skill.md
```

## Creating Your First Skill

### Example: Code Review Skill

```markdown
---
name: code-review-assistant
description: Reviews code for security, performance, and best practices
category: development
version: 1.0.0
author: Your Name
---

# Code Review Assistant

Performs comprehensive code review focusing on security, performance, and best practices.

## Instructions

1. **Security Analysis**
   - Check for SQL injection vulnerabilities
   - Look for XSS vulnerabilities
   - Verify input validation
   - Check authentication/authorization

2. **Performance Review**
   - Identify N+1 queries
   - Check for unnecessary loops
   - Look for memory leaks
   - Verify caching strategies

3. **Best Practices**
   - Check code style consistency
   - Verify error handling
   - Review naming conventions
   - Check for code duplication

4. **Output Format**
   Provide feedback in this structure:
   ```
   ## Security Issues
   - [HIGH/MEDIUM/LOW] Description
   
   ## Performance Concerns
   - [HIGH/MEDIUM/LOW] Description
   
   ## Best Practice Suggestions
   - Description
   
   ## Positive Aspects
   - What's done well
   ```

## Parameters

- `code`: The code to review (required)
- `language`: Programming language (optional, auto-detected)
- `focus`: Specific area to focus on (optional: security, performance, style)

## Examples

### Example 1: Full Review
Input: 
```javascript
function getUser(id) {
  return db.query(`SELECT * FROM users WHERE id = ${id}`);
}
```

Output:
```
## Security Issues
- [HIGH] SQL injection vulnerability in getUser function
  Use parameterized queries instead

## Best Practice Suggestions
- Add error handling
- Add input validation for id parameter
```

## Notes

- Works best with code snippets under 500 lines
- For larger codebases, review files individually
- Can be combined with git diff for PR reviews
```

## Skill Components

### Frontmatter

Required metadata in YAML format:

```yaml
---
name: skill-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line description
category: productivity     # Category for organization
version: 1.0.0            # Semantic versioning
author: Your Name         # Optional
tags: [tag1, tag2]        # Optional tags
---
```

### Instructions Section

Clear, step-by-step instructions for the AI:

```markdown
## Instructions

1. **Step 1: Analyze Input**
   - Parse the input data
   - Validate parameters
   - Check for edge cases

2. **Step 2: Process**
   - Apply transformations
   - Generate output
   - Format results

3. **Step 3: Validate**
   - Check output quality
   - Verify completeness
   - Add warnings if needed
```

### Parameters Section

Define expected inputs:

```markdown
## Parameters

- `input` (required): The main input data
- `format` (optional): Output format (json, markdown, text)
  Default: markdown
- `verbose` (optional): Include detailed explanations
  Default: false
```

### Examples Section

Provide concrete examples:

```markdown
## Examples

### Example 1: Basic Usage
Input: "Hello world"
Output: "HELLO WORLD"

### Example 2: With Options
Input: "Hello world"
Parameters: { format: "json" }
Output: { "result": "HELLO WORLD" }
```

## Skill Categories

Organize skills by category:

### Development
```
~/Flazz/memory/Skills/development/
├── code-review.md
├── test-generator.md
└── refactoring-assistant.md
```

### Productivity
```
~/Flazz/memory/Skills/productivity/
├── meeting-summarizer.md
├── email-composer.md
└── task-planner.md
```

### Writing
```
~/Flazz/memory/Skills/writing/
├── blog-post-writer.md
├── documentation-generator.md
└── proofreader.md
```

### Research
```
~/Flazz/memory/Skills/research/
├── paper-summarizer.md
├── literature-review.md
└── citation-formatter.md
```

## Advanced Features

### Supporting Files

Include templates and examples:

```
~/Flazz/memory/Skills/email-composer/
├── email-composer.md
├── templates/
│   ├── formal.md
│   ├── casual.md
│   └── announcement.md
└── examples/
    └── sample-emails.md
```

Reference in skill:
```markdown
## Templates

Use templates from `./templates/` directory:
- `formal.md`: For client communication
- `casual.md`: For team communication
```

### Conditional Logic

Add conditional instructions:

```markdown
## Instructions

1. Check the `language` parameter:
   - If Python: Use PEP 8 style guide
   - If JavaScript: Use ESLint rules
   - If TypeScript: Check type safety

2. If `verbose` is true:
   - Include detailed explanations
   - Add code examples
   - Provide references
```

### Multi-Step Workflows

Create complex workflows:

```markdown
## Instructions

### Phase 1: Analysis
1. Parse input
2. Identify patterns
3. Generate insights

### Phase 2: Generation
1. Create outline
2. Fill in details
3. Add examples

### Phase 3: Refinement
1. Review output
2. Check quality
3. Make improvements
```

### Skill Composition

Reference other skills:

```markdown
## Instructions

1. Use the `code-analyzer` skill to analyze the code
2. Use the `test-generator` skill to create tests
3. Combine results into comprehensive report
```

## Testing Skills

### Manual Testing

Test your skill:

1. Save the skill file
2. In chat: "Use [skill-name] skill"
3. Provide test input
4. Verify output

### Test Cases

Add test cases to skill:

```markdown
## Test Cases

### Test 1: Valid Input
Input: { "code": "function test() {}" }
Expected: Security review with no issues

### Test 2: SQL Injection
Input: { "code": "query(`SELECT * FROM users WHERE id = ${id}`)" }
Expected: HIGH security warning about SQL injection

### Test 3: Empty Input
Input: { "code": "" }
Expected: Error message about empty input
```

## Best Practices

### Clear Instructions

Write instructions as if explaining to a human:

```markdown
❌ Bad:
- Check code
- Find issues
- Report

✅ Good:
1. **Analyze the code for security vulnerabilities**
   - Look for SQL injection points
   - Check for XSS vulnerabilities
   - Verify input validation

2. **Report findings clearly**
   - Use severity levels (HIGH, MEDIUM, LOW)
   - Provide specific line numbers
   - Suggest fixes
```

### Specific Examples

Provide concrete examples:

```markdown
❌ Bad:
Example: Some code
Output: Review results

✅ Good:
Example:
```javascript
function getUser(id) {
  return db.query(`SELECT * FROM users WHERE id = ${id}`);
}
```

Output:
```
[HIGH] SQL Injection vulnerability on line 2
Fix: Use parameterized query:
db.query('SELECT * FROM users WHERE id = ?', [id])
```
```

### Error Handling

Include error handling instructions:

```markdown
## Error Handling

If input is invalid:
1. Identify the issue
2. Provide clear error message
3. Suggest how to fix

Example error message:
"Error: Code parameter is required. Please provide code to review."
```

### Version Control

Track skill versions:

```yaml
---
version: 1.0.0
changelog:
  - 1.0.0: Initial release
  - 1.1.0: Added performance checks
  - 1.2.0: Improved error messages
---
```

## Skill Templates

### Basic Template

```markdown
---
name: skill-name
description: What this skill does
category: category-name
version: 1.0.0
---

# Skill Name

Description

## Instructions

1. Step 1
2. Step 2
3. Step 3

## Parameters

- `param1`: Description

## Examples

### Example 1
Input: ...
Output: ...
```

### Advanced Template

```markdown
---
name: skill-name
description: What this skill does
category: category-name
version: 1.0.0
author: Your Name
tags: [tag1, tag2]
requires: [other-skill-1, other-skill-2]
---

# Skill Name

Detailed description

## Prerequisites

- Requirement 1
- Requirement 2

## Instructions

### Phase 1: Preparation
1. Step 1
2. Step 2

### Phase 2: Execution
1. Step 1
2. Step 2

### Phase 3: Validation
1. Step 1
2. Step 2

## Parameters

- `param1` (required): Description
- `param2` (optional): Description
  Default: value

## Examples

### Example 1: Basic
Input: ...
Output: ...

### Example 2: Advanced
Input: ...
Parameters: { ... }
Output: ...

## Error Handling

- Error 1: How to handle
- Error 2: How to handle

## Notes

Additional information

## Changelog

- 1.0.0: Initial release
```

## Sharing Skills

### Export Skill

Share your skill with others:

1. Copy skill file
2. Include supporting files
3. Add README with usage instructions
4. Share via GitHub, etc.

### Import Skill

Use someone else's skill:

1. Download skill file
2. Place in `~/Flazz/memory/Skills/`
3. Restart Flazz or reload skills
4. Use in chat

### Skill Repository

Contribute to community:

1. Fork Flazz skills repository
2. Add your skill
3. Submit pull request
4. Share with community

## Troubleshooting

### Skill not found

If Flazz can't find your skill:
- Check file location
- Verify filename matches `name` in frontmatter
- Reload skills: Settings → Skills → Reload

### Skill not working

If skill doesn't work as expected:
- Check instructions are clear
- Add more examples
- Test with simple inputs first
- Check logs for errors

### Skill conflicts

If multiple skills have same name:
- Use unique names
- Organize in subdirectories
- Use full path: "development/code-review"

## Further Reading

- [Skills System Overview](README.md)
- [AI-Generated Skills](ai-generated-skills.md)
- [Skill Examples Repository](https://github.com/flazz/skills)
