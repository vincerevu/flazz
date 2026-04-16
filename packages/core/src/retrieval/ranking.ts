import type { SkillRecord } from "../skills/registry.js";

function normalizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

export function rankSkills(query: string, allSkills: SkillRecord[]) {
  const queryWords = normalizeWords(query);

  return allSkills
    .map((skill) => {
      const haystacks = {
        name: skill.name.toLowerCase(),
        description: skill.description.toLowerCase(),
        category: (skill.category || "").toLowerCase(),
        tags: (skill.tags || []).join(" ").toLowerCase(),
        content: skill.content.toLowerCase(),
      };

      let keyword = 0;
      for (const word of queryWords) {
        if (haystacks.name.includes(word)) keyword += 6;
        if (haystacks.tags.includes(word)) keyword += 4;
        if (haystacks.category.includes(word)) keyword += 3;
        if (haystacks.description.includes(word)) keyword += 2;
        if (haystacks.content.includes(word)) keyword += 1;
      }

      const usage = haystacks.content.includes("## steps") ? 1 : 0;
      const total = keyword + usage;
      return {
        skill,
        scoreBreakdown: {
          keyword,
          usage,
          recency: 0,
          graph: 0,
          failurePenalty: 0,
          total,
        },
      };
    })
    .filter((entry) => entry.scoreBreakdown.total > 0)
    .sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total);
}

