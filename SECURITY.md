# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Flazz seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Disclose Publicly

Please do not create a public GitHub issue for security vulnerabilities. This helps protect users while we work on a fix.

### 2. Report Privately

Send an email to: **security@flazz.app** (or create a private security advisory on GitHub)

Include the following information:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if you have one)
- Your contact information

### 3. Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: Within 7 days
  - High: Within 14 days
  - Medium: Within 30 days
  - Low: Next regular release

### 4. Disclosure Process

1. We will acknowledge your report within 48 hours
2. We will investigate and validate the vulnerability
3. We will develop and test a fix
4. We will release a security patch
5. We will publicly disclose the vulnerability after the patch is released
6. We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

### For Users

1. **Keep Flazz Updated**: Always use the latest version
2. **Protect API Keys**: Never share your LLM provider API keys
3. **Review Permissions**: Check what permissions integrations request
4. **Use Strong Passwords**: If using authentication features
5. **Backup Data**: Regularly backup your `~/Flazz` directory

### For Developers

1. **Input Validation**: Always validate and sanitize user input
2. **Secure Storage**: Use system keychain for sensitive data
3. **Least Privilege**: Request minimum necessary permissions
4. **Code Review**: All PRs must be reviewed before merging
5. **Dependency Updates**: Keep dependencies up to date
6. **Security Testing**: Test for common vulnerabilities

## Known Security Considerations

### Local Data Storage

- All data is stored locally in `~/Flazz`
- No cloud synchronization by default
- Users are responsible for securing their local filesystem

### API Keys

- API keys are stored in system keychain (macOS/Linux) or Credential Manager (Windows)
- Keys are never sent to Flazz servers (we don't have any)
- Keys are only sent to the respective LLM providers

### Command Execution

- Flazz can execute shell commands through skills
- Commands require user approval
- Workspace path validation prevents directory traversal
- Allowlist-based command approval system

### Integration Security

- OAuth tokens stored securely
- Composio integration uses secure API
- MCP servers run in isolated processes
- User must explicitly enable integrations

### Network Security

- HTTPS for all external API calls
- Certificate validation enabled
- No telemetry or tracking by default
- User controls all network requests

## Security Features

### Sandboxing

- Renderer process runs in Electron sandbox
- No direct Node.js access from UI
- IPC bridge enforces security boundaries

### Permission System

- User approval required for sensitive operations
- Granular permission controls
- Audit log of all actions

### Data Encryption

- Optional encryption for memory data
- Secure storage for credentials
- No plaintext API keys in config files

## Vulnerability Disclosure Policy

We follow responsible disclosure practices:

1. **Private Reporting**: Security issues reported privately
2. **Coordinated Disclosure**: Fix developed before public disclosure
3. **Credit**: Researchers credited in security advisories
4. **No Retaliation**: We will not take legal action against security researchers

## Security Updates

Security updates are released as soon as possible after a vulnerability is confirmed. Users will be notified through:

- GitHub Security Advisories
- Release notes
- In-app notifications (for critical issues)

## Bug Bounty Program

We currently do not have a formal bug bounty program, but we greatly appreciate security researchers who help us improve Flazz's security.

## Contact

For security-related questions or concerns:

- **Email**: security@flazz.app
- **GitHub**: Create a private security advisory
- **PGP Key**: Available on request

## Acknowledgments

We thank the following security researchers for responsibly disclosing vulnerabilities:

- (List will be updated as vulnerabilities are reported and fixed)

---

Last updated: 2024-01-21
