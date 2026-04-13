import { z } from 'zod';

export const SkillFrontmatter = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  author: z.string().optional(),
});

export const Skill = z.object({
  name: z.string(),
  path: z.string(),
  frontmatter: SkillFrontmatter,
  content: z.string(),
  supportingFiles: z
    .object({
      references: z.array(z.string()).optional(),
      templates: z.array(z.string()).optional(),
      scripts: z.array(z.string()).optional(),
      assets: z.array(z.string()).optional(),
    })
    .optional(),
});

export const SkillConfig = z.object({
  maxNameLength: z.number().default(64),
  maxDescriptionLength: z.number().default(1024),
  maxContentChars: z.number().default(100000),
  maxFileBytes: z.number().default(1048576),
  allowedSubdirs: z
    .array(z.string())
    .default(['references', 'templates', 'scripts', 'assets']),
});
