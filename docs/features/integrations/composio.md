# Composio Integration

Connect to 100+ platforms with a single API key using Composio.

## Overview

Composio provides unified access to:
- Communication platforms (Gmail, Slack, Discord)
- Development tools (GitHub, GitLab, Jira)
- Productivity apps (Notion, Google Docs, Asana)
- CRM systems (Salesforce, HubSpot)
- And 100+ more platforms

## Getting Started

### 1. Get Composio API Key

1. Go to https://app.composio.dev
2. Sign up for free account
3. Navigate to API Keys
4. Copy your API key

### 2. Add to Flazz

1. Open Flazz
2. Settings → Integrations → Composio
3. Paste your API key
4. Click "Connect"

### 3. Enable Platforms

1. Settings → Integrations → Composio → Platforms
2. Toggle platforms you want to use
3. Authorize access when prompted

## Supported Platforms

### Communication
- Gmail, Outlook, Yahoo Mail
- Slack, Discord, Microsoft Teams
- Telegram, WhatsApp Business

### Development
- GitHub, GitLab, Bitbucket
- Jira, Linear, Asana
- Jenkins, CircleCI, Travis CI

### Productivity
- Notion, Confluence, Google Docs
- Trello, Monday.com, ClickUp
- Evernote, OneNote

### Calendar & Scheduling
- Google Calendar, Outlook Calendar
- Calendly, Cal.com

### CRM & Sales
- Salesforce, HubSpot, Pipedrive
- Zoho CRM, Copper

### Storage
- Google Drive, Dropbox, OneDrive
- Box, AWS S3

### And Many More
See full list: https://docs.composio.dev/apps

## Usage Examples

### Send Email

```
You: "Email the team about tomorrow's deployment"

Flazz: Uses Gmail via Composio to send email
```

### Create Calendar Event

```
You: "Schedule a meeting with Sarah next Tuesday at 2pm"

Flazz: Creates event in Google Calendar
```

### Create GitHub Issue

```
You: "Create a ticket for the login bug"

Flazz: Creates issue in your GitHub repository
```

### Update Notion Page

```
You: "Add this to my project notes in Notion"

Flazz: Updates your Notion page
```

### Post to Slack

```
You: "Post this update to #engineering channel"

Flazz: Posts message to Slack
```

## Configuration

### Platform Settings

Configure each platform:

```json
{
  "gmail": {
    "enabled": true,
    "default_from": "you@example.com",
    "signature": "Best regards,\nYour Name"
  },
  "slack": {
    "enabled": true,
    "default_channel": "#general",
    "workspace": "your-workspace"
  },
  "github": {
    "enabled": true,
    "default_repo": "username/repo",
    "default_labels": ["bug"]
  }
}
```

### Workflow Automation

Create cross-platform workflows:

```
When: New GitHub PR
Then: 
  1. Post to Slack #code-review
  2. Add to Google Calendar
  3. Create Linear task
```

## Security

### OAuth Tokens

- Stored securely in system keychain
- Never exposed to Flazz code
- Managed by Composio

### Permissions

- Grant only needed permissions
- Revoke access anytime
- Audit access logs

### Data Privacy

- Composio handles authentication
- No data stored by Composio
- Direct API calls to platforms

## Troubleshooting

### Connection Failed

1. Verify API key is correct
2. Check internet connection
3. Try reconnecting
4. Check Composio status

### Platform Not Working

1. Re-authorize platform
2. Check platform permissions
3. Verify platform is enabled
4. Check platform status page

### Rate Limits

If you hit rate limits:
- Upgrade Composio plan
- Reduce API call frequency
- Use caching when possible

## Further Reading

- [Composio Documentation](https://docs.composio.dev)
- [Integrations Overview](README.md)
- [MCP Servers](mcp-servers.md)
