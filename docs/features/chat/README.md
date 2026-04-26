# Chat

Flazz's chat interface is your primary way to interact with AI. This guide covers everything you need to know about using chat effectively.

## Overview

The chat interface provides:
- Real-time streaming responses
- Multi-turn conversations with context
- Multiple AI provider support
- Code syntax highlighting
- Markdown rendering
- File attachments
- Voice input (experimental)

## Basic Usage

### Starting a Chat

**New Chat:**
- Click "New Chat" button
- Press `Ctrl+N` (Windows/Linux) or `Cmd+N` (macOS)
- Type `/new` in command palette

**Continue Existing:**
- Click on chat in sidebar
- Recent chats appear at top

### Sending Messages

1. Type your message in the input box
2. Press `Enter` to send
3. Press `Shift+Enter` for new line
4. Click send button

**Tips:**
- Be specific and clear
- Provide context when needed
- Break complex requests into steps
- Use follow-up questions

### Message Formatting

Flazz supports Markdown in messages:

```markdown
**Bold text**
*Italic text*
`inline code`
[Links](https://example.com)

# Headers
- Lists
- Items

> Quotes
```

## Multi-Provider Support

### Switching Providers

Change AI provider per chat:

1. Click provider dropdown (top of chat)
2. Select from configured providers
3. Choose specific model

**Provider Comparison:**

| Provider | Best For | Speed | Cost |
|----------|----------|-------|------|
| GPT-4 | Complex reasoning | Medium | High |
| GPT-3.5 | General tasks | Fast | Low |
| Claude 3 Opus | Long context | Medium | High |
| Claude 3 Sonnet | Balanced | Fast | Medium |
| Gemini Pro | Multimodal | Fast | Medium |
| Ollama (Local) | Privacy | Varies | Free |

### Model Selection

Different models for different tasks:

**Coding:**
- GPT-4
- Claude 3 Opus
- Codellama (Ollama)

**Writing:**
- Claude 3 Opus
- GPT-4
- Mistral Large

**Quick Tasks:**
- GPT-3.5 Turbo
- Claude 3 Haiku
- Gemini Pro

**Local/Private:**
- Llama 2 (Ollama)
- Mistral (Ollama)
- CodeLlama (Ollama)

## Advanced Features

### Code Blocks

Flazz automatically detects and highlights code:

````markdown
```python
def hello():
    print("Hello, World!")
```
````

**Features:**
- Syntax highlighting for 100+ languages
- Copy button
- Line numbers
- Language detection

### File Attachments

Attach files to provide context:

1. Click attachment icon
2. Select file(s)
3. Flazz reads and includes in context

**Supported formats:**
- Text: `.txt`, `.md`, `.json`, `.yaml`
- Code: `.py`, `.js`, `.ts`, `.java`, etc.
- Documents: `.pdf`, `.docx`
- Data: `.csv`, `.xlsx`

**Limits:**
- Max file size: 10MB
- Max files per message: 5
- Total context: 100K tokens

### Streaming Responses

Responses stream in real-time:

- See partial responses as they generate
- Stop generation anytime (Stop button)
- Resume if interrupted

**Benefits:**
- Faster perceived response time
- Can stop if going wrong direction
- Better user experience

### Context Management

Flazz maintains conversation context:

**Automatic:**
- Previous messages included
- Relevant memory recalled
- Skills available
- Workspace context

**Manual Control:**
- Clear context: `/clear`
- Reset chat: `/reset`
- Include specific context: `@mention`

### Mentions & References

Reference content in chat:

**Skills:**
```
@code-reviewer check this code
```

**Workspace Notes:**
```
@[[project-notes]] summarize this
```

**Files:**
```
@file:src/main.ts explain this
```

## Chat Management

### Organizing Chats

**Folders:**
1. Right-click chat
2. "Move to Folder"
3. Create or select folder

**Tags:**
1. Right-click chat
2. "Add Tags"
3. Type tags (comma-separated)

**Search:**
- `Ctrl+K` / `Cmd+K` to search
- Filter by tag, folder, date
- Full-text search in messages

### Chat History

**View History:**
- Sidebar shows all chats
- Sort by date, name, or folder
- Filter by provider or model

**Export Chat:**
1. Right-click chat
2. "Export"
3. Choose format: Markdown, JSON, PDF

**Delete Chat:**
1. Right-click chat
2. "Delete"
3. Confirm (cannot undo)

### Pinning Chats

Keep important chats accessible:

1. Right-click chat
2. "Pin to Top"
3. Appears at top of sidebar

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New chat |
| `Ctrl/Cmd + K` | Search chats |
| `Ctrl/Cmd + /` | Command palette |
| `Ctrl/Cmd + ↑` | Previous chat |
| `Ctrl/Cmd + ↓` | Next chat |
| `Esc` | Stop generation |
| `Shift + Enter` | New line |
| `Ctrl/Cmd + Enter` | Send message |

## Tips & Best Practices

### Writing Effective Prompts

**Be Specific:**
```
❌ "Write code"
✅ "Write a Python function that validates email addresses using regex"
```

**Provide Context:**
```
❌ "Fix this"
✅ "This React component has a memory leak. Fix the useEffect cleanup"
```

**Break Down Complex Tasks:**
```
1. First, outline the architecture
2. Then, implement the database schema
3. Finally, create the API endpoints
```

**Use Examples:**
```
"Generate test data like this:
{name: 'John', age: 30}
{name: 'Jane', age: 25}"
```

### Iterative Refinement

Build on previous responses:

```
You: Create a REST API

Flazz: [generates basic API]

You: Add authentication

Flazz: [adds JWT auth]

You: Add rate limiting

Flazz: [adds rate limiting]
```

### Using System Messages

Set behavior for entire chat:

```
/system You are a senior code reviewer. Focus on security and performance.
```

### Temperature Control

Adjust creativity per message:

```
/temp 0.2  # Focused, deterministic
/temp 0.7  # Balanced (default)
/temp 1.2  # Creative
```

## Troubleshooting

### Slow Responses

**Causes:**
- Large context window
- Complex request
- Provider rate limits
- Network issues

**Solutions:**
- Clear context: `/clear`
- Use faster model
- Simplify request
- Check internet connection

### Context Limit Exceeded

**Error:** "Context window exceeded"

**Solutions:**
- Start new chat
- Clear old messages: `/clear`
- Reduce file attachments
- Use model with larger context

### Incorrect Responses

**If AI is wrong:**
- Provide corrections
- Add more context
- Try different phrasing
- Switch to better model

**If AI refuses:**
- Rephrase request
- Provide legitimate use case
- Check provider policies

### Connection Issues

**Error:** "Failed to connect"

**Solutions:**
- Check API key in settings
- Verify internet connection
- Check provider status
- Try different provider

## Advanced Topics

- [Streaming Implementation](./streaming.md) - How streaming works
- [Multi-Provider Setup](./multi-provider.md) - Configure multiple providers
- [Context Window Management](./context-management.md) - Optimize context usage
- [Custom System Prompts](./system-prompts.md) - Advanced prompt engineering

## Related Features

- [Memory System](../memory/README.md) - How chat context is remembered
- [Skills](../skills/README.md) - Reusable chat capabilities
- [Workspace](../workspace/README.md) - Reference notes in chat

## Next Steps

- [Memory System](../memory/README.md) - Learn how Flazz remembers
- [Skills Guide](../skills/README.md) - Create reusable capabilities
- [Integrations](../integrations/README.md) - Connect external services

## Support

- [FAQ](../../faq.md) - Common questions
- [Troubleshooting](../../troubleshooting.md) - Fix issues
- [GitHub Issues](https://github.com/vincerevu/flazz/issues) - Report bugs
