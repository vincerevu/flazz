# Multi-Provider Support

Flazz supports multiple AI providers, allowing you to choose the best model for each task.

## Supported Providers

### OpenAI

**Models:**
- GPT-4 Turbo
- GPT-4
- GPT-3.5 Turbo

**Best for:**
- Complex reasoning
- Code generation
- General tasks

**Setup:**
1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Settings → AI Providers → Add Provider → OpenAI
3. Paste API key
4. Select models to enable

**Pricing:**
- GPT-4: $0.03/1K input, $0.06/1K output tokens
- GPT-3.5: $0.0005/1K input, $0.0015/1K output tokens

### Anthropic (Claude)

**Models:**
- Claude 3 Opus (most capable)
- Claude 3 Sonnet (balanced)
- Claude 3 Haiku (fastest)

**Best for:**
- Long context (200K tokens)
- Analysis and reasoning
- Safe, helpful responses

**Setup:**
1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Settings → AI Providers → Add Provider → Anthropic
3. Paste API key

**Pricing:**
- Opus: $15/1M input, $75/1M output tokens
- Sonnet: $3/1M input, $15/1M output tokens
- Haiku: $0.25/1M input, $1.25/1M output tokens

### Google (Gemini)

**Models:**
- Gemini 1.5 Pro
- Gemini 1.0 Pro

**Best for:**
- Multimodal (text + images)
- Long context (1M tokens)
- Fast responses

**Setup:**
1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Settings → AI Providers → Add Provider → Google
3. Paste API key

**Pricing:**
- Free tier: 60 requests/minute
- Paid: $0.00025/1K input, $0.0005/1K output tokens

### Mistral AI

**Models:**
- Mistral Large
- Mistral Medium
- Mistral Small

**Best for:**
- European data residency
- Cost-effective
- Multilingual

**Setup:**
1. Get API key from [Mistral Console](https://console.mistral.ai/)
2. Settings → AI Providers → Add Provider → Mistral
3. Paste API key

**Pricing:**
- Large: $8/1M input, $24/1M output tokens
- Medium: $2.7/1M input, $8.1/1M output tokens
- Small: $1/1M input, $3/1M output tokens

### Groq

**Models:**
- Llama 3 70B
- Mixtral 8x7B
- Gemma 7B

**Best for:**
- Ultra-fast inference
- Cost-effective
- Open models

**Setup:**
1. Get API key from [Groq Console](https://console.groq.com/)
2. Settings → AI Providers → Add Provider → Groq
3. Paste API key

**Pricing:**
- Free tier available
- Very competitive pricing

### Ollama (Local)

**Models:**
- Any model from [Ollama Library](https://ollama.ai/library)
- Llama 2, Mistral, CodeLlama, etc.

**Best for:**
- Complete privacy
- No API costs
- Offline usage

**Setup:**
1. Install [Ollama](https://ollama.ai/)
2. Pull models: `ollama pull llama2`
3. Settings → AI Providers → Add Provider → Ollama
4. Use default URL: `http://localhost:11434`

**Requirements:**
- 8GB RAM minimum (16GB recommended)
- GPU recommended for speed
- Disk space for models (2-40GB each)

### OpenRouter

**Models:**
- 100+ models from multiple providers
- GPT-4, Claude, Llama, Mistral, etc.

**Best for:**
- Access many models with one API key
- Fallback routing
- Cost optimization

**Setup:**
1. Get API key from [OpenRouter](https://openrouter.ai/)
2. Settings → AI Providers → Add Provider → OpenRouter
3. Paste API key

**Pricing:**
- Varies by model
- Often cheaper than direct access

### Azure OpenAI

**Models:**
- GPT-4, GPT-3.5 (via Azure)

**Best for:**
- Enterprise deployments
- Azure integration
- Compliance requirements

**Setup:**
1. Create Azure OpenAI resource
2. Settings → AI Providers → Add Provider → Azure OpenAI
3. Enter endpoint, deployment, API key

## Configuring Multiple Providers

### Adding Providers

**Via UI:**
1. Settings → AI Providers
2. Click "Add Provider"
3. Select provider type
4. Enter credentials
5. Test connection
6. Save

**Via Config File:**

Edit `config.json`:

```json
{
  "aiProviders": [
    {
      "id": "openai-1",
      "type": "openai",
      "name": "OpenAI",
      "apiKey": "sk-...",
      "models": ["gpt-4", "gpt-3.5-turbo"],
      "enabled": true
    },
    {
      "id": "anthropic-1",
      "type": "anthropic",
      "name": "Claude",
      "apiKey": "sk-ant-...",
      "models": ["claude-3-opus", "claude-3-sonnet"],
      "enabled": true
    },
    {
      "id": "ollama-1",
      "type": "ollama",
      "name": "Local Models",
      "baseUrl": "http://localhost:11434",
      "models": ["llama2", "mistral"],
      "enabled": true
    }
  ]
}
```

### Setting Default Provider

Choose which provider to use by default:

Settings → AI Providers → Default Provider → Select

Or per chat:
- Click provider dropdown in chat
- Select provider and model

### Provider Priority

Set fallback order if primary fails:

```json
{
  "providerPriority": [
    "openai-1",
    "anthropic-1",
    "ollama-1"
  ]
}
```

## Switching Between Providers

### In Chat

**Change provider:**
1. Click provider dropdown (top of chat)
2. Select new provider
3. Choose model
4. Continue conversation

**Context preserved:**
- Previous messages remain
- Memory continues
- Skills still available

### Per Message

Use different provider for single message:

```
/provider anthropic
Your message here
```

Next message returns to default.

### Auto-Selection

Let Flazz choose best provider:

```json
{
  "autoSelectProvider": {
    "enabled": true,
    "rules": [
      {
        "condition": "code",
        "provider": "openai-1",
        "model": "gpt-4"
      },
      {
        "condition": "long-context",
        "provider": "anthropic-1",
        "model": "claude-3-opus"
      },
      {
        "condition": "fast",
        "provider": "groq-1",
        "model": "llama3-70b"
      }
    ]
  }
}
```

## Provider Comparison

### By Use Case

**Coding:**
1. GPT-4 (OpenAI)
2. Claude 3 Opus (Anthropic)
3. CodeLlama (Ollama)

**Writing:**
1. Claude 3 Opus (Anthropic)
2. GPT-4 (OpenAI)
3. Mistral Large

**Analysis:**
1. Claude 3 Opus (Anthropic)
2. GPT-4 (OpenAI)
3. Gemini Pro (Google)

**Speed:**
1. Groq (Llama 3)
2. GPT-3.5 Turbo (OpenAI)
3. Claude 3 Haiku (Anthropic)

**Cost:**
1. Ollama (Free, local)
2. Groq (Very cheap)
3. GPT-3.5 Turbo (OpenAI)

**Privacy:**
1. Ollama (100% local)
2. Azure OpenAI (Enterprise)
3. Mistral (EU-based)

### Feature Matrix

| Feature | OpenAI | Anthropic | Google | Ollama |
|---------|--------|-----------|--------|--------|
| Max Context | 128K | 200K | 1M | Varies |
| Streaming | ✅ | ✅ | ✅ | ✅ |
| Function Calling | ✅ | ✅ | ✅ | ❌ |
| Vision | ✅ | ✅ | ✅ | Some |
| JSON Mode | ✅ | ❌ | ✅ | ❌ |
| Local | ❌ | ❌ | ❌ | ✅ |

## Cost Optimization

### Strategies

**1. Use Cheaper Models for Simple Tasks:**
```
Simple questions → GPT-3.5 or Claude Haiku
Complex reasoning → GPT-4 or Claude Opus
```

**2. Optimize Context:**
- Clear old messages
- Reduce file attachments
- Use summarization

**3. Batch Requests:**
- Combine multiple questions
- Use skills for repetitive tasks

**4. Use Local Models:**
- Ollama for development
- Switch to cloud for production

### Cost Tracking

View usage and costs:

Settings → AI Providers → Usage & Costs

**Per Provider:**
- Tokens used
- Estimated cost
- Request count
- Average cost per request

**Export:**
- CSV for analysis
- Monthly reports
- Budget alerts

## Troubleshooting

### Provider Not Working

**Check:**
1. API key is valid
2. Provider is enabled
3. Internet connection
4. Provider status page

**Test Connection:**
Settings → AI Providers → [Provider] → Test Connection

### Rate Limits

**Error:** "Rate limit exceeded"

**Solutions:**
- Wait and retry
- Switch to different provider
- Upgrade plan
- Use local model

### Model Not Available

**Error:** "Model not found"

**Solutions:**
- Check model name spelling
- Verify model is enabled
- Update provider configuration
- Check provider documentation

### Inconsistent Responses

Different providers may give different answers:

**Normal:** Each model has different training and capabilities

**Solutions:**
- Use same provider for consistency
- Test multiple providers
- Choose best for your use case

## Best Practices

### Provider Selection

**Development:**
- Use Ollama (free, fast iteration)
- Switch to cloud for testing

**Production:**
- Use reliable provider (OpenAI, Anthropic)
- Set up fallbacks
- Monitor costs

**Privacy-Sensitive:**
- Use Ollama exclusively
- Or Azure OpenAI with private deployment

### API Key Management

**Security:**
- Never commit API keys to git
- Use environment variables
- Rotate keys regularly
- Set spending limits

**Organization:**
- Separate keys for dev/prod
- Use descriptive names
- Document which key is which

### Monitoring

**Track:**
- Usage per provider
- Costs per project
- Error rates
- Response times

**Alerts:**
- Budget exceeded
- High error rate
- Slow responses

## Advanced Configuration

### Custom Endpoints

Use custom API endpoints:

```json
{
  "type": "openai",
  "baseUrl": "https://custom-proxy.example.com/v1",
  "apiKey": "..."
}
```

### Request Timeouts

Set timeouts per provider:

```json
{
  "timeout": 60000,  // 60 seconds
  "retries": 3,
  "retryDelay": 1000
}
```

### Custom Headers

Add custom headers to requests:

```json
{
  "headers": {
    "X-Custom-Header": "value",
    "X-Organization": "my-org"
  }
}
```

## Next Steps

- [Chat Basics](./README.md) - Learn chat features
- [Configuration](../../getting-started/configuration.md) - Detailed config
- [Cost Optimization](./cost-optimization.md) - Save money

## Support

- [Provider Status Pages](#) - Check provider status
- [GitHub Issues](https://github.com/yourusername/flazz/issues) - Report problems
- [Community Discord](#) - Get help
