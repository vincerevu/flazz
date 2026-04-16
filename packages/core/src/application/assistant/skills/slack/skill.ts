import { slackToolCatalogMarkdown } from "./tool-catalog.js";

const skill = String.raw`
# Slack Integration Skill

You can interact with Slack to help users communicate with their team. This includes sending messages, viewing channel history, finding users, and searching conversations.

## Prerequisites

Before using Slack tools, ALWAYS check if Slack is connected:
\`\`\`
composio-checkConnection({ app: "slack" })
\`\`\`

If not connected, inform the user they need to connect Slack from the settings/onboarding.

## Available Tools

Flazz uses generic Composio tools that work with any app (slack, gmail, github, etc.). For Slack operations:

### Check Connection
\`\`\`
composio-checkConnection({ app: "slack" })
\`\`\`
Returns whether Slack is connected and ready to use.

### Discover Available Tools
\`\`\`
composio-listTools({ app: "slack", search: "message" })
\`\`\`
Lists available Slack tools from Composio. ALWAYS call this first to discover tool slugs and their required parameters.

### Execute Any Slack Action
\`\`\`
composio-executeAction({
  app: "slack",
  toolSlug: "SLACK_SEND_MESSAGE",
  input: { channel: "C01234567", text: "Hello!" }
})
\`\`\`
Executes any Slack action using its exact slug from composio-listTools.

## Composio Slack Tool Catalog (Pinned)
Use the exact tool slugs below with \`composio-executeAction\` when needed. Prefer these over \`composio-listTools\` to avoid redundant discovery.

${slackToolCatalogMarkdown}

## Workflow

### Step 1: Check Connection
\`\`\`
composio-checkConnection({ app: "slack" })
\`\`\`

### Step 2: Discover Tools (if needed)
\`\`\`
composio-listTools({ app: "slack", search: "send message" })
\`\`\`

### Step 3: Execute Action
\`\`\`
composio-executeAction({
  app: "slack",
  toolSlug: "SLACK_SEND_MESSAGE",
  input: { channel: "C01234567", text: "Hello team!" }
})
\`\`\`

## Common Tasks

### Send a Message
1. Draft the message and show it to the user
2. ONLY after user approval:
\`\`\`
composio-executeAction({
  app: "slack",
  toolSlug: "SLACK_SEND_MESSAGE",
  input: { channel: "C01234567", text: "Hello!" }
})
\`\`\`

### List Channels
\`\`\`
composio-executeAction({
  app: "slack",
  toolSlug: "SLACK_LIST_CONVERSATIONS",
  input: { types: "public_channel,private_channel", limit: 100 }
})
\`\`\`

### Get Channel History
\`\`\`
composio-executeAction({
  app: "slack",
  toolSlug: "SLACK_FETCH_CONVERSATION_HISTORY",
  input: { channel: "C01234567", limit: 20 }
})
\`\`\`

### Search Messages
\`\`\`
composio-executeAction({
  app: "slack",
  toolSlug: "SLACK_SEARCH_MESSAGES",
  input: { query: "in:@username", count: 20 }
})
\`\`\`

### List Users
\`\`\`
composio-executeAction({
  app: "slack",
  toolSlug: "SLACK_LIST_ALL_USERS",
  input: { limit: 100 }
})
\`\`\`

## Best Practices

- **Always show drafts before sending** - Never send Slack messages without user confirmation
- **Summarize, don't dump** - When showing channel history, summarize the key points
- **Cross-reference with workspace memory** - Check if mentioned people have notes in workspace memory
- **Use the tool catalog** - Prefer using known tool slugs from the catalog over calling composio-listTools

## Error Handling

If a Slack operation fails:
1. Try \`composio-listTools\` to verify the tool slug is correct and check required parameters
2. Check if Slack is still connected with \`composio-checkConnection\`
3. Inform the user of the specific error
`;

export default skill;
