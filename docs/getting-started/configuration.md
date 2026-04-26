# Configuration

Complete guide to configuring Flazz for your needs.

## Configuration File Location

Flazz stores configuration in:
- **Windows**: `%APPDATA%\Flazz\config.json`
- **macOS**: `~/Library/Application Support/Flazz/config.json`
- **Linux**: `~/.config/Flazz/config.json`

## AI Providers

### Supported Providers

Flazz supports multiple AI providers:

| Provider | Models | API Key Required |
|----------|--------|------------------|
| OpenAI | GPT-4, GPT-3.5 | Yes |
| Anthropic | Claude 3 (Opus, Sonnet, Haiku) | Yes |
| Google | Gemini Pro, Gemini Ultra | Yes |
| Mistral | Mistral Large, Medium, Small | Yes |
| Groq | Llama 3, Mixtral | Yes |
| Ollama | Any local model | No |
| OpenRouter | 100+ models | Yes |

### Adding a Provider

**Via UI:**
1. Settings → AI Providers
2. Click "Add Provider"
3. Select provider type
4. Enter API key and configuration
5. Click "Test Connection"
6. Save

**Via Config File:**
```json
{
  "aiProviders": [
    {
      "id": "openai-1",
      "type": "openai",
      "name": "OpenAI",
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "models": ["gpt-4", "gpt-3.5-turbo"],
      "enabled": true
    }
  ]
}
```

### Provider-Specific Configuration

#### OpenAI
```json
{
  "type": "openai",
  "apiKey": "sk-...",
  "organization": "org-...",  // Optional
  "baseUrl": "https://api.openai.com/v1",
  "models": ["gpt-4", "gpt-3.5-turbo"]
}
```

#### Anthropic (Claude)
```json
{
  "type": "anthropic",
  "apiKey": "sk-ant-...",
  "models": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"]
}
```

#### Ollama (Local)
```json
{
  "type": "ollama",
  "baseUrl": "http://localhost:11434",
  "models": ["llama2", "mistral", "codellama"]
}
```

#### Azure OpenAI
```json
{
  "type": "azure-openai",
  "apiKey": "...",
  "endpoint": "https://your-resource.openai.azure.com",
  "deployment": "gpt-4",
  "apiVersion": "2024-02-15-preview"
}
```

## Model Settings

### Default Model

Set your preferred default model:

Settings → AI Providers → Default Model → Select model

### Model Parameters

Customize model behavior per provider:

```json
{
  "modelDefaults": {
    "temperature": 0.7,      // 0.0 - 2.0 (creativity)
    "maxTokens": 4096,       // Max response length
    "topP": 1.0,             // Nucleus sampling
    "frequencyPenalty": 0.0, // Reduce repetition
    "presencePenalty": 0.0   // Encourage new topics
  }
}
```

**Temperature Guide:**
- `0.0-0.3` - Focused, deterministic (code, facts)
- `0.4-0.7` - Balanced (general use)
- `0.8-1.0` - Creative (writing, brainstorming)
- `1.1-2.0` - Very creative (experimental)

## Memory Configuration

### Memory Settings

```json
{
  "memory": {
    "enabled": true,
    "graphMemory": {
      "enabled": true,
      "maxNodes": 10000,
      "pruneOldNodes": true,
      "retentionDays": 90
    },
    "behavioralLearning": {
      "enabled": true,
      "learningRate": 0.1,
      "minConfidence": 0.7
    },
    "contextWindow": {
      "maxMessages": 50,
      "maxTokens": 100000
    }
  }
}
```

### Memory Retention

Control how long Flazz remembers:

- **Short-term**: Current conversation only
- **Medium-term**: Last 7 days
- **Long-term**: Forever (default)

Settings → Memory → Retention Policy

## Workspace Configuration

### Workspace Location

Change where Flazz stores your data:

Settings → Workspace → Location → Choose folder

Default locations:
- **Windows**: `%USERPROFILE%\Flazz`
- **macOS**: `~/Flazz`
- **Linux**: `~/Flazz`

### Auto-save

```json
{
  "workspace": {
    "autoSave": true,
    "autoSaveInterval": 30000,  // milliseconds
    "backupEnabled": true,
    "backupInterval": 86400000  // 24 hours
  }
}
```

### Search Settings

```json
{
  "search": {
    "fuzzyMatch": true,
    "caseSensitive": false,
    "maxResults": 100,
    "indexingEnabled": true
  }
}
```

## Integration Configuration

### Composio

Connect 100+ platforms with one API key:

1. Get API key from [Composio](https://composio.dev/)
2. Settings → Integrations → Composio
3. Enter API key
4. Select apps to connect

```json
{
  "integrations": {
    "composio": {
      "apiKey": "...",
      "enabledApps": ["gmail", "calendar", "slack"],
      "autoSync": true
    }
  }
}
```

### MCP Servers

Configure Model Context Protocol servers:

Settings → Integrations → MCP Servers → Add Server

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
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

## Skills Configuration

### Auto-execution

```json
{
  "skills": {
    "autoExecute": false,      // Require confirmation
    "timeout": 30000,          // 30 seconds
    "maxConcurrent": 3,        // Parallel skills
    "enableAIGeneration": true // AI can create skills
  }
}
```

### Skill Storage

Skills are stored in:
`<workspace>/skills/`

## UI Configuration

### Appearance

```json
{
  "appearance": {
    "theme": "dark",           // "light" | "dark" | "auto"
    "fontSize": 14,            // 10-20
    "fontFamily": "system-ui",
    "compactMode": false,
    "showLineNumbers": true,
    "syntaxHighlighting": true
  }
}
```

### Keyboard Shortcuts

Customize shortcuts:

Settings → Keyboard Shortcuts

Default shortcuts:
- `Ctrl/Cmd + N` - New chat
- `Ctrl/Cmd + K` - Quick search
- `Ctrl/Cmd + ,` - Settings
- `Ctrl/Cmd + B` - Toggle sidebar
- `Ctrl/Cmd + /` - Command palette

## Privacy & Security

### Data Collection

```json
{
  "privacy": {
    "telemetry": false,        // Anonymous usage stats
    "crashReports": true,      // Help fix bugs
    "shareMemory": false       // Never share by default
  }
}
```

### API Key Security

- API keys are encrypted at rest
- Never shared or transmitted except to provider
- Stored in system keychain when available

### Local-First

All data stays on your machine:
- Conversations
- Memory graph
- Skills
- Workspace files

Only API calls go to providers.

## Performance

### Resource Limits

```json
{
  "performance": {
    "maxMemoryMB": 2048,       // RAM limit
    "maxCPUPercent": 80,       // CPU usage
    "enableGPU": true,         // Hardware acceleration
    "cacheSize": 500           // MB for cache
  }
}
```

### Background Jobs

```json
{
  "backgroundJobs": {
    "enabled": true,
    "maxConcurrent": 2,
    "indexing": {
      "enabled": true,
      "schedule": "0 */6 * * *"  // Every 6 hours
    },
    "memoryPruning": {
      "enabled": true,
      "schedule": "0 0 * * *"     // Daily at midnight
    }
  }
}
```

## Advanced Settings

### Debug Mode

Enable for troubleshooting:

Settings → Advanced → Debug Mode

Or set environment variable:
```bash
FLAZZ_DEBUG=true
```

### Logging

```json
{
  "logging": {
    "level": "info",           // "debug" | "info" | "warn" | "error"
    "file": true,              // Log to file
    "console": false,          // Log to console
    "maxFiles": 7,             // Keep 7 days
    "maxSize": "10m"           // 10MB per file
  }
}
```

### Experimental Features

```json
{
  "experimental": {
    "voiceInput": false,
    "imageGeneration": false,
    "multimodalChat": false,
    "collaborativeEditing": false
  }
}
```

## Environment Variables

Override config with environment variables:

```bash
# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Workspace
FLAZZ_WORKSPACE_PATH=/custom/path

# Debug
FLAZZ_DEBUG=true
FLAZZ_LOG_LEVEL=debug

# Performance
FLAZZ_MAX_MEMORY=4096
```

## Configuration Backup

### Export Configuration

Settings → Advanced → Export Configuration

Saves to: `flazz-config-backup-YYYY-MM-DD.json`

### Import Configuration

Settings → Advanced → Import Configuration

**Note:** API keys are not included in exports for security.

## Troubleshooting Configuration

### Reset to Defaults

Settings → Advanced → Reset to Defaults

Or delete config file and restart.

### Validate Configuration

```bash
# Check config syntax
flazz --validate-config

# Show current config
flazz --show-config
```

### Common Issues

**API key not working:**
- Check key is valid and not expired
- Verify correct provider selected
- Test connection in settings

**Memory not persisting:**
- Check workspace path is writable
- Verify memory is enabled in settings
- Check disk space

**Performance issues:**
- Reduce memory limits
- Disable background jobs
- Clear cache

## Next Steps

- [Chat Features](../features/chat/README.md) - Use AI chat
- [Memory System](../features/memory/README.md) - Understand memory
- [Skills Guide](../features/skills/README.md) - Create skills

## Support

Need help? Check:
- [FAQ](../faq.md)
- [Troubleshooting](../troubleshooting.md)
- [GitHub Issues](https://github.com/vincerevu/flazz/issues)
