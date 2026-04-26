# Skills System

Skills are reusable AI capabilities that can be invoked in chat, automated, or scheduled. Think of them as custom commands that improve over time.

## Overview

Skills enable you to:
- Create reusable AI workflows
- Automate repetitive tasks
- Build custom commands
- Let AI generate skills for you
- Share skills with others

## What is a Skill?

A skill is a packaged AI capability with:
- **Name**: Unique identifier (e.g., `code-reviewer`)
- **Description**: What the skill does
- **Instructions**: How the AI should behave
- **Parameters**: Optional inputs
- **Examples**: Sample usage
- **Memory**: Learned improvements

## Using Skills

### Invoking Skills in Chat

**Basic Usage:**
```
@code-reviewer
[paste your code]
```

**With Parameters:**
```
@translator to=spanish
Hello, how are you?
```

**Chaining Skills:**
```
@code-generator create a REST API
@code-reviewer review the above code
@test-generator create tests for it
```

### Skill Syntax

```
@skill-name param1=value param2=value
[content]
```

**Examples:**
```
@summarizer length=short
[long article]

@formatter style=prettier language=typescript
[code]

@analyzer depth=detailed
[data]
```

## Creating Skills

### Manual Creation

**Via UI:**
1. Go to Skills tab
2. Click "Create Skill"
3. Fill in details:
   - Name (lowercase, hyphens)
   - Description
   - Instructions
   - Parameters (optional)
   - Examples (optional)
4. Test the skill
5. Save

**Example Skill:**
```yaml
name: code-reviewer
description: Reviews code for bugs, performance, and best practices
instructions: |
  You are an expert code reviewer. Analyze the provided code and:
  1. Identify bugs and potential issues
  2. Suggest performance improvements
  3. Check for security vulnerabilities
  4. Recommend best practices
  5. Provide specific, actionable feedback
  
  Format your review as:
  - Issues: List of problems found
  - Suggestions: Improvements to make
  - Security: Any security concerns
  - Rating: Overall code quality (1-10)

parameters:
  - name: language
    type: string
    description: Programming language
    required: false
  - name: focus
    type: enum
    values: [bugs, performance, security, style]
    description: What to focus on
    required: false

examples:
  - input: "@code-reviewer language=python focus=security"
    output: "Reviewing Python code with focus on security..."
```

### AI-Generated Skills

Let AI create skills for you:

**In Chat:**
```
You: Create a skill that translates text to any language

Flazz: I'll create a translator skill for you.
[Creates skill with parameters and examples]

Skill created: @translator
Try it: @translator to=spanish Hello!
```

**Automatic Skill Suggestion:**

Flazz detects patterns and suggests skills:

```
You've asked me to review code 5 times.
Would you like me to create a @code-reviewer skill?
[Yes] [No] [Customize]
```

### Skill Templates

Start from templates:

1. Skills tab → "New from Template"
2. Choose category:
   - Code & Development
   - Writing & Content
   - Data & Analysis
   - Automation
   - Custom
3. Customize template
4. Save

**Popular Templates:**
- Code Reviewer
- Test Generator
- Documentation Writer
- Data Analyzer
- Email Composer
- Meeting Summarizer

## Skill Parameters

### Defining Parameters

```yaml
parameters:
  - name: language
    type: string
    description: Target language
    required: true
    default: english
  
  - name: style
    type: enum
    values: [formal, casual, technical]
    description: Writing style
    required: false
    default: casual
  
  - name: length
    type: number
    description: Max words
    required: false
    min: 10
    max: 1000
```

### Parameter Types

**String:**
```yaml
- name: topic
  type: string
  description: Topic to write about
```

**Number:**
```yaml
- name: count
  type: number
  min: 1
  max: 100
```

**Boolean:**
```yaml
- name: verbose
  type: boolean
  default: false
```

**Enum:**
```yaml
- name: format
  type: enum
  values: [json, yaml, xml]
```

**Array:**
```yaml
- name: tags
  type: array
  items: string
```

### Using Parameters

**In Chat:**
```
@skill param1=value param2=value
```

**In Code:**
```typescript
await skills.execute('skill-name', {
  param1: 'value',
  param2: 'value'
});
```

## Skill Evolution

### How Skills Improve

Skills learn from usage:

1. **Feedback Loop:**
   - You use skill
   - You provide feedback
   - Skill improves

2. **Pattern Recognition:**
   - Skill detects common patterns
   - Adapts to your preferences
   - Optimizes performance

3. **Error Correction:**
   - Mistakes are logged
   - Corrections are learned
   - Future accuracy improves

### Providing Feedback

**Explicit Feedback:**
```
@code-reviewer
[code]

Flazz: [review]

You: Good, but focus more on security

[Skill learns to emphasize security]
```

**Implicit Feedback:**
```
You edit the output → Skill learns
You re-run with changes → Skill adapts
You rate the result → Skill improves
```

### Version History

Track skill evolution:

1. Skills tab → Select skill
2. Click "History"
3. View versions
4. Compare changes
5. Rollback if needed

## Skill Management

### Organizing Skills

**Categories:**
- Code & Development
- Writing & Content
- Data & Analysis
- Automation
- Personal
- Work
- Custom

**Tags:**
```
Tags: python, code-review, security
```

**Folders:**
```
Skills/
├── Development/
│   ├── code-reviewer
│   ├── test-generator
│   └── doc-writer
├── Writing/
│   ├── editor
│   └── translator
└── Personal/
    └── email-composer
```

### Searching Skills

**Quick Search:**
- Press `Ctrl+Shift+K` / `Cmd+Shift+K`
- Type skill name
- Select and use

**Advanced Search:**
- Filter by category
- Filter by tags
- Search in descriptions
- Sort by usage, rating, date

### Sharing Skills

**Export Skill:**
1. Right-click skill
2. "Export"
3. Choose format: YAML, JSON
4. Share file

**Import Skill:**
1. Skills tab → "Import"
2. Select file
3. Review and customize
4. Save

**Skill Marketplace:**
- Browse community skills
- Install with one click
- Rate and review
- Contribute your own

## Advanced Features

### Skill Composition

Combine multiple skills:

```yaml
name: full-code-workflow
description: Complete code workflow
steps:
  - skill: code-generator
    params:
      language: typescript
  - skill: code-reviewer
    params:
      focus: security
  - skill: test-generator
  - skill: doc-writer
```

**Usage:**
```
@full-code-workflow
Create a user authentication API
```

### Conditional Logic

Add conditions to skills:

```yaml
instructions: |
  If language is Python:
    - Use PEP 8 style
    - Suggest type hints
  If language is JavaScript:
    - Use ESLint rules
    - Suggest TypeScript
```

### Skill Hooks

Trigger skills automatically:

**On File Save:**
```yaml
hooks:
  - event: file.save
    pattern: "*.py"
    skill: code-formatter
```

**On Chat Message:**
```yaml
hooks:
  - event: chat.message
    condition: contains("review")
    skill: code-reviewer
```

**Scheduled:**
```yaml
hooks:
  - event: schedule
    cron: "0 9 * * *"  # Daily at 9am
    skill: daily-summary
```

## Built-in Skills

Flazz includes several built-in skills:

### Code Skills

**@code-reviewer**
- Reviews code quality
- Finds bugs and issues
- Suggests improvements

**@code-formatter**
- Formats code consistently
- Applies style guides
- Fixes linting issues

**@test-generator**
- Generates unit tests
- Creates test cases
- Adds assertions

**@doc-writer**
- Writes documentation
- Generates docstrings
- Creates README files

### Writing Skills

**@editor**
- Improves writing
- Fixes grammar
- Enhances clarity

**@summarizer**
- Summarizes text
- Extracts key points
- Adjusts length

**@translator**
- Translates text
- Preserves formatting
- Handles technical terms

### Data Skills

**@analyzer**
- Analyzes data
- Finds patterns
- Generates insights

**@formatter**
- Formats data
- Converts formats
- Validates structure

## Skill Best Practices

### Writing Good Instructions

**Be Specific:**
```
❌ "Review code"
✅ "Review code for bugs, security issues, and performance problems. 
    Provide specific line numbers and suggestions."
```

**Use Examples:**
```
instructions: |
  Format code like this:
  
  Input:
  function foo(){return 1}
  
  Output:
  function foo() {
    return 1;
  }
```

**Set Constraints:**
```
instructions: |
  - Keep responses under 500 words
  - Use bullet points
  - Include code examples
  - Cite sources
```

### Naming Conventions

**Good Names:**
- `code-reviewer` ✅
- `test-generator` ✅
- `email-composer` ✅

**Bad Names:**
- `skill1` ❌
- `mySkill` ❌
- `code_reviewer` ❌

**Rules:**
- Lowercase
- Hyphens (not underscores)
- Descriptive
- Unique

### Testing Skills

**Before Publishing:**
1. Test with various inputs
2. Check edge cases
3. Verify parameters work
4. Get feedback from others
5. Iterate and improve

**Test Cases:**
```yaml
tests:
  - input: "simple case"
    expected: "should work"
  - input: "edge case"
    expected: "should handle"
  - input: "error case"
    expected: "should fail gracefully"
```

## Troubleshooting

### Skill Not Working

**Check:**
1. Skill is enabled
2. Syntax is correct: `@skill-name`
3. Parameters are valid
4. No typos in name

**Debug:**
```
Skills tab → Select skill → "Test"
```

### Unexpected Output

**Causes:**
- Ambiguous instructions
- Missing parameters
- Conflicting examples

**Solutions:**
- Clarify instructions
- Add more examples
- Test with various inputs

### Skill Too Slow

**Optimize:**
- Simplify instructions
- Reduce context
- Use faster model
- Cache results

### Skill Conflicts

**Error:** "Multiple skills match"

**Solution:**
- Use full skill name
- Rename conflicting skills
- Use skill ID instead

## Advanced Topics

- [Creating Skills](./creating-skills.md) - Detailed guide
- [AI-Generated Skills](./ai-generated-skills.md) - Let AI create skills
- [Skill Evolution](./skill-evolution.md) - How skills improve
- [Skill API](./skill-api.md) - Programmatic access

## Related Features

- [Chat](../chat/README.md) - Use skills in chat
- [Memory](../memory/README.md) - Skills learn from memory
- [Integrations](../integrations/README.md) - Skills with external services

## Next Steps

- [Creating Skills](./creating-skills.md) - Build your first skill
- [AI-Generated Skills](./ai-generated-skills.md) - Automate skill creation
- [Skill Marketplace](#) - Browse community skills

## Support

- [FAQ](../../faq.md) - Common questions
- [Skill Examples](./examples.md) - Sample skills
- [GitHub Issues](https://github.com/vincerevu/flazz/issues) - Report bugs
