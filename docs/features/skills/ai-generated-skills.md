# AI-Generated Skills

Learn how Flazz automatically creates skills from your repeated tasks.

## Overview

Instead of manually creating skills, Flazz can:
- Detect repeated task patterns
- Generate skill definitions automatically
- Improve skills based on usage
- Evolve skills over time

## How It Works

### 1. Pattern Detection

Flazz observes your interactions:

```
Week 1: You review 3 pull requests
Week 2: You review 5 more pull requests
Week 3: Pattern detected (8 similar tasks)

→ Flazz: "I notice you often review pull requests. 
   Would you like me to create a 'PR Review' skill?"
```

### 2. Skill Generation

If you accept, Flazz generates:

```markdown
---
name: pr-review-assistant
description: Reviews pull requests for code quality and best practices
category: development
auto_generated: true
created_from: 8 similar tasks on 2024-03-15
confidence: 0.85
---

# PR Review Assistant

Automatically generated skill for reviewing pull requests.

## Instructions

Based on your previous reviews, this skill:

1. **Code Quality Check**
   - Verify code follows project style guide
   - Check for code duplication
   - Review naming conventions

2. **Security Review**
   - Look for common vulnerabilities
   - Check input validation
   - Verify authentication

3. **Performance Analysis**
   - Identify potential bottlenecks
   - Check for N+1 queries
   - Review caching strategies

4. **Documentation**
   - Ensure code is well-commented
   - Check for updated README
   - Verify API documentation

## Learned Preferences

From your previous reviews:
- You prefer detailed explanations
- You always check for tests
- You emphasize security
- You use a checklist format

## Output Format

```
## Summary
Brief overview of changes

## Issues Found
- [HIGH/MEDIUM/LOW] Description

## Suggestions
- Improvement suggestions

## Approval Status
✅ Approved / ⚠️ Needs changes / ❌ Rejected
```
```

### 3. Skill Evolution

The skill improves with use:

```
After 5 uses:
- Learns your common comments
- Adapts to your review style
- Adds frequently checked items

After 20 uses:
- Predicts issues you'd catch
- Suggests improvements proactively
- Matches your approval criteria

After 50 uses:
- Highly personalized
- Catches subtle issues
- Minimal manual review needed
```

## Detection Criteria

Flazz offers to create a skill when:

### Frequency Threshold

```
Minimum occurrences: 5 similar tasks
Time window: Within 30 days
Similarity score: > 80%
```

### Pattern Strength

```
Strong pattern (confidence > 90%):
- Identical structure every time
- Same steps in same order
- Consistent parameters

→ Immediate skill offer

Medium pattern (confidence 70-90%):
- Similar but with variations
- Some steps differ
- Parameters vary

→ Offer after more observations

Weak pattern (confidence < 70%):
- High variation
- Inconsistent structure
- Different each time

→ Continue observing
```

## Skill Generation Process

### Step 1: Analysis

Flazz analyzes your tasks:

```
Analyzing 8 pull request reviews:
- Common steps identified
- Frequent checks noted
- Your preferences extracted
- Output format learned
```

### Step 2: Template Creation

Generates skill template:

```
Creating skill structure:
- Instructions from common steps
- Parameters from variations
- Examples from actual tasks
- Preferences from observations
```

### Step 3: Validation

Validates the skill:

```
Checking skill quality:
- Instructions are clear
- Examples are relevant
- Parameters are complete
- Format is consistent
```

### Step 4: Proposal

Presents to you:

```
Flazz: "I've created a 'PR Review' skill based on your 
recent reviews. Would you like to:

1. Use it as-is
2. Review and edit first
3. Decline (don't create)"
```

## Managing AI-Generated Skills

### Review Generated Skills

Before accepting:

1. Read the instructions
2. Check learned preferences
3. Verify examples
4. Test with sample input

### Edit Generated Skills

Customize as needed:

1. Open skill file
2. Modify instructions
3. Add/remove steps
4. Update examples
5. Save changes

### Approve or Reject

After review:

```
✅ Approve: Skill is saved and ready to use
✏️ Edit: Make changes before saving
❌ Reject: Skill is discarded
🔕 Never: Don't suggest for this pattern
```

## Skill Evolution

### Automatic Improvements

Skills improve automatically:

```
Version 1.0 (Initial):
- Basic instructions
- Generic examples
- Standard format

Version 1.5 (After 10 uses):
- Your common comments added
- Personalized examples
- Adapted format

Version 2.0 (After 25 uses):
- Predictive suggestions
- Edge cases handled
- Highly optimized
```

### Manual Refinement

You can also refine manually:

1. Settings → Skills → [Skill Name]
2. Click "Refine"
3. Flazz analyzes recent uses
4. Suggests improvements
5. Apply or reject changes

### Version History

Track skill evolution:

```markdown
## Changelog

- 2.1.0 (2024-03-20): Added security checklist
- 2.0.0 (2024-03-15): Major improvements from 25 uses
- 1.5.0 (2024-03-10): Added common comments
- 1.0.0 (2024-03-01): Initial auto-generated version
```

## Examples

### Example 1: Meeting Summarizer

**Pattern detected**:
```
You summarize 12 meetings with similar format:
- Attendees list
- Key decisions
- Action items
- Next steps
```

**Generated skill**:
```markdown
---
name: meeting-summarizer
description: Summarizes meeting transcripts with action items
auto_generated: true
---

# Meeting Summarizer

## Instructions

1. Extract attendees from transcript
2. Identify key decisions made
3. List action items with owners
4. Note next meeting topics

## Learned Preferences

- You prefer bullet points
- You always include attendee list
- You highlight deadlines in bold
- You send summary to Slack #team channel

## Output Format

```
# Meeting Summary - [Date]

## Attendees
- Person 1
- Person 2

## Key Decisions
- Decision 1
- Decision 2

## Action Items
- [ ] Task 1 - @owner - Due: date
- [ ] Task 2 - @owner - Due: date

## Next Meeting
- Topic 1
- Topic 2
```
```

### Example 2: Bug Report Generator

**Pattern detected**:
```
You create 15 bug reports with consistent structure:
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Screenshots
```

**Generated skill**:
```markdown
---
name: bug-report-generator
description: Creates detailed bug reports from descriptions
auto_generated: true
---

# Bug Report Generator

## Instructions

1. Parse bug description
2. Extract reproduction steps
3. Identify expected vs actual behavior
4. Add environment details
5. Format for GitHub/Linear

## Learned Preferences

- You use numbered steps
- You include browser/OS info
- You add severity labels
- You link related issues

## Output Format

```
## Bug Description
Brief description

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: ...
- Browser: ...
- Version: ...

## Severity
[HIGH/MEDIUM/LOW]
```
```

## Configuration

### Detection Settings

Adjust when skills are offered:

```
Settings → Skills → Auto-Generation

Frequency threshold: 5-20 tasks
Similarity threshold: 70-95%
Confidence threshold: 70-95%
Time window: 7-90 days
```

### Notification Preferences

Control how you're notified:

```
Settings → Skills → Notifications

- Immediate: Notify as soon as pattern detected
- Daily digest: Once per day summary
- Weekly digest: Once per week summary
- Manual: Check manually in Skills panel
```

### Auto-Approval

For trusted patterns:

```
Settings → Skills → Auto-Approval

Enable auto-approval for:
- High confidence (>90%) patterns
- Patterns similar to existing skills
- Patterns you've approved before

Requires review for:
- Medium confidence (70-90%) patterns
- New pattern types
- Complex workflows
```

## Best Practices

### Let Patterns Emerge

Don't force patterns. Let them develop naturally:
- Perform tasks as usual
- Don't artificially repeat tasks
- Let Flazz observe organically

### Provide Feedback

Help skills improve:
- Use generated skills regularly
- Correct when output is wrong
- Suggest improvements
- Rate skill usefulness

### Review Before Approving

Always review generated skills:
- Check instructions make sense
- Verify examples are accurate
- Test with sample input
- Edit if needed

### Iterate and Refine

Skills improve over time:
- Use the skill regularly
- Let it evolve
- Manually refine periodically
- Keep or discard based on value

## Troubleshooting

### No skills being generated

If Flazz isn't generating skills:
- Check auto-generation is enabled
- Verify you have repeated patterns
- Lower similarity threshold
- Check frequency threshold

### Wrong skills generated

If generated skills are incorrect:
- Reject the skill
- Provide feedback on why
- Adjust detection thresholds
- Manually create correct skill

### Skills not improving

If skills aren't evolving:
- Use them more frequently
- Provide explicit feedback
- Check evolution is enabled
- Manually trigger refinement

## Further Reading

- [Skills System Overview](README.md)
- [Creating Skills Manually](creating-skills.md)
- [Behavioral Learning](../memory/behavioral-learning.md)
