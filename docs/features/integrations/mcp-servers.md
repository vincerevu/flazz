# MCP Servers

Connect Flazz to external tools using the Model Context Protocol (MCP).

## Overview

MCP (Model Context Protocol) is a standard for connecting AI to external tools. MCP servers provide:
- File system access
- Database connections
- API integrations
- Custom tools

## What is MCP?

MCP is an open protocol that allows AI assistants to:
- Access external data sources
- Execute tools and commands
- Integrate with services
- Extend capabilities

Learn more: https://modelcontextprotocol.io

## Built-in MCP Servers

Flazz includes several MCP servers:

### Filesystem Server
Access local files and directories

### Git Server
Git operations and repository management

### Database Server
Query databases (PostgreSQL, MySQL, SQLite)

### Web Server
Fetch web content and APIs

## Adding MCP Servers

### 1. Install Server

Most MCP servers use `uvx` (Python):

```bash
# Install uv first
curl -LsSf https://astral.sh/uv/install.sh | sh

# Servers are auto-downloaded by uvx when needed
```

### 2. Configure in Flazz

Add to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "uvx",
      "args": ["mcp-server-filesystem"],
      "env": {
        "ALLOWED_DIRECTORIES": "/Users/you/projects"
      }
    },
    "postgres": {
      "command": "uvx",
      "args": ["mcp-server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/mydb"
      }
    }
  }
}
```

### 3. Restart Flazz

Servers will connect automatically on startup.

## Popular MCP Servers

### Filesystem
```json
{
  "filesystem": {
    "command": "uvx",
    "args": ["mcp-server-filesystem"],
    "env": {
      "ALLOWED_DIRECTORIES": "/path/to/allowed/dirs"
    }
  }
}
```

### PostgreSQL
```json
{
  "postgres": {
    "command": "uvx",
    "args": ["mcp-server-postgres"],
    "env": {
      "DATABASE_URL": "postgresql://user:pass@localhost/db"
    }
  }
}
```

### GitHub
```json
{
  "github": {
    "command": "uvx",
    "args": ["mcp-server-github"],
    "env": {
      "GITHUB_TOKEN": "your_token"
    }
  }
}
```

### Brave Search
```json
{
  "brave-search": {
    "command": "uvx",
    "args": ["mcp-server-brave-search"],
    "env": {
      "BRAVE_API_KEY": "your_key"
    }
  }
}
```

## Creating Custom MCP Servers

### Python Example

```python
from mcp.server import Server, Tool

server = Server("my-custom-server")

@server.tool()
async def my_tool(param: str) -> str:
    """Tool description"""
    # Your logic here
    return f"Result: {param}"

if __name__ == "__main__":
    server.run()
```

### TypeScript Example

```typescript
import { Server } from "@modelcontextprotocol/sdk";

const server = new Server({
  name: "my-custom-server",
  version: "1.0.0"
});

server.tool({
  name: "my_tool",
  description: "Tool description",
  parameters: {
    param: { type: "string" }
  },
  handler: async ({ param }) => {
    // Your logic here
    return `Result: ${param}`;
  }
});

server.listen();
```

## Managing MCP Servers

### View Connected Servers

Settings → Integrations → MCP Servers

Shows:
- Server name and status
- Available tools
- Connection health
- Logs

### Enable/Disable Servers

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "uvx",
      "args": ["mcp-server-filesystem"],
      "disabled": false  // Set to true to disable
    }
  }
}
```

### View Server Logs

Settings → Integrations → MCP → [Server Name] → View Logs

### Reconnect Server

If a server disconnects:
1. Settings → Integrations → MCP
2. Click server name
3. Click "Reconnect"

## Security

### Permissions

MCP servers run with limited permissions:
- File access restricted to allowed directories
- Network access controlled
- No system-level access

### Environment Variables

Store sensitive data in environment variables:

```json
{
  "env": {
    "API_KEY": "your_key",
    "DATABASE_URL": "connection_string"
  }
}
```

### Sandboxing

Servers run in isolated processes:
- Cannot access Flazz internals
- Limited system access
- Monitored resource usage

## Troubleshooting

### Server Won't Start

1. Check command exists: `which uvx`
2. Verify configuration syntax
3. Check server logs
4. Try running command manually

### Server Disconnects

1. Check server logs for errors
2. Verify environment variables
3. Check resource usage
4. Restart server

### Tools Not Available

1. Verify server is connected
2. Check server implements tools
3. Restart Flazz
4. Check server logs

## Further Reading

- [MCP Documentation](https://modelcontextprotocol.io)
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers)
- [Integrations Overview](README.md)
- [Custom Integrations](custom-integrations.md)
