# Contributing to Flazz

Thank you for your interest in contributing to Flazz! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors. Please be kind, professional, and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm 8+
- Git
- Basic knowledge of TypeScript, React, and Electron

### Setting Up Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/flazz.git
   cd flazz
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Start the development server:
   ```bash
   pnpm run dev
   ```

For detailed setup instructions, see [docs/development/setup.md](docs/development/setup.md).

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feature/` - New features (e.g., `feature/add-skill-templates`)
- `fix/` - Bug fixes (e.g., `fix/memory-leak-in-chat`)
- `refactor/` - Code refactoring (e.g., `refactor/extract-chat-service`)
- `docs/` - Documentation updates (e.g., `docs/update-api-guide`)
- `arch/` - Architecture changes (e.g., `arch/split-core-modules`)

### Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our [code style guidelines](#code-style)

3. Test your changes thoroughly

4. Commit your changes with clear messages

5. Push to your fork and create a pull request

## Code Style

### TypeScript

- Use TypeScript for all new code
- Enable strict mode and fix all type errors
- Prefer interfaces over types for object shapes
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Code Organization

Follow the project's architecture principles (see [AGENTS.md](AGENTS.md)):

- **Renderer** (`apps/renderer`): UI components and presentation logic only
- **Main** (`apps/main`): Electron bootstrap and IPC wiring only
- **Core** (`packages/core`): Business logic and domain orchestration
- **Shared** (`packages/shared`): Contracts, schemas, and types

### File Structure

- Keep files focused and under ~400-500 lines
- Extract reusable logic into separate modules
- Place domain-specific code in appropriate feature folders
- Use index files for clean public APIs

### Naming Conventions

- **Files**: kebab-case (e.g., `chat-runtime.ts`)
- **Components**: PascalCase (e.g., `ChatMessage.tsx`)
- **Functions**: camelCase (e.g., `sendMessage`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (e.g., `ChatMessage`, `IMessageHandler`)

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```
feat(chat): add multi-file attachment support

- Allow users to attach multiple files to messages
- Add file preview in chat input
- Update message schema to support file arrays

Closes #123
```

```
fix(memory): prevent duplicate entries in knowledge graph

The graph was creating duplicate nodes when the same entity
was mentioned in different contexts. Added deduplication logic
to merge nodes with identical identifiers.

Fixes #456
```

## Pull Request Process

### Before Submitting

1. Ensure your code follows the style guidelines
2. Run linting: `pnpm run lint`
3. Test your changes manually
4. Update documentation if needed
5. Add tests for new functionality

### PR Description Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How to test these changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated
```

### Review Process

1. Maintainers will review your PR within a few days
2. Address any feedback or requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release

## Testing

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage
```

### Writing Tests

- Write tests for all new features
- Test edge cases and error conditions
- Use descriptive test names
- Keep tests focused and independent

## Documentation

### When to Update Documentation

- Adding new features
- Changing existing behavior
- Adding new configuration options
- Fixing bugs that affect user-facing behavior

### Documentation Structure

- **Getting Started**: Installation and quick start guides
- **Features**: Detailed feature documentation
- **Architecture**: System design and technical details
- **Development**: Contributing and development guides

### Writing Style

- Use clear, concise language
- Include code examples
- Add screenshots for UI features
- Keep documentation up-to-date with code changes

## Questions?

If you have questions or need help:

- Check existing [documentation](docs/README.md)
- Search [existing issues](https://github.com/flazz/flazz/issues)
- Create a new issue with the `question` label
- Join our community discussions

Thank you for contributing to Flazz!
