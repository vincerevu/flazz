# Skills System

Dynamic skills system for Flazz AI agent with autonomous skill creation and self-improvement.
Implementation matches Hermes AI architecture for procedural memory management.

## Overview

Skills are the agent's procedural memory — reusable approaches for recurring task types.
Unlike declarative memory (MEMORY.md/USER.md), skills capture "how to do X" with numbered steps,
pitfalls, and verification procedures.

## Key Features (Hermes-Compatible)

✅ **Autonomous Creation** - Agent creates skills from successful complex tasks
✅ **Self-Improvement** - Agent patches skills when encountering issues
✅ **SKILL.md Format** - YAML frontmatter + markdown body
✅ **Supporting Files** - references/, templates/, scripts/, assets/
✅ **Atomic Operations** - Temp file + rename for concurrent-safe writes
✅ **Fuzzy Patching** - Substring matching for targeted updates

## Architecture

```
┌─────────────────┐
│  Skill Tools    │  ← Agent interacts via tools
└────────┬────────┘
         │
┌────────▼────────┐
│ SkillManager    │  ← Validation + management logic
└────────┬────────┘
         │
┌────────▼────────┐
│   SkillRepo     │  ← File I/O (SKILL.md + supporting files)
└─────────────────┘
```

## Components

### SkillRepo

File-based storage for skills.

**Location**: `~/Flazz/skills/`
- `skill-name/SKILL.md` - Main skill file
- `skill-name/references/` - Reference docs
- `skill-name/templates/` - Code templates
- `skill-name/scripts/` - Helper scripts
- `skill-name/assets/` - Supporting files

**Optional Categories**:
```
~/Flazz/skills/
├── devops/
│   └── aws-deployment/
│       └── SKILL.md
└── data-science/
    └── data-cleaning/
        └── SKILL.md
```

### SkillManager

Manages skill lifecycle with validation.

**Features**:
- Name validation (lowercase, hyphens, max 64 chars)
- Content validation (frontmatter + body)
- Size limits (100k chars, 1MB per file)
- Atomic writes
- Fuzzy patching

### Skill Tools

Three tools for agent interaction:

1. **skill_manage** - Create, patch, edit, delete, write_file, remove_file
2. **skill_list** - List all skills
3. **skill_view** - View skill content

## SKILL.md Format

```markdown
---
name: aws-deployment
description: Deploy applications to AWS using CDK
category: devops
tags: [aws, cdk, deployment]
version: 1.0.0
author: agent
---

## When to Use

Use this skill when deploying Node.js applications to AWS.

## Prerequisites

- AWS CLI configured
- CDK installed
- AWS account with appropriate permissions

## Steps

1. Initialize CDK project:
   ```bash
   cdk init app --language=typescript
   ```

2. Define infrastructure in `lib/stack.ts`

3. Deploy to AWS:
   ```bash
   cdk deploy
   ```

## Pitfalls

- Ensure AWS credentials are configured before deployment
- Check CDK version compatibility with AWS account
- Verify IAM permissions for CloudFormation

## Verification

- Check CloudFormation console for stack status
- Test deployed application endpoint
- Verify logs in CloudWatch
```

## Usage

### Creating a Skill

```typescript
await skillManager.create(
  'aws-deployment',
  skillContent,
  'devops' // optional category
);
```

### Patching a Skill

```typescript
await skillManager.patch(
  'aws-deployment',
  'cdk init app',
  'cdk init app --language=typescript'
);
```

### Listing Skills

```typescript
const skills = await skillManager.list();
// Returns array of Skill objects
```

### Viewing a Skill

```typescript
const skill = await skillManager.get('aws-deployment');
// Returns Skill object with content and supporting files
```

## Tool API (Hermes-Compatible)

### skill_manage

```typescript
// Create
skill_manage({
  action: 'create',
  name: 'aws-deployment',
  content: '---\nname: aws-deployment\n...',
  category: 'devops'
})

// Patch (preferred for fixes)
skill_manage({
  action: 'patch',
  name: 'aws-deployment',
  old_string: 'cdk init app',
  new_string: 'cdk init app --language=typescript'
})

// Edit (full rewrite)
skill_manage({
  action: 'edit',
  name: 'aws-deployment',
  content: '---\nname: aws-deployment\n...'
})

// Delete
skill_manage({
  action: 'delete',
  name: 'aws-deployment'
})

// Write supporting file
skill_manage({
  action: 'write_file',
  name: 'aws-deployment',
  file_path: 'templates/stack.ts',
  file_content: 'import * as cdk from "aws-cdk-lib";...'
})

// Remove supporting file
skill_manage({
  action: 'remove_file',
  name: 'aws-deployment',
  file_path: 'templates/stack.ts'
})
```

### skill_list

```typescript
skill_list()
// Returns: { success: true, skills: [...], count: 5 }
```

### skill_view

```typescript
skill_view({ name: 'aws-deployment' })
// Returns: { success: true, skill: { name, path, frontmatter, content, supportingFiles } }
```

## When Agent Creates Skills

Agent automatically creates skills when:
- Complex task succeeded (5+ tool calls)
- Errors overcome during execution
- User-corrected approach worked
- Non-trivial workflow discovered
- User explicitly asks to remember a procedure

## When Agent Updates Skills

Agent automatically patches skills when:
- Instructions are stale or wrong
- OS-specific failures encountered
- Missing steps or pitfalls found during use
- **"If you used a skill and hit issues not covered by it, patch it immediately."**

## Integration

Skills system is initialized in `packages/core/src/di/container.ts`:

```typescript
const skillRepo = new SkillRepo(WorkDir);
const skillManager = new SkillManager(skillRepo);
setSkillManager(skillManager);
```

Skill tools are registered in `packages/core/src/application/lib/builtin-tools.ts`.

## Hermes AI Compatibility

This implementation matches Hermes AI patterns:

| Feature | Hermes | Flazz | Match |
|---------|--------|-------|-------|
| SKILL.md format | YAML + markdown | YAML + markdown | ✅ |
| Supporting files | 4 subdirs | 4 subdirs | ✅ |
| Autonomous creation | Yes | Yes | ✅ |
| Self-improvement | Yes (patch) | Yes (patch) | ✅ |
| Atomic writes | Temp + rename | Temp + rename | ✅ |
| Tool API | skill_manage | skill_manage | ✅ |
| Actions | 6 actions | 6 actions | ✅ |
| Validation | Name, content, size | Name, content, size | ✅ |

## Future Enhancements

- Security scanning for malicious content
- Skill versioning and rollback
- Skill dependencies and composition
- Skill usage analytics
- Automatic skill suggestions based on task patterns
