# Frequently Asked Questions (FAQ)

Common questions about Flazz and their answers.

## General Questions

### What is Flazz?

Flazz is a local-first AI desktop application that acts as your intelligent coworker. It combines powerful AI capabilities with long-term memory, learning from your interactions to provide personalized assistance while keeping all your data on your machine.

### Is Flazz free?

Yes, Flazz is open source and free to use. You only pay for the LLM API usage from providers like OpenAI or Anthropic. There's no subscription fee for the app itself.

### What platforms does Flazz support?

Flazz runs on:
- Windows 10 and later
- macOS 10.15 (Catalina) and later
- Linux (Ubuntu 20.04+, Fedora, Arch, etc.)

### How is Flazz different from ChatGPT?

Key differences:
- **Local-first**: Your data stays on your machine
- **Long-term memory**: Builds a persistent knowledge graph
- **Multi-provider**: Use any LLM provider, not locked to OpenAI
- **Extensible**: Add custom tools, skills, and integrations
- **Learns your habits**: Adapts to your workflow automatically
- **100+ integrations**: Connect to Gmail, Slack, GitHub, etc.

## Privacy & Security

### Where is my data stored?

All your data is stored locally in the `~/Flazz` directory on your machine:
- Windows: `C:\Users\YourName\Flazz`
- macOS: `/Users/YourName/Flazz`
- Linux: `/home/yourname/Flazz`

Nothing is sent to Flazz servers (we don't have any).

### Does Flazz send my data to the cloud?

No. Your conversations and data stay on your machine. The only data sent externally is:
- Your prompts to the LLM provider you choose (OpenAI, Anthropic, etc.)
- API calls to integrations you explicitly enable (Gmail, Slack, etc.)

### Can I use Flazz offline?

Partially. You can:
- Browse your workspace and notes offline
- Search your knowledge graph
- View conversation history

You need internet for:
- LLM API calls (unless using local Ollama)
- Platform integrations (Gmail, Slack, etc.)

### Is my API key secure?

Yes. API keys are stored in:
- **Windows**: Windows Credential Manager
- **macOS**: Keychain
- **Linux**: Secret Service API (gnome-keyring, kwallet)

Keys are never stored in plain text.

## Features & Functionality

### What LLM providers are supported?

Flazz supports:
- OpenAI (GPT-4, GPT-4o, o1, o3)
- Anthropic (Claude 3.5 Sonnet, Claude 4)
- Google (Gemini Pro, Gemini Flash)
- xAI (Grok)
- Groq, Mistral, Cohere, DeepSeek
- Local models via Ollama
- Any OpenAI-compatible API

### Can I use multiple LLM providers?

Yes! You can configure multiple providers and switch between them:
- Settings → Models → Add Provider
- Select provider per conversation
- Use different models for different tasks

### What is the memory system?

Flazz automatically builds a knowledge graph from your interactions:
- Extracts people, organizations, projects, topics
- Creates bidirectional links between entities
- Learns your preferences and patterns
- Recalls context from past conversations

### How do AI-generated skills work?

When you perform similar tasks repeatedly, Flazz:
1. Detects the pattern
2. Offers to create a reusable skill
3. Generates the skill definition automatically
4. Improves the skill based on your feedback

Skills are stored as markdown files you can edit.

### What is Composio?

Composio is a unified API that connects to 100+ platforms with a single API key. Instead of configuring OAuth for each service, you:
1. Get one Composio API key
2. Connect to Gmail, Slack, GitHub, Notion, etc.
3. AI automatically uses the right platform

Learn more: https://composio.dev

### What are MCP servers?

MCP (Model Context Protocol) is a standard for connecting AI to external tools. MCP servers provide:
- File system access
- Database connections
- API integrations
- Custom tools

Flazz supports any MCP-compatible server.

## Usage Questions

### How do I start a conversation?

1. Open Flazz
2. Type your message in the chat input
3. Press Enter or click Send
4. AI responds with streaming output

### Can I attach files to messages?

Yes! You can attach:
- Documents (PDF, DOCX, TXT, MD)
- Images (PNG, JPG, GIF)
- Code files
- Drag and drop or click the attachment icon

### How do I create a skill?

**Manual creation**:
1. Create a markdown file in `~/Flazz/memory/Skills/`
2. Add frontmatter with name, description, category
3. Write the skill instructions
4. Use the skill in chat

**AI-generated**:
- Perform similar tasks repeatedly
- Flazz will offer to create a skill
- Review and approve the generated skill

### How do I search my workspace?

- Press `Cmd/Ctrl + K` for quick search
- Or use the search bar in the sidebar
- Supports full-text search across all notes

### Can I export my data?

Yes! Your data is already in plain markdown files:
- Notes: `~/Flazz/workspace/`
- Memory: `~/Flazz/memory/`
- Skills: `~/Flazz/memory/Skills/`

Just copy the files to export.

## Integration Questions

### How do I connect Gmail?

1. Get a Composio API key from https://app.composio.dev
2. Settings → Integrations → Composio
3. Add your API key
4. Enable Gmail integration
5. Authorize access

### Can I use Flazz with my company's Slack?

Yes, if you have a Composio account with Slack integration enabled. Note: Check your company's policies on third-party integrations.

### Does Flazz support custom integrations?

Yes! You can:
- Create MCP servers for custom tools
- Add custom API integrations
- Write custom skills
- Extend the codebase (it's open source)

### Can I connect to my own database?

Yes, through MCP servers. You can:
- Use existing database MCP servers
- Create your own MCP server
- Connect to PostgreSQL, MySQL, MongoDB, etc.

## Technical Questions

### What technologies does Flazz use?

- **Frontend**: React, TypeScript, TipTap, Radix UI
- **Backend**: Electron, Node.js
- **AI**: Vercel AI SDK, Model Context Protocol
- **Storage**: Local filesystem, SQLite
- **Search**: Ripgrep-based full-text search

### Can I contribute to Flazz?

Yes! Flazz is open source. See our [Contributing Guide](../CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Pull request process

### How do I build Flazz from source?

```bash
git clone https://github.com/vincerevu/flazz.git
cd flazz
pnpm install
pnpm run build
pnpm run dev
```

See [Development Setup](development/setup.md) for details.

### Can I create a plugin for Flazz?

Currently, extensibility is through:
- Skills (markdown-based)
- MCP servers (external processes)
- Custom integrations (code contributions)

A formal plugin system is on the roadmap.

## Performance Questions

### How much disk space does Flazz need?

- **App**: ~200-300 MB
- **Workspace**: Grows with your data
  - Typical: 100-500 MB
  - Heavy use: 1-5 GB

### How much RAM does Flazz use?

- **Idle**: ~200-300 MB
- **Active**: ~500 MB - 1 GB
- **Heavy use**: 1-2 GB

### Is Flazz fast?

Yes! Flazz is optimized for:
- Streaming responses (real-time output)
- Fast search (ripgrep-based)
- Efficient memory management
- Lazy loading of resources

### Can I use Flazz on a slow computer?

Flazz should work on most modern computers. Minimum requirements:
- 4 GB RAM (8 GB recommended)
- 2 GHz dual-core processor
- 1 GB free disk space

## Troubleshooting

### Flazz won't start

See [Troubleshooting Guide](troubleshooting.md#startup-problems) for solutions.

### My API key doesn't work

Check:
1. No extra spaces or newlines
2. Key has correct permissions
3. Provider service is online
4. Try generating a new key

### Responses are slow

Possible causes:
- Slow internet connection
- Provider rate limits
- Large context window
- Try a faster model (e.g., GPT-3.5 instead of GPT-4)

### Memory usage is high

Solutions:
- Clear old conversations
- Reduce context window size
- Disable memory features temporarily
- See [Troubleshooting Guide](troubleshooting.md#memory--performance)

## Billing & Costs

### How much does it cost to use Flazz?

Flazz itself is free. You pay for:
- **LLM API usage**: Varies by provider
  - OpenAI GPT-4: ~$0.03 per 1K tokens
  - Anthropic Claude: ~$0.015 per 1K tokens
  - Google Gemini: Free tier available
- **Composio**: Free tier available, paid plans for heavy use

### Can I use Flazz without paying?

Yes! Use:
- Free LLM providers (Google Gemini free tier)
- Local models via Ollama (completely free)
- No Composio (use built-in tools only)

### How do I monitor my API usage?

- Check your provider's dashboard:
  - OpenAI: https://platform.openai.com/usage
  - Anthropic: https://console.anthropic.com/usage
- Flazz shows token usage per conversation

## Future Plans

### What's on the roadmap?

- Mobile companion app
- Real-time collaboration
- Advanced memory search (vector embeddings)
- Plugin marketplace
- Cloud sync (optional, encrypted)
- Voice interface
- Multi-language support

### When will feature X be available?

Check our [GitHub Issues](https://github.com/vincerevu/flazz/issues) and [Roadmap](../README.md#roadmap) for planned features and timelines.

### Can I request a feature?

Yes! Create a [feature request](https://github.com/vincerevu/flazz/issues/new?template=feature_request.md) on GitHub.

## Getting Help

### Where can I get help?

- **Documentation**: [docs/](README.md)
- **Troubleshooting**: [troubleshooting.md](troubleshooting.md)
- **GitHub Issues**: https://github.com/vincerevu/flazz/issues
- **Discussions**: https://github.com/vincerevu/flazz/discussions

### How do I report a bug?

Create a [bug report](https://github.com/vincerevu/flazz/issues/new?template=bug_report.md) with:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots
- System information
- Error logs

### Is there a community?

Yes! Join us:
- GitHub Discussions
- Twitter: [@flazz_ai](https://twitter.com/flazz_ai)
- Discord (coming soon)

## Still Have Questions?

If your question isn't answered here:
1. Search [existing issues](https://github.com/vincerevu/flazz/issues)
2. Check [documentation](README.md)
3. Ask in [discussions](https://github.com/vincerevu/flazz/discussions)
4. Create a new issue with the `question` label
