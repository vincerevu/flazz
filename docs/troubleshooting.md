# Troubleshooting Guide

This guide helps you resolve common issues when using Flazz.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Startup Problems](#startup-problems)
- [LLM Provider Issues](#llm-provider-issues)
- [Memory & Performance](#memory--performance)
- [Integration Issues](#integration-issues)
- [Build & Development Issues](#build--development-issues)
- [Platform-Specific Issues](#platform-specific-issues)

## Installation Issues

### pnpm install fails

**Symptom**: Installation fails with dependency errors

**Solutions**:

1. **Check Node.js version**:
   ```bash
   node --version  # Should be 18+
   ```

2. **Set node-linker to hoisted**:
   ```bash
   pnpm config set node-linker hoisted
   ```

3. **Clear cache and reinstall**:
   ```bash
   pnpm store prune
   rm -rf node_modules
   pnpm install
   ```

### Missing dependencies

**Symptom**: Module not found errors

**Solution**:
```bash
# Rebuild dependencies
pnpm run deps
pnpm run build
```

## Startup Problems

### App won't start

**Symptom**: Electron window doesn't open

**Solutions**:

1. **Check for build errors**:
   ```bash
   pnpm run build
   # Look for TypeScript or build errors
   ```

2. **Check logs**:
   - Windows: `%APPDATA%\Flazz\logs`
   - macOS: `~/Library/Logs/Flazz`
   - Linux: `~/.config/Flazz/logs`

3. **Reset workspace**:
   ```bash
   # Backup first!
   mv ~/Flazz ~/Flazz.backup
   pnpm run dev
   ```

### White screen on startup

**Symptom**: App opens but shows blank white screen

**Solutions**:

1. **Clear renderer cache**:
   - Open DevTools: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
   - Right-click refresh button → "Empty Cache and Hard Reload"

2. **Check renderer build**:
   ```bash
   cd apps/renderer
   pnpm run build
   ```

3. **Check console for errors**:
   - Open DevTools and check Console tab

### Port already in use

**Symptom**: "Port 5173 is already in use"

**Solution**:

**Windows**:
```powershell
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

**macOS/Linux**:
```bash
lsof -ti:5173 | xargs kill -9
```

## LLM Provider Issues

### API key not working

**Symptom**: "Invalid API key" or authentication errors

**Solutions**:

1. **Verify API key**:
   - Check for extra spaces or newlines
   - Ensure key has correct permissions
   - Try generating a new key

2. **Check provider status**:
   - OpenAI: https://status.openai.com
   - Anthropic: https://status.anthropic.com
   - Google: https://status.cloud.google.com

3. **Test API key directly**:
   ```bash
   # OpenAI
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer YOUR_KEY"
   
   # Anthropic
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: YOUR_KEY"
   ```

### Rate limit errors

**Symptom**: "Rate limit exceeded" or 429 errors

**Solutions**:

1. **Wait and retry**: Rate limits reset after a period
2. **Upgrade plan**: Check your provider's rate limits
3. **Use different model**: Some models have higher limits
4. **Enable rate limiting in Flazz**:
   - Settings → Models → Enable rate limiting

### Streaming not working

**Symptom**: Responses appear all at once instead of streaming

**Solutions**:

1. **Check provider supports streaming**:
   - Most providers support it, but some models don't

2. **Disable browser extensions**:
   - Some extensions block streaming

3. **Check network**:
   - Corporate firewalls may block streaming

## Memory & Performance

### High memory usage

**Symptom**: Flazz uses too much RAM

**Solutions**:

1. **Clear old conversations**:
   - Settings → Memory → Clear old conversations

2. **Reduce context window**:
   - Settings → Models → Reduce max tokens

3. **Disable memory features temporarily**:
   - Settings → Memory → Disable graph building

### Slow performance

**Symptom**: UI is laggy or unresponsive

**Solutions**:

1. **Check system resources**:
   - Close other applications
   - Check CPU/RAM usage

2. **Reduce search index size**:
   ```bash
   # Rebuild search index
   rm -rf ~/Flazz/.search
   # Restart Flazz
   ```

3. **Disable animations**:
   - Settings → Appearance → Reduce animations

### Database locked errors

**Symptom**: "Database is locked" errors

**Solutions**:

1. **Close other Flazz instances**:
   - Only one instance can access workspace at a time

2. **Check for zombie processes**:
   ```bash
   # macOS/Linux
   ps aux | grep flazz
   kill <PID>
   
   # Windows
   tasklist | findstr flazz
   taskkill /IM flazz.exe /F
   ```

## Integration Issues

### Composio not connecting

**Symptom**: Can't connect to Composio platforms

**Solutions**:

1. **Verify API key**:
   - Get key from https://app.composio.dev
   - Check key has correct permissions

2. **Check network**:
   ```bash
   curl https://api.composio.dev/v1/apps
   ```

3. **Re-authenticate**:
   - Settings → Integrations → Composio → Reconnect

### MCP server not starting

**Symptom**: MCP server fails to start

**Solutions**:

1. **Check server configuration**:
   - Verify `~/.kiro/settings/mcp.json` syntax
   - Check server command exists

2. **Check logs**:
   - Settings → Integrations → MCP → View logs

3. **Test server manually**:
   ```bash
   # Run server command directly
   uvx your-mcp-server
   ```

### OAuth flow fails

**Symptom**: OAuth popup doesn't work

**Solutions**:

1. **Check default browser**:
   - OAuth opens in default browser
   - Ensure browser allows popups

2. **Manual OAuth**:
   - Copy URL from error message
   - Open in browser manually
   - Complete flow

## Build & Development Issues

### TypeScript errors

**Symptom**: Build fails with type errors

**Solutions**:

1. **Update TypeScript**:
   ```bash
   pnpm update typescript
   ```

2. **Clear TypeScript cache**:
   ```bash
   rm -rf node_modules/.cache
   pnpm run build
   ```

3. **Check tsconfig.json**:
   - Ensure all paths are correct

### Hot reload not working

**Symptom**: Changes don't trigger rebuild

**Solutions**:

1. **Restart dev server**:
   ```bash
   # Stop with Ctrl+C
   pnpm run dev
   ```

2. **Check file watchers**:
   ```bash
   # macOS/Linux - increase limit
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

### Build succeeds but app crashes

**Symptom**: Build completes but app won't run

**Solutions**:

1. **Check for runtime errors**:
   - Look in console/logs
   - Check for missing dependencies

2. **Clean build**:
   ```bash
   pnpm run clean
   pnpm install
   pnpm run build
   ```

## Platform-Specific Issues

### Windows

#### Antivirus blocking

**Symptom**: Antivirus flags Flazz as suspicious

**Solution**:
- Add Flazz to antivirus exceptions
- This is common for unsigned Electron apps

#### PowerShell execution policy

**Symptom**: Can't run scripts

**Solution**:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Path too long errors

**Symptom**: "Path too long" during install

**Solution**:
```powershell
# Enable long paths
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

### macOS

#### Gatekeeper blocking app

**Symptom**: "App can't be opened because it's from an unidentified developer"

**Solution**:
1. Right-click app → Open
2. Or: System Preferences → Security → Allow

#### Permission denied errors

**Symptom**: Can't access files or folders

**Solution**:
- System Preferences → Security & Privacy → Privacy
- Grant Flazz access to required folders

#### Code signing issues

**Symptom**: App won't run after building

**Solution**:
```bash
# Remove quarantine attribute
xattr -cr /Applications/Flazz.app
```

### Linux

#### Missing libraries

**Symptom**: "Error while loading shared libraries"

**Solution**:

**Ubuntu/Debian**:
```bash
sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libdrm2 libgbm1 libxcb-dri3-0
```

**Fedora/RHEL**:
```bash
sudo dnf install -y gtk3 libnotify nss libXScrnSaver libXtst xdg-utils at-spi2-core libdrm mesa-libgbm libxcb
```

#### AppImage won't run

**Symptom**: AppImage doesn't execute

**Solution**:
```bash
chmod +x Flazz.AppImage
./Flazz.AppImage
```

#### Wayland issues

**Symptom**: App doesn't work on Wayland

**Solution**:
```bash
# Force X11 mode
GDK_BACKEND=x11 ./flazz
```

## Getting More Help

If your issue isn't covered here:

1. **Check existing issues**: https://github.com/yourusername/flazz/issues
2. **Search discussions**: https://github.com/yourusername/flazz/discussions
3. **Create new issue**: Include:
   - OS and version
   - Flazz version
   - Steps to reproduce
   - Error messages
   - Logs from `~/Flazz/logs`

## Diagnostic Information

When reporting issues, include this information:

```bash
# System info
node --version
pnpm --version
npm --version

# Flazz version
# Help → About Flazz

# Logs location
# Windows: %APPDATA%\Flazz\logs
# macOS: ~/Library/Logs/Flazz
# Linux: ~/.config/Flazz/logs
```

## Emergency Recovery

If Flazz is completely broken:

1. **Backup workspace**:
   ```bash
   cp -r ~/Flazz ~/Flazz.backup
   ```

2. **Reset to defaults**:
   ```bash
   rm -rf ~/Flazz/.config
   # Restart Flazz
   ```

3. **Complete reset** (last resort):
   ```bash
   # Backup first!
   mv ~/Flazz ~/Flazz.backup
   # Reinstall Flazz
   ```

4. **Restore from backup**:
   ```bash
   cp -r ~/Flazz.backup ~/Flazz
   ```
