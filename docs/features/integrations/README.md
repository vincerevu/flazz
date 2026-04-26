# Integrations

Connect Flazz with external services to extend its capabilities.

## Overview

Flazz supports two types of integrations:

1. **Composio** - Connect 100+ platforms with one API key
2. **MCP Servers** - Model Context Protocol for custom integrations

## Composio Integration

### What is Composio?

Composio provides unified access to 100+ platforms:
- Gmail, Outlook, Calendar
- Slack, Discord, Teams
- GitHub, GitLab, Jira
- Google Drive, Dropbox
- Notion, Airtable
- And many more...

**One API key, all platforms.**

### Setup

**Get API Key:**
1. Sign up at [Composio.dev](https://composio.dev/)
2. Get your API key from dashboard

**Configure in Flazz:**
1. Settings → Integrations → Composio
2. Enter API key
3. Click "Connect"
4. Select apps to enable

### Connecting Apps

**Via UI:**
1. Settings → Integrations → Composio → Apps
2. Click app to connect (e.g., Gmail)
3. Authorize access
4. App is now connected

**Via Chat:**
```
You: Connect my Gmail

Flazz: I'll help you connect Gmail.
[Opens authorization flow]

Connected! You can now:
- Read emails
- Send emails
- Search inbox
- Manage labels
```

### Using Connected Apps

**In Chat:**
```
You: Check my emails from today

Flazz: [Fetches emails via Composio]
You have 5 new emails:
1. Meeting reminder from John
2. Project update from Sarah
...

You: Reply to John that I'll be there

Flazz: [Sends email via Gmail]
Email sent!
```

**With Skills:**
```yaml
name: email-assistant
description: Manages emails
integrations:
  - composio:gmail
instructions: |
  Help user manage emails:
  - Check inbox
  - Send replies
  - Schedule follow-ups
```

### Supported Apps

**Communication:**
- Gmail, Outlook
- Slack, Discord, Teams
- Telegram, WhatsApp

**Productivity:**
- Google Calendar, Outlook Calendar
- Notion, Airtable
- Trello, Asana, Jira

**Development:**
- GitHub, GitLab, Bitbucket
- Linear, ClickUp
- Sentry, Datadog

**Storage:**
- Google Drive, Dropbox
- OneDrive, Box

**Social:**
- Twitter, LinkedIn
- YouTube, Instagram

**Finance:**
- Stripe, PayPal
- QuickBooks

[Full list](https://composio.dev/apps)

### Common Use Cases

**Email Management:**
```
- "Summarize emails from this week"
- "Draft reply to latest email"
- "Schedule email to send tomorrow"
- "Find emails about project X"
```

**Calendar:**
```
- "What's on my calendar today?"
- "Schedule meeting with team"
- "Find free time this week"
- "Reschedule tomorrow's 2pm meeting"
```

**Task Management:**
```
- "Create Jira ticket for bug"
- "Update task status to done"
- "List my open tasks"
- "Assign task to John"
```

**Code & Development:**
```
- "Create GitHub issue"
- "List open pull requests"
- "Merge PR #123"
- "Deploy to production"
```

### Configuration

**App Settings:**
```json
{
  "composio": {
    "apiKey": "comp_...",
    "enabledApps": [
      "gmail",
      "calendar",
      "slack",
      "github"
    ],
    "autoSync": true,
    "syncInterval": 300000,  // 5 minutes
    "permissions": {
      "gmail": ["read", "send"],
      "calendar": ["read", "write"],
      "slack": ["read", "send"],
      "github": ["read", "write"]
    }
  }
}
```

**Rate Limits:**
- Free tier: 100 requests/day
- Pro tier: 10,000 requests/day
- Enterprise: Unlimited

## MCP Servers

### What is MCP?

Model Context Protocol (MCP) enables custom integrations:
- File system access
- Database connections
- Custom APIs
- Local tools
- System commands

### Built-in MCP Servers

**Filesystem:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/directory"
      ]
    }
  }
}
```

**Usage:**
```
You: List files in my project

Flazz: [Uses filesystem MCP]
Found 23 files:
- src/main.ts
- src/utils.ts
...
```

**GitHub:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

**Usage:**
```
You: Show my GitHub repos

Flazz: [Uses GitHub MCP]
You have 15 repositories:
1. flazz (⭐ 234)
2. my-project (⭐ 12)
...
```

**Database:**
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

**Usage:**
```
You: Query users table

Flazz: [Executes SQL via MCP]
Found 150 users...
```

### Creating Custom MCP Servers

**Simple Example:**

```typescript
// my-mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk';

const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0'
});

server.tool('get-weather', async (args) => {
  const { city } = args;
  // Fetch weather data
  return { temp: 72, condition: 'sunny' };
});

server.listen();
```

**Configure:**
```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["./my-mcp-server.js"]
    }
  }
}
```

**Use:**
```
You: What's the weather in SF?

Flazz: [Uses custom MCP]
San Francisco: 72°F, Sunny
```

### MCP Server Management

**List Servers:**
```
Settings → Integrations → MCP Servers
```

**Add Server:**
1. Click "Add Server"
2. Enter configuration
3. Test connection
4. Save

**Enable/Disable:**
```json
{
  "mcpServers": {
    "filesystem": {
      "enabled": true
    },
    "github": {
      "enabled": false
    }
  }
}
```

**Logs:**
```
Settings → Integrations → MCP Servers → [Server] → Logs
```

## Custom Integrations

### REST APIs

Call any REST API:

```yaml
name: weather-api
type: rest
config:
  baseUrl: https://api.weather.com
  auth:
    type: apiKey
    key: YOUR_KEY
  endpoints:
    - name: current
      method: GET
      path: /current/{city}
```

**Usage:**
```
@weather-api current city=SF
```

### Webhooks

Receive events from external services:

```yaml
name: github-webhook
type: webhook
config:
  url: https://flazz.local/webhooks/github
  events:
    - push
    - pull_request
  actions:
    - skill: notify-team
    - skill: run-tests
```

### Custom Scripts

Run local scripts:

```yaml
name: backup-script
type: script
config:
  command: ./backup.sh
  args: [--full]
  schedule: "0 0 * * *"  # Daily
```

## Integration Security

### Permissions

Control what integrations can access:

```json
{
  "integrations": {
    "permissions": {
      "filesystem": {
        "read": ["/home/user/projects"],
        "write": ["/home/user/projects/output"]
      },
      "network": {
        "allowedDomains": [
          "api.github.com",
          "api.openai.com"
        ]
      }
    }
  }
}
```

### API Key Storage

- Keys encrypted at rest
- Stored in system keychain
- Never logged or transmitted
- Can be rotated anytime

### Audit Log

Track integration usage:

```
Settings → Integrations → Audit Log
```

**Logged Events:**
- API calls made
- Data accessed
- Errors occurred
- Permissions changed

## Troubleshooting

### Connection Failed

**Check:**
1. API key is valid
2. Internet connection
3. Service is online
4. Permissions granted

**Test:**
```
Settings → Integrations → [Service] → Test Connection
```

### Rate Limit Exceeded

**Error:** "Too many requests"

**Solutions:**
- Wait and retry
- Upgrade plan
- Optimize requests
- Cache results

### Permission Denied

**Error:** "Access denied"

**Solutions:**
- Re-authorize app
- Check permissions
- Verify API key
- Contact support

### Integration Not Working

**Debug:**
1. Check logs
2. Test connection
3. Verify configuration
4. Try different endpoint

## Best Practices

### Security

**Do:**
- Use environment variables for keys
- Rotate keys regularly
- Limit permissions
- Monitor usage

**Don't:**
- Commit keys to git
- Share keys publicly
- Grant unnecessary permissions
- Ignore security warnings

### Performance

**Optimize:**
- Cache responses
- Batch requests
- Use webhooks instead of polling
- Implement rate limiting

### Reliability

**Ensure:**
- Handle errors gracefully
- Implement retries
- Log failures
- Monitor uptime

## Advanced Topics

- [Composio Setup](./composio.md) - Detailed guide
- [MCP Servers](./mcp-servers.md) - Custom integrations
- [Custom Integrations](./custom-integrations.md) - Build your own
- [Integration API](./api.md) - Programmatic access

## Related Features

- [Skills](../skills/README.md) - Use integrations in skills
- [Chat](../chat/README.md) - Use integrations in chat
- [Workspace](../workspace/README.md) - Integrate with workspace

## Next Steps

- [Composio Guide](./composio.md) - Connect apps
- [MCP Servers](./mcp-servers.md) - Custom integrations
- [Examples](./examples.md) - Integration examples

## Support

- [Composio Docs](https://docs.composio.dev/) - Composio help
- [MCP Docs](https://modelcontextprotocol.io/) - MCP help
- [GitHub Issues](https://github.com/vincerevu/flazz/issues) - Report bugs
