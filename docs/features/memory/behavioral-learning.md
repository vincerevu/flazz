# Behavioral Learning

Flazz observes your work patterns and preferences to provide increasingly personalized assistance over time.

## Overview

Unlike traditional AI that treats every interaction the same, Flazz learns:
- Your communication style
- Task patterns and workflows
- Tool and format preferences
- Decision-making patterns
- Work habits and schedules

## What Flazz Learns

### Communication Style

**Tone and formality**
```
After observing your emails:
- Learns you prefer casual tone with team
- Uses formal tone with clients
- Adapts emoji usage to your style
```

**Response length**
```
Notices you prefer:
- Brief answers for quick questions
- Detailed explanations for complex topics
- Bullet points over paragraphs
```

**Technical level**
```
Adjusts explanations based on:
- Your expertise level
- Domain knowledge
- Preferred terminology
```

### Task Patterns

**Recurring workflows**
```
Observes you often:
1. Review pull requests
2. Write summary
3. Post to Slack
4. Update Jira ticket

→ Offers to create "PR Review" skill
```

**Time patterns**
```
Learns your schedule:
- Code reviews: Mornings
- Meetings: Afternoons
- Deep work: Evenings
→ Suggests tasks at optimal times
```

**Task sequences**
```
Notices patterns:
- After meetings → Send summary
- Before deployment → Run tests
- End of week → Status update
→ Proactively suggests next steps
```

### Tool Preferences

**Preferred tools**
```
Learns you prefer:
- VS Code over other editors
- Slack over email for team chat
- Linear over Jira for tickets
→ Uses these by default
```

**Format preferences**
```
Observes you like:
- Markdown for documentation
- JSON for configs
- TypeScript over JavaScript
→ Generates in preferred formats
```

**Workflow tools**
```
Tracks your stack:
- Git for version control
- pnpm for package management
- Vitest for testing
→ Suggests compatible tools
```

### Decision Patterns

**Code style**
```
Learns your preferences:
- Functional over OOP
- Explicit over implicit
- Composition over inheritance
→ Generates code in your style
```

**Architecture choices**
```
Observes you favor:
- Microservices over monoliths
- REST over GraphQL
- PostgreSQL over MongoDB
→ Suggests aligned solutions
```

**Problem-solving approach**
```
Notices you:
- Start with tests
- Prefer incremental changes
- Value simplicity
→ Adapts recommendations
```

## How Learning Works

### Observation Phase

Flazz silently observes your interactions:

```
Week 1: Collecting data
- 50+ interactions
- Pattern detection begins
- No changes to behavior yet
```

### Pattern Recognition

After sufficient data:

```
Week 2-3: Identifying patterns
- Recurring tasks detected
- Preferences identified
- Confidence scores calculated
```

### Adaptation Phase

Flazz starts adapting:

```
Week 4+: Personalized assistance
- Suggestions match your style
- Proactive recommendations
- Skill generation offers
```

### Continuous Improvement

Learning never stops:

```
Ongoing: Refinement
- Patterns evolve
- Preferences update
- New skills emerge
```

## Learning Categories

### 1. Explicit Learning

From direct feedback:

```
You: "I prefer TypeScript"
Flazz: ✓ Noted. Will use TypeScript by default.

You: "Use bullet points"
Flazz: ✓ Will format responses as bullet points.
```

### 2. Implicit Learning

From behavior observation:

```
Flazz notices:
- You always run tests before committing
- You prefer async/await over promises
- You write detailed commit messages

→ Adapts without being told
```

### 3. Corrective Learning

From corrections:

```
Flazz suggests: "Use Redux for state"
You: "Actually, I prefer Zustand"
Flazz: ✓ Updated preference. Will suggest Zustand.
```

### 4. Temporal Learning

From time-based patterns:

```
Flazz observes:
- Mondays: Planning and meetings
- Tuesdays-Thursdays: Deep work
- Fridays: Code reviews and cleanup

→ Adjusts suggestions by day
```

## Learned Behaviors

### Code Generation

**Before learning**:
```javascript
// Generic code
function getData() {
  return fetch('/api/data')
    .then(res => res.json())
    .catch(err => console.error(err));
}
```

**After learning**:
```typescript
// Matches your style
async function getData(): Promise<Data> {
  try {
    const response = await fetch('/api/data');
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch data', error);
    throw error;
  }
}
```

### Email Composition

**Before learning**:
```
Subject: Update

Hi,

Here's the update you requested.

Thanks
```

**After learning**:
```
Subject: Q1 Integration - Weekly Update

Hey team,

Quick update on Q1 Integration:
- ✅ API endpoints deployed
- 🚧 Frontend integration in progress
- 📅 On track for Friday release

Let me know if questions!

Sarah
```

### Task Suggestions

**Before learning**:
```
Generic suggestions:
- Review code
- Write tests
- Update documentation
```

**After learning**:
```
Personalized suggestions:
- Review PR #123 (you usually do this at 9am)
- Run integration tests (you always do before deploy)
- Update Linear ticket (you track all changes)
```

## Privacy & Control

### What's Stored

Behavioral patterns are stored locally:

```
~/Flazz/memory/.learning/
├── communication-style.json
├── task-patterns.json
├── tool-preferences.json
└── decision-patterns.json
```

### View Learned Patterns

See what Flazz has learned:

1. Settings → Memory → Behavioral Learning
2. View learned patterns by category
3. See confidence scores
4. Review recent observations

### Edit Preferences

Manually adjust learned preferences:

1. Settings → Memory → Preferences
2. Edit any preference
3. Set confidence level
4. Save changes

### Reset Learning

Start fresh if needed:

1. Settings → Memory → Reset Learning
2. Choose what to reset:
   - All patterns
   - Specific categories
   - Low-confidence patterns only
3. Confirm reset

### Disable Learning

Turn off behavioral learning:

1. Settings → Memory → Behavioral Learning
2. Toggle "Enable behavioral learning"
3. Existing patterns remain but no new learning

## Learning Confidence

Flazz tracks confidence for each learned pattern:

### Confidence Levels

**High (90-100%)**
```
Observed 20+ times consistently
Example: "Always uses TypeScript"
→ Applied automatically
```

**Medium (70-89%)**
```
Observed 10-19 times with some variation
Example: "Usually prefers async/await"
→ Suggested but not forced
```

**Low (50-69%)**
```
Observed 5-9 times, pattern unclear
Example: "Sometimes uses Redux"
→ Noted but not applied
```

**Tentative (<50%)**
```
Observed 1-4 times, needs more data
Example: "Might prefer Tailwind"
→ Stored but not used
```

## Skill Generation

When patterns are strong enough, Flazz offers to create skills:

### Detection Threshold

```
Pattern detected:
- Task performed 5+ times
- Similar structure each time
- Confidence > 80%

→ Offer to create skill
```

### Skill Proposal

```
Flazz: "I notice you often review pull requests with a 
similar process. Would you like me to create a 'PR Review' 
skill to automate this?"

Options:
- Yes, create skill
- Not now
- Never for this pattern
```

### Skill Evolution

Created skills continue to improve:

```
Initial skill: Basic PR review checklist
After 10 uses: Adds your common comments
After 20 uses: Learns your approval criteria
After 50 uses: Predicts issues you'd catch
```

## Use Cases

### Personal Assistant

Learns your daily routine:
- Morning: Check emails, review PRs
- Afternoon: Meetings, planning
- Evening: Deep work, coding
→ Suggests tasks at right times

### Code Reviewer

Learns your review style:
- Security concerns you flag
- Performance issues you catch
- Style preferences you enforce
→ Pre-reviews code for you

### Writing Assistant

Learns your writing style:
- Tone and voice
- Structure preferences
- Common phrases
- Formatting choices
→ Drafts in your voice

### Project Manager

Learns your PM style:
- How you track tasks
- Status update format
- Communication patterns
→ Automates PM tasks

## Best Practices

### Give It Time

Learning takes time. Expect:
- Week 1: Minimal adaptation
- Week 2-3: Pattern detection
- Week 4+: Noticeable personalization
- Month 2+: Highly personalized

### Be Consistent

Help Flazz learn by:
- Using consistent terminology
- Following regular patterns
- Providing clear feedback
- Correcting mistakes

### Provide Feedback

When Flazz gets it wrong:
- Correct explicitly: "Actually, I prefer X"
- Flazz learns from corrections
- Patterns adjust quickly

### Review Periodically

Check learned patterns monthly:
- Remove outdated preferences
- Update changed workflows
- Confirm high-confidence patterns

## Advanced Features

### Learning Rate

Adjust how quickly Flazz learns:

```
Settings → Memory → Learning Rate
- Fast: Adapts after 3-5 observations
- Normal: Adapts after 5-10 observations
- Slow: Adapts after 10-20 observations
```

### Pattern Weights

Prioritize certain patterns:

```
Settings → Memory → Pattern Weights
- Communication style: High
- Tool preferences: Medium
- Time patterns: Low
```

### Export Patterns

Export learned patterns:

```bash
Settings → Memory → Export Patterns
# Saves to ~/Flazz/memory/.learning/export.json
```

### Import Patterns

Share patterns across devices:

```bash
Settings → Memory → Import Patterns
# Load from export.json
```

## Troubleshooting

### Flazz isn't learning

Check:
- Behavioral learning is enabled
- Sufficient interactions (20+ minimum)
- Patterns are consistent enough
- Confidence threshold not too high

### Wrong patterns learned

Solutions:
- Correct explicitly
- Edit preferences manually
- Reset specific patterns
- Adjust learning rate

### Too aggressive adaptation

If Flazz adapts too quickly:
- Reduce learning rate
- Increase confidence threshold
- Review and edit patterns

## Further Reading

- [Memory System Overview](README.md)
- [Graph Memory](graph-memory.md)
- [Skills System](../skills/README.md)
