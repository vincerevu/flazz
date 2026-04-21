# Custom Integrations

Build your own integrations to extend Flazz's capabilities.

## Overview

You can create custom integrations through:
- MCP servers (recommended)
- Direct API integrations
- Custom skills
- Code contributions

## MCP Server Integration

### Why MCP?

MCP servers are the recommended way to add integrations:
- Standard protocol
- Language agnostic
- Easy to develop
- Secure sandboxing

### Quick Start

1. **Choose a language**: Python or TypeScript
2. **Install MCP SDK**: `pip install mcp` or `npm install @modelcontextprotocol/sdk`
3. **Create server**: Implement tools
4. **Configure in Flazz**: Add to mcp.json
5. **Test**: Use tools in chat

### Python Example

```python
from mcp.server import Server, Tool
from mcp.types import TextContent

server = Server("my-integration")

@server.tool()
async def fetch_data(url: str) -> str:
    """Fetches data from a URL"""
    import httpx
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.text

@server.tool()
async def process_data(data: str, operation: str) -> str:
    """Processes data with specified operation"""
    if operation == "uppercase":
        return data.upper()
    elif operation == "lowercase":
        return data.lower()
    else:
        return data

if __name__ == "__main__":
    server.run()
```

### TypeScript Example

```typescript
import { Server } from "@modelcontextprotocol/sdk";

const server = new Server({
  name: "my-integration",
  version: "1.0.0"
});

server.tool({
  name: "fetch_data",
  description: "Fetches data from a URL",
  parameters: {
    url: { type: "string", description: "URL to fetch" }
  },
  handler: async ({ url }) => {
    const response = await fetch(url);
    return await response.text();
  }
});

server.tool({
  name: "process_data",
  description: "Processes data with specified operation",
  parameters: {
    data: { type: "string" },
    operation: { type: "string", enum: ["uppercase", "lowercase"] }
  },
  handler: async ({ data, operation }) => {
    if (operation === "uppercase") return data.toUpperCase();
    if (operation === "lowercase") return data.toLowerCase();
    return data;
  }
});

server.listen();
```

### Configuration

Add to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "my-integration": {
      "command": "python",
      "args": ["/path/to/your/server.py"],
      "env": {
        "API_KEY": "your_key"
      }
    }
  }
}
```

## Direct API Integration

### When to Use

Use direct API integration when:
- You need deep integration with Flazz
- MCP server is too limited
- You want to contribute to core

### Integration Points

**1. Tool Registration**

Add to `packages/core/src/application/lib/builtin-tools.ts`:

```typescript
export const myCustomTool: Tool = {
  name: "my_custom_tool",
  description: "Does something custom",
  parameters: z.object({
    param: z.string().describe("Parameter description")
  }),
  execute: async ({ param }) => {
    // Your logic here
    return { result: `Processed: ${param}` };
  }
};
```

**2. IPC Handler**

Add to `apps/main/src/ipc.ts`:

```typescript
ipcMain.handle("my-custom-action", async (event, data) => {
  // Your logic here
  return result;
});
```

**3. UI Component**

Add to `apps/renderer/src/features/`:

```typescript
export function MyCustomFeature() {
  const handleAction = async () => {
    const result = await window.api.myCustomAction(data);
    // Handle result
  };
  
  return <div>Your UI</div>;
}
```

## Skill-Based Integration

### Simple Integrations

For simple integrations, create a skill:

```markdown
---
name: my-api-integration
description: Integrates with My API
category: integrations
---

# My API Integration

## Instructions

1. Make API request to https://api.example.com
2. Parse response
3. Format output

## Parameters

- `endpoint`: API endpoint
- `method`: HTTP method (GET, POST, etc.)
- `data`: Request data (optional)

## Example

Input: { endpoint: "/users", method: "GET" }
Output: List of users
```

### Using External Commands

Skills can execute commands:

```markdown
## Instructions

1. Run command: `curl https://api.example.com/data`
2. Parse JSON response
3. Extract relevant fields
4. Format output
```

## Database Integration

### Via MCP Server

Use existing database MCP servers:

```json
{
  "postgres": {
    "command": "uvx",
    "args": ["mcp-server-postgres"],
    "env": {
      "DATABASE_URL": "postgresql://localhost/mydb"
    }
  }
}
```

### Custom Database Tool

Create custom database tool:

```python
from mcp.server import Server
import asyncpg

server = Server("my-db")

@server.tool()
async def query_database(sql: str) -> list:
    """Executes SQL query"""
    conn = await asyncpg.connect("postgresql://localhost/mydb")
    try:
        results = await conn.fetch(sql)
        return [dict(row) for row in results]
    finally:
        await conn.close()
```

## Authentication

### API Keys

Store in environment variables:

```json
{
  "env": {
    "API_KEY": "your_key",
    "API_SECRET": "your_secret"
  }
}
```

### OAuth

For OAuth integrations:

1. Use Composio (easiest)
2. Or implement OAuth flow in MCP server
3. Store tokens securely

### Basic Auth

```python
@server.tool()
async def authenticated_request(url: str) -> str:
    import httpx
    import os
    
    auth = (os.getenv("USERNAME"), os.getenv("PASSWORD"))
    async with httpx.AsyncClient(auth=auth) as client:
        response = await client.get(url)
        return response.text
```

## Error Handling

### In MCP Servers

```python
from mcp.server import Server
from mcp.types import ErrorCode, McpError

@server.tool()
async def my_tool(param: str) -> str:
    try:
        # Your logic
        return result
    except ValueError as e:
        raise McpError(ErrorCode.InvalidParams, str(e))
    except Exception as e:
        raise McpError(ErrorCode.InternalError, str(e))
```

### In Skills

```markdown
## Error Handling

If API request fails:
1. Check error message
2. Retry with exponential backoff
3. If still fails, return error to user

Error format:
"Error: [Error message]. Please check [what to check]."
```

## Testing

### Test MCP Server

```python
# test_server.py
import pytest
from your_server import server

@pytest.mark.asyncio
async def test_my_tool():
    result = await server.call_tool("my_tool", {"param": "test"})
    assert result == "expected"
```

### Test Integration

```bash
# Run server manually
python your_server.py

# In another terminal, test with MCP client
mcp-client test localhost:3000 my_tool '{"param": "test"}'
```

## Deployment

### Package MCP Server

```bash
# Python
pip install build
python -m build

# TypeScript
npm run build
npm pack
```

### Distribute

Options:
1. PyPI (Python): `pip install your-mcp-server`
2. npm (TypeScript): `npm install your-mcp-server`
3. GitHub releases
4. Direct download

### Installation Instructions

Provide clear instructions:

```markdown
## Installation

1. Install the server:
   ```bash
   pip install your-mcp-server
   ```

2. Configure in Flazz:
   Add to `~/.kiro/settings/mcp.json`:
   ```json
   {
     "your-server": {
       "command": "uvx",
       "args": ["your-mcp-server"],
       "env": {
         "API_KEY": "your_key"
       }
     }
   }
   ```

3. Restart Flazz
```

## Best Practices

### Security

- Validate all inputs
- Use environment variables for secrets
- Implement rate limiting
- Log security events

### Performance

- Cache responses when possible
- Use async/await
- Implement timeouts
- Handle large data efficiently

### Error Messages

- Provide clear error messages
- Include troubleshooting steps
- Log errors for debugging
- Don't expose sensitive info

### Documentation

- Document all tools
- Provide examples
- Include troubleshooting guide
- Keep README updated

## Examples

### Weather API Integration

```python
from mcp.server import Server
import httpx
import os

server = Server("weather")

@server.tool()
async def get_weather(city: str) -> dict:
    """Gets weather for a city"""
    api_key = os.getenv("WEATHER_API_KEY")
    url = f"https://api.weather.com/v1/weather?city={city}&key={api_key}"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()
```

### Database Query Tool

```python
from mcp.server import Server
import asyncpg

server = Server("database")

@server.tool()
async def query(sql: str) -> list:
    """Executes SQL query"""
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        results = await conn.fetch(sql)
        return [dict(row) for row in results]
    finally:
        await conn.close()
```

### File Processing Tool

```python
from mcp.server import Server
import os

server = Server("files")

@server.tool()
async def process_file(path: str, operation: str) -> str:
    """Processes a file"""
    if not os.path.exists(path):
        raise ValueError(f"File not found: {path}")
    
    with open(path, 'r') as f:
        content = f.read()
    
    if operation == "count_lines":
        return str(len(content.splitlines()))
    elif operation == "count_words":
        return str(len(content.split()))
    else:
        raise ValueError(f"Unknown operation: {operation}")
```

## Further Reading

- [MCP Documentation](https://modelcontextprotocol.io)
- [MCP Servers Guide](mcp-servers.md)
- [Contributing Guide](../../../CONTRIBUTING.md)
- [Architecture Overview](../../architecture/overview.md)
