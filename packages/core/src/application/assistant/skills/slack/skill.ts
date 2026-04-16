import { slackToolCatalogMarkdown } from "./tool-catalog.js";

const skill = String.raw`
# Slack Integration Skill

You can interact with Slack to help users communicate with their team. Prefer normalized integration tools for reading/searching Slack data, and use raw Composio actions only as a last resort for send/write flows.

## Prerequisites

Before using Slack tools, ALWAYS check if Slack is connected:
\`\`\`
composio-checkConnection({ app: "slack" })
\`\`\`

If not connected, inform the user they need to connect Slack from the settings/onboarding.

## Available Tools

Flazz exposes normalized integration tools for the common Slack read path:

### Check Connection
\`\`\`
composio-checkConnection({ app: "slack" })
\`\`\`
Returns whether Slack is connected and ready to use.

### Search Slack Messages
\`\`\`
integration-searchItemsCompact({ app: "slack", query: "deployment incident", limit: 10 })
\`\`\`
Returns compact normalized Slack message items.

### Read One Slack Item
\`\`\`
integration-getItemFull({
  app: "slack",
  itemId: "message-id-from-search"
})
\`\`\`
Fetches one full Slack item after search/list selection.

### Prefer Lightweight Reads First
\`\`\`
integration-getItemSummary({ app: "slack", itemId: "message-id-from-search" })
integration-getItemDetailed({ app: "slack", itemId: "message-id-from-search" })
integration-getItemSlices({ app: "slack", itemId: "message-id-from-search" })
\`\`\`
Use summary or detailed structured reads before full raw content when they are sufficient.

## Raw Slack Fallback Catalog
If you need to send a message or the normalized read path cannot satisfy the task, use the pinned raw Composio Slack catalog below as a last resort.

${slackToolCatalogMarkdown}

## Workflow

### Step 1: Check Connection
\`\`\`
composio-checkConnection({ app: "slack" })
\`\`\`

### Step 2: Use normalized tools first
\`\`\`
integration-searchItemsCompact({ app: "slack", query: "error budget", limit: 10 })
\`\`\`

### Step 3: Read full context if needed
\`\`\`
integration-getItemFull({
  app: "slack",
  itemId: "message-id-from-search"
})
\`\`\`

### Step 4: Use raw fallback only for send/write flows
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

### Search Messages
\`\`\`
integration-searchItemsCompact({
  app: "slack",
  query: "in:@username",
  limit: 20
})
\`\`\`

## Best Practices

- **Always show drafts before sending** - Never send Slack messages without user confirmation
- **Summarize, don't dump** - When showing channel history, summarize the key points
- **Cross-reference with workspace memory** - Check if mentioned people have notes in workspace memory
- **Use normalized tools first** - Search and read Slack via normalized integration tools before touching raw Composio actions

## Error Handling

If a Slack operation fails:
1. Retry with \`integration-searchItemsCompact\` or \`integration-getItemFull\` first
2. Check if Slack is still connected with \`composio-checkConnection\`
3. Inform the user of the specific error
`;

export default skill;
