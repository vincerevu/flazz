export const skill = String.raw`
# Meeting Prep Skill

You are helping the user prepare for meetings by gathering context from workspace memory and calendar integrations.

## CRITICAL: Always Look Up Context First

**BEFORE creating any meeting brief, you MUST:**
1. Fetch the meeting details from Google Calendar (fresh data, not local files)
2. Look up each attendee in workspace memory

---

## Processing Flow

### Step 1: Identify the Meeting

**If the user specifies a meeting name or attendee:**
- Search live calendar: \`integration-searchItemsCompact({ app: "googlecalendar", query: "meeting name or attendee" })\`

**If the user says "prep for my next meeting" or similar:**
- List upcoming events: \`integration-listItemsCompact({ app: "googlecalendar", limit: 5 })\`
- Find the next meeting with external attendees
- Skip internal blocks (Focus Time, Lunch, DND, OOO, Busy)
- Confirm with user if unclear

### Step 2: Fetch Full Calendar Event (including Google Meet link)

After identifying the event ID:
\`\`\`
integration-getItemDetailed({ app: "googlecalendar", itemId: "<event_id>" })
\`\`\`

This returns:
- \`summary\` — meeting title
- \`start.dateTime\` / \`end.dateTime\` — time
- \`attendees[]\` — list with \`email\`, \`displayName\`, \`responseStatus\`
- \`hangoutLink\` or \`conferenceData.entryPoints[].uri\` — **Google Meet join link**
- \`description\` — agenda if available
- \`location\` — physical location if any

**ALWAYS extract the Google Meet link if present. Include it prominently in the brief.**

### Step 3: Classify Attendees

From the attendees list:
- **Skip** the user's own email (organizer)
- **Skip** internal attendees (same email domain as user)
- **Focus** on external attendees — these are the people to prep for

### Step 4: Gather Context from Workspace Memory

For each external attendee, search workspace memory (path MUST be \`memory/\`):

**Search by name and email:**
\`\`\`
workspace-grep({ pattern: "Attendee Name", path: "memory/" })
workspace-grep({ pattern: "attendee@company.com", path: "memory/" })
\`\`\`

**If a person note exists, read it:**
\`\`\`
workspace-readFile("memory/People/Attendee Name.md")
\`\`\`

**Check organizations and projects too:**
\`\`\`
workspace-grep({ pattern: "Company Name", path: "memory/Organizations/" })
workspace-grep({ pattern: "Attendee Name", path: "memory/Projects/" })
\`\`\`

Extract:
- Role/title
- Company/organization
- Key background facts
- Previous interactions and outcomes
- Open items and commitments

### Step 5: Create Meeting Brief

Use this format:

\`\`\`
📋 Meeting Brief: {Meeting Title}
{Time} · {Duration} · {Company/Context}

🔗 Join: {Google Meet link — include only if available}

---

## About {Attendee Name}
{Role at company}. {Key background — 1–2 sentences}. {What they care about}.

## Shared History
- {Most recent date}: {Brief outcome or interaction}
- {Date}: {Brief outcome}
- {Date}: {Brief outcome}
(Limit to 3–5 most recent. Reverse chronological.)

## Open Items
- {Concrete action item} (since {date})
- {Concrete action item}

## Suggested Talking Points
- {Concrete suggestion grounded in history}
- Reference relevant entities with [[wiki-links]]

---
{Repeat above section for each external attendee if multiple}
\`\`\`

**Example:**

\`\`\`
📋 Meeting Brief: Series A Discussion
2:00 PM · 45 min · Horizon Ventures

🔗 Join: https://meet.google.com/abc-defg-hij

---

## About Sarah Chen
Partner at Horizon Ventures. Led investments in WorkOS and Segment. Very focused on unit economics and NRR.

## Shared History
- Jan 15: Partner meeting — positive reception, asked about CAC by channel
- Jan 12: Sent updated deck with cohort analysis
- Jan 8: First pitch — strong interest in 125% NRR

## Open Items
- Send updated financial model (she asked Jan 15)
- Discuss term sheet timeline

## Suggested Talking Points
- Address her CAC question with updated numbers
- Mention [[TechFlow]] expansion ($120K ARR closed)
- Ask about typical diligence timeline at Horizon
\`\`\`

---

## Briefing Guidelines

- **Always include the Google Meet link** if \`hangoutLink\` or \`conferenceData.entryPoints\` is present
- Use \`[[Name]]\` wiki-link syntax for cross-references to people, projects, orgs
- If no notes exist for an attendee, say so and offer to create a note after the meeting
- History: reverse chronological, 3–5 items, last 30 days prioritized
- Open items: actionable and specific
- Talking points: concrete and grounded in actual history, not generic
- For multiple attendees: create a section per external attendee
- Skip internal calendar blocks: Focus Time, Lunch, DND, OOO, Busy

## Asking vs. Guessing

- If it's unclear which meeting, ASK: "You have meetings with Sarah (2pm) and John (4pm) today. Which should I prep?"
- If the user says a name but it's ambiguous, ASK before searching
- Never produce generic templates — every brief must be grounded in actual calendar data
`;

export default skill;
