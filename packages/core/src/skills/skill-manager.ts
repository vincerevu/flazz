import { type Skill, type SkillConfig, type ISkillRepo } from './types.js';
import { scanSkillContent, formatScanReport } from './skill-scanner.js';

export class SkillManager {
  private config: SkillConfig = {
    maxNameLength: 64,
    maxDescriptionLength: 1024,
    maxContentChars: 100000,
    maxFileBytes: 1048576,
    allowedSubdirs: ['references', 'templates', 'scripts', 'assets'],
  };

  constructor(private repo: ISkillRepo) {}

  async create(
    name: string,
    content: string,
    category?: string
  ): Promise<{ success: boolean; error?: string; message?: string; path?: string }> {
    // Validate name
    const nameError = this.validateName(name);
    if (nameError) {
      return { success: false, error: nameError };
    }

    // Validate category
    if (category) {
      const categoryError = this.validateName(category);
      if (categoryError) {
        return { success: false, error: `Invalid category: ${categoryError}` };
      }
    }

    // Validate content
    const contentError = this.validateContent(content);
    if (contentError) {
      return { success: false, error: contentError };
    }

    // Security scan
    const scanResult = scanSkillContent(content);
    if (!scanResult.allowed) {
      return {
        success: false,
        error: `Security scan blocked this skill: ${scanResult.reason}\n\n${formatScanReport(scanResult)}`,
      };
    }

    try {
      await this.repo.create(name, content, category);
      return {
        success: true,
        message: `Skill '${name}' created.`,
        path: category ? `${category}/${name}` : name,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async update(
    name: string,
    content: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    const contentError = this.validateContent(content);
    if (contentError) {
      return { success: false, error: contentError };
    }

    // Security scan
    const scanResult = scanSkillContent(content);
    if (!scanResult.allowed) {
      return {
        success: false,
        error: `Security scan blocked this update: ${scanResult.reason}\n\n${formatScanReport(scanResult)}`,
      };
    }

    try {
      await this.repo.update(name, content);
      return { success: true, message: `Skill '${name}' updated.` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async patch(
    name: string,
    oldString: string,
    newString: string,
    filePath?: string,
    replaceAll: boolean = false
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    matchCount?: number;
  }> {
    if (!oldString) {
      return { success: false, error: 'old_string is required for patch.' };
    }

    if (newString === undefined || newString === null) {
      return {
        success: false,
        error: 'new_string is required for patch. Use empty string to delete.',
      };
    }

    try {
      const result = await this.repo.patch(name, oldString, newString, filePath, replaceAll);
      return {
        success: true,
        message: `Patched ${filePath || 'SKILL.md'} in skill '${name}' (${result.matchCount} replacement${result.matchCount > 1 ? 's' : ''}).`,
        matchCount: result.matchCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async delete(name: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      await this.repo.delete(name);
      return { success: true, message: `Skill '${name}' deleted.` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async writeFile(
    name: string,
    filePath: string,
    content: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!filePath) {
      return { success: false, error: 'file_path is required.' };
    }

    // Validate file size
    const bytes = Buffer.byteLength(content, 'utf-8');
    if (bytes > this.config.maxFileBytes) {
      return {
        success: false,
        error: `File content is ${bytes.toLocaleString()} bytes (limit: ${this.config.maxFileBytes.toLocaleString()} bytes).`,
      };
    }

    // Security scan for code files
    if (filePath.match(/\.(ts|js|py|sh|bash|zsh)$/i)) {
      const scanResult = scanSkillContent(content);
      if (!scanResult.allowed) {
        return {
          success: false,
          error: `Security scan blocked this file: ${scanResult.reason}\n\n${formatScanReport(scanResult)}`,
        };
      }
    }

    try {
      await this.repo.writeFile(name, filePath, content);
      return {
        success: true,
        message: `File '${filePath}' written to skill '${name}'.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async removeFile(
    name: string,
    filePath: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!filePath) {
      return { success: false, error: 'file_path is required.' };
    }

    try {
      await this.repo.removeFile(name, filePath);
      return {
        success: true,
        message: `File '${filePath}' removed from skill '${name}'.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async list(): Promise<Skill[]> {
    return await this.repo.list();
  }

  async get(name: string): Promise<Skill | null> {
    return await this.repo.get(name);
  }

  // Validation helpers

  private validateName(name: string): string | null {
    if (!name) {
      return 'Name is required.';
    }

    if (name.length > this.config.maxNameLength) {
      return `Name exceeds ${this.config.maxNameLength} characters.`;
    }

    const validNameRe = /^[a-z0-9][a-z0-9._-]*$/;
    if (!validNameRe.test(name)) {
      return 'Invalid name. Use lowercase letters, numbers, hyphens, dots, and underscores.';
    }

    return null;
  }

  private validateContent(content: string): string | null {
    if (!content || !content.trim()) {
      return 'Content cannot be empty.';
    }

    // Check frontmatter
    if (!content.startsWith('---')) {
      return 'SKILL.md must start with YAML frontmatter (---).';
    }

    const endMatch = content.indexOf('\n---\n', 3);
    if (endMatch === -1) {
      return 'SKILL.md frontmatter is not closed. Ensure you have a closing --- line.';
    }

    // Check body exists
    const body = content.slice(endMatch + 5).trim();
    if (!body) {
      return 'SKILL.md must have content after the frontmatter.';
    }

    // Check size
    if (content.length > this.config.maxContentChars) {
      return `Content is ${content.length.toLocaleString()} characters (limit: ${this.config.maxContentChars.toLocaleString()}).`;
    }

    return null;
  }
}
