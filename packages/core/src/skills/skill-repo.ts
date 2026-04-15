import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { type Skill, type SkillFrontmatter, type ISkillRepo } from './types.js';
import { fuzzyFindAndReplace } from './fuzzy-match.js';

export class SkillRepo implements ISkillRepo {
  private skillsDir: string;
  private readonly VALID_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
  private readonly ALLOWED_SUBDIRS = ['references', 'templates', 'scripts', 'assets'];

  constructor(workspacePath: string) {
    this.skillsDir = path.join(workspacePath, 'memory', 'Skills');
  }

  async ensureSkillsDir(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
  }

  async list(): Promise<Skill[]> {
    await this.ensureSkillsDir();

    const skills: Skill[] = [];
    const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Check for SKILL.md in root
      const skillPath = path.join(this.skillsDir, entry.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      try {
        await fs.access(skillMdPath);
        const skill = await this.loadSkill(entry.name, skillPath);
        if (skill) skills.push(skill);
      } catch {
        // Check for category subdirectories
        const subEntries = await fs.readdir(skillPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory()) continue;

          const subSkillPath = path.join(skillPath, subEntry.name);
          const subSkillMdPath = path.join(subSkillPath, 'SKILL.md');

          try {
            await fs.access(subSkillMdPath);
            const skill = await this.loadSkill(subEntry.name, subSkillPath);
            if (skill) skills.push(skill);
          } catch {
            // Skip invalid skills
          }
        }
      }
    }

    return skills;
  }

  async get(name: string): Promise<Skill | null> {
    const skills = await this.list();
    return skills.find((s) => s.name === name) || null;
  }

  async create(name: string, content: string, category?: string): Promise<void> {
    await this.ensureSkillsDir();

    // Validate name
    if (!this.VALID_NAME_RE.test(name)) {
      throw new Error(
        `Invalid skill name '${name}'. Use lowercase letters, numbers, hyphens, dots, and underscores.`
      );
    }

    // Check for existing skill
    const existing = await this.get(name);
    if (existing) {
      throw new Error(`Skill '${name}' already exists at ${existing.path}`);
    }

    // Create skill directory
    const skillPath = category
      ? path.join(this.skillsDir, category, name)
      : path.join(this.skillsDir, name);

    await fs.mkdir(skillPath, { recursive: true });

    // Write SKILL.md atomically
    await this.atomicWrite(path.join(skillPath, 'SKILL.md'), content);
  }

  async update(name: string, content: string): Promise<void> {
    const skill = await this.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found`);
    }

    const skillMdPath = path.join(skill.path, 'SKILL.md');
    await this.atomicWrite(skillMdPath, content);
  }

  async patch(
    name: string,
    oldString: string,
    newString: string,
    filePath?: string,
    replaceAll: boolean = false
  ): Promise<{ matchCount: number }> {
    const skill = await this.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found`);
    }

    const targetPath = filePath
      ? path.join(skill.path, filePath)
      : path.join(skill.path, 'SKILL.md');

    // Read current content
    const content = await fs.readFile(targetPath, 'utf-8');

    // Use fuzzy matching for better success rate
    const result = fuzzyFindAndReplace(content, oldString, newString, replaceAll);

    if (result.error) {
      throw new Error(result.error);
    }

    if (result.matchCount === 0) {
      throw new Error(`No match found for '${oldString}'`);
    }

    await this.atomicWrite(targetPath, result.newContent);

    return { matchCount: result.matchCount };
  }

  async delete(name: string): Promise<void> {
    const skill = await this.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found`);
    }

    await fs.rm(skill.path, { recursive: true, force: true });

    // Clean up empty category directories
    const parent = path.dirname(skill.path);
    if (parent !== this.skillsDir) {
      try {
        const entries = await fs.readdir(parent);
        if (entries.length === 0) {
          await fs.rmdir(parent);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async writeFile(name: string, filePath: string, content: string): Promise<void> {
    const skill = await this.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found`);
    }

    // Validate file path
    this.validateFilePath(filePath);

    const targetPath = path.join(skill.path, filePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await this.atomicWrite(targetPath, content);
  }

  async removeFile(name: string, filePath: string): Promise<void> {
    const skill = await this.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found`);
    }

    this.validateFilePath(filePath);

    const targetPath = path.join(skill.path, filePath);
    await fs.unlink(targetPath);

    // Clean up empty subdirectories
    const parent = path.dirname(targetPath);
    if (parent !== skill.path) {
      try {
        const entries = await fs.readdir(parent);
        if (entries.length === 0) {
          await fs.rmdir(parent);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Private helpers

  private async loadSkill(name: string, skillPath: string): Promise<Skill | null> {
    try {
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      const content = await fs.readFile(skillMdPath, 'utf-8');

      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter) return null;

      const supportingFiles = await this.loadSupportingFiles(skillPath);

      return {
        name,
        path: skillPath,
        frontmatter,
        content,
        supportingFiles,
      };
    } catch {
      return null;
    }
  }

  private parseFrontmatter(content: string): SkillFrontmatter | null {
    if (!content.startsWith('---')) return null;

    const endMatch = content.indexOf('\n---\n', 3);
    if (endMatch === -1) return null;

    const yamlContent = content.slice(3, endMatch);

    try {
      const parsed = parseYaml(yamlContent);
      if (!parsed || typeof parsed !== 'object') return null;

      const frontmatter = parsed as Record<string, unknown>;
      if (!frontmatter.name || !frontmatter.description) return null;

      return {
        name: String(frontmatter.name),
        description: String(frontmatter.description),
        category: frontmatter.category ? String(frontmatter.category) : undefined,
        tags: Array.isArray(frontmatter.tags)
          ? frontmatter.tags.map(String)
          : undefined,
        version: frontmatter.version ? String(frontmatter.version) : undefined,
        author: frontmatter.author ? String(frontmatter.author) : undefined,
      };
    } catch {
      return null;
    }
  }

  private async loadSupportingFiles(skillPath: string): Promise<{
    references?: string[];
    templates?: string[];
    scripts?: string[];
    assets?: string[];
  }> {
    const result: {
      references?: string[];
      templates?: string[];
      scripts?: string[];
      assets?: string[];
    } = {};

    for (const subdir of this.ALLOWED_SUBDIRS) {
      const subdirPath = path.join(skillPath, subdir);
      try {
        const files = await this.listFilesRecursive(subdirPath);
        if (files.length > 0) {
          result[subdir as keyof typeof result] = files.map((f) =>
            path.relative(skillPath, f)
          );
        }
      } catch {
        // Subdir doesn't exist
      }
    }

    return result;
  }

  private async listFilesRecursive(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listFilesRecursive(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private validateFilePath(filePath: string): void {
    // Check for path traversal
    if (filePath.includes('..')) {
      throw new Error('Path traversal is not allowed');
    }

    // Must be under allowed subdirectory
    const parts = filePath.split(path.sep);
    if (parts.length < 2 || !this.ALLOWED_SUBDIRS.includes(parts[0])) {
      throw new Error(
        `File must be under one of: ${this.ALLOWED_SUBDIRS.join(', ')}`
      );
    }
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = path.join(
      dir,
      `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
    );

    try {
      await fs.writeFile(tmpPath, content, 'utf-8');
      await fs.rename(tmpPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}
