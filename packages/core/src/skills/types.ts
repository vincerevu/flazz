export interface SkillFrontmatter {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
}

export interface Skill {
  name: string;
  path: string;
  frontmatter: SkillFrontmatter;
  content: string; // Full SKILL.md content including frontmatter
  supportingFiles?: {
    references?: string[];
    templates?: string[];
    scripts?: string[];
    assets?: string[];
  };
}

export interface SkillConfig {
  maxNameLength: number; // 64
  maxDescriptionLength: number; // 1024
  maxContentChars: number; // 100,000
  maxFileBytes: number; // 1 MB
  allowedSubdirs: string[]; // ['references', 'templates', 'scripts', 'assets']
}

export interface ISkillRepo {
  list(): Promise<Skill[]>;
  get(name: string): Promise<Skill | null>;
  create(name: string, content: string, category?: string): Promise<void>;
  update(name: string, content: string): Promise<void>;
  patch(
    name: string,
    oldString: string,
    newString: string,
    filePath?: string,
    replaceAll?: boolean
  ): Promise<{ matchCount: number }>;
  delete(name: string): Promise<void>;
  writeFile(name: string, filePath: string, content: string): Promise<void>;
  removeFile(name: string, filePath: string): Promise<void>;
}
