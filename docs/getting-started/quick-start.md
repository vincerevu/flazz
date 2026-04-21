# Quick Start

Get up and running with Flazz in 5 minutes.

## Step 1: Launch Flazz

After [installation](./installation.md), launch Flazz from:
- **Windows**: Start Menu → Flazz
- **macOS**: Applications → Flazz
- **Linux**: Application Menu → Flazz

## Step 2: Configure AI Provider

On first launch, you'll need to configure at least one AI provider.

### Option 1: OpenAI (Recommended for beginners)

1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. In Flazz, go to Settings → AI Providers
3. Click "Add Provider" → Select "OpenAI"
4. Paste your API key
5. Click "Save"

### Option 2: Anthropic (Claude)

1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Settings → AI Providers → Add Provider → Anthropic
3. Paste your API key and save

### Option 3: Local Models (Free, no API key needed)

1. Install [Ollama](https://ollama.ai/)
2. Run: `ollama pull llama2`
3. In Flazz: Settings → AI Providers → Add Provider → Ollama
4. Use default settings (http://localhost:11434)

## Step 3: Start Your First Chat

1. Click the "New Chat" button or press `Ctrl+N` (Windows/Linux) / `Cmd+N` (macOS)
2. Type your message in the input box
3. Press Enter or click Send
4. Watch Flazz respond in real-time

**Try these example prompts:**
- "Explain quantum computing in simple terms"
- "Write a Python function to sort a list"
- "Help me plan a trip to Japan"

## Step 4: Explore Key Features

### Memory & Learning

Flazz automatically remembers your conversations:

1. Ask: "My favorite color is blue"
2. Later, ask: "What's my favorite color?"
3. Flazz will remember!

### Skills

Create reusable AI capabilities:

1. Go to Skills tab
2. Click "Create Skill"
3. Name it (e.g., "Code Reviewer")
4. Add instructions: "Review code for bugs and improvements"
5. Use it in chat: `@code-reviewer` + your code

### Workspace

Organize your knowledge:

1. Go to Workspace tab
2. Create a new note
3. Use `[[wiki links]]` to connect notes
4. Search with `Ctrl+K` / `Cmd+K`

### Integrations (Optional)

Connect external services:

1. Get a [Composio API key](https://composio.dev/)
2. Settings → Integrations → Composio
3. Connect services like Gmail, Calendar, Slack
4. Ask Flazz: "Check my emails" or "Schedule a meeting"

## Step 5: Customize Your Experience

### Themes

Settings → Appearance → Choose Light/Dark theme

### Keyboard Shortcuts

- `Ctrl/Cmd + N` - New chat
- `Ctrl/Cmd + K` - Quick search
- `Ctrl/Cmd + ,` - Settings
- `Ctrl/Cmd + B` - Toggle sidebar

### Model Selection

Switch AI models per chat:
1. Click model dropdown in chat
2. Select from available models
3. Different models for different tasks

## Common Use Cases

### Coding Assistant
```
You: Write a REST API in Node.js with Express

Flazz: [Generates complete API code]

You: Add authentication

Flazz: [Updates code with JWT auth]
```

### Research Helper
```
You: Research the history of AI

Flazz: [Provides comprehensive overview]

You: Save this to my workspace

Flazz: [Creates note with wiki links]
```

### Task Automation
```
You: Every morning at 9am, summarize my emails

Flazz: [Creates scheduled skill]
```

## Next Steps

Now that you're set up, explore more:

- [Configuration Guide](./configuration.md) - Advanced settings
- [Chat Features](../features/chat/README.md) - Master the chat interface
- [Memory System](../features/memory/README.md) - How Flazz learns
- [Skills Guide](../features/skills/README.md) - Create powerful skills

## Tips for Success

1. **Be specific** - Clear prompts get better results
2. **Use context** - Flazz remembers your conversation
3. **Try different models** - Each has strengths
4. **Create skills** - Automate repetitive tasks
5. **Organize workspace** - Keep notes structured

## Getting Help

- [FAQ](../faq.md) - Common questions
- [Troubleshooting](../troubleshooting.md) - Fix issues
- [GitHub Discussions](https://github.com/yourusername/flazz/discussions) - Community help
- [GitHub Issues](https://github.com/yourusername/flazz/issues) - Report bugs

Happy chatting! 🚀
