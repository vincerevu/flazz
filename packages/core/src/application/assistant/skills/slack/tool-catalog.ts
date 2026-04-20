export type SlackToolDefinition = {
    name: string;
    slug: string;
    description: string;
};

// Only the tools commonly needed for everyday use.
// Full Slack API surface is available via composio-executeAction — add slugs here only when a skill needs them.
export const slackToolCatalog: SlackToolDefinition[] = [
    // --- Messaging ---
    { name: "Send Message", slug: "SLACK_SEND_MESSAGE", description: "Post a message to a channel, DM, or group. Use `channel` (ID) and `text`." },
    { name: "Send Ephemeral", slug: "SLACK_SEND_EPHEMERAL_MESSAGE", description: "Send a message visible only to one user in a channel." },
    { name: "Schedule Message", slug: "SLACK_SCHEDULE_MESSAGE", description: "Schedule a message for a future time (up to 120 days)." },
    { name: "Update Message", slug: "SLACK_UPDATES_A_SLACK_MESSAGE", description: "Edit an existing message by channel + timestamp." },
    { name: "Delete Message", slug: "SLACK_DELETES_A_MESSAGE_FROM_A_CHAT", description: "Delete a message by channel ID and timestamp." },
    { name: "Retrieve Replies", slug: "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION", description: "Fetch all replies in a thread from a parent message timestamp." },

    // --- Channels ---
    { name: "List Conversations", slug: "SLACK_LIST_CONVERSATIONS", description: "List channels/DMs accessible to the user. Filter by type: public_channel, private_channel, im, mpim." },
    { name: "Fetch History", slug: "SLACK_FETCH_CONVERSATION_HISTORY", description: "Fetch messages from a channel (up to 1000). Use `oldest`/`latest` to scope." },
    { name: "Get Conversation Members", slug: "SLACK_RETRIEVE_CONVERSATION_MEMBERS_LIST", description: "List user IDs in a channel." },
    { name: "Invite to Channel", slug: "SLACK_INVITE_USERS_TO_A_SLACK_CHANNEL", description: "Invite one or more users to a channel." },
    { name: "Create Channel", slug: "SLACK_CREATE_CHANNEL", description: "Create a new public or private channel." },

    // --- Search & Lookup ---
    { name: "Search Messages", slug: "SLACK_SEARCH_MESSAGES", description: "Workspace-wide full-text search. Supports `in:channel`, `from:user`, `before:date` modifiers." },
    { name: "Find User by Email", slug: "SLACK_FIND_USER_BY_EMAIL_ADDRESS", description: "Look up a Slack user ID from their email address." },
    { name: "Retrieve User Details", slug: "SLACK_RETRIEVE_DETAILED_USER_INFORMATION", description: "Get full profile for a user ID." },

    // --- Reactions ---
    { name: "Add Reaction", slug: "SLACK_ADD_REACTION_TO_AN_ITEM", description: "Add an emoji reaction to a message." },
    { name: "Remove Reaction", slug: "SLACK_REMOVE_REACTION_FROM_ITEM", description: "Remove an emoji reaction." },

    // --- Pins & Stars ---
    { name: "Pin Item", slug: "SLACK_PINS_AN_ITEM_TO_A_CHANNEL", description: "Pin a message to a channel." },
    { name: "Unpin Item", slug: "SLACK_UNPIN_ITEM_FROM_CHANNEL", description: "Unpin a message from a channel." },

    // --- Reminders ---
    { name: "Create Reminder", slug: "SLACK_CREATE_A_REMINDER", description: "Create a reminder. Supports natural language time strings." },
    { name: "List Reminders", slug: "SLACK_LIST_REMINDERS", description: "List all reminders for the current user." },
    { name: "Delete Reminder", slug: "SLACK_DELETE_A_SLACK_REMINDER", description: "Delete a reminder by ID." },

    // --- Status & Presence ---
    { name: "Set User Profile", slug: "SLACK_SET_SLACK_USER_PROFILE_INFORMATION", description: "Update profile fields including status emoji and status text." },
    { name: "Get User Presence", slug: "SLACK_GET_USER_PRESENCE_INFO", description: "Check if a user is active or away." },
];

export const slackToolCatalogMarkdown = slackToolCatalog
    .map((tool) => `- **${tool.name}** (\`${tool.slug}\`) — ${tool.description}`)
    .join("\n");
