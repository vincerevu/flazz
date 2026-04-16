import { z } from "zod";
import { IAgentsRepo } from "../../../agents/repo.js";
import { SkillRegistry } from "../../../skills/registry.js";

let skillRegistry: SkillRegistry | null = null;
let agentsRepo: IAgentsRepo | null = null;

export function setSkillRegistry(registry: SkillRegistry): void {
    skillRegistry = registry;
}

export function setAgentsRepo(repo: IAgentsRepo): void {
    agentsRepo = repo;
}

export const agentTools = {
    analyzeAgent: {
        description: 'Read and analyze an agent file to understand its structure, tools, and configuration',
        inputSchema: z.object({
            agentName: z.string().describe('Name of the agent file to analyze (with or without .json extension)'),
        }),
        execute: async ({ agentName }: { agentName: string }) => {
            if (!agentsRepo) {
                return {
                    success: false,
                    message: 'Agents repository is not initialized',
                };
            }

            try {
                const agent = await agentsRepo.fetch(agentName);

                // Extract key information
                const toolsList = agent.tools ? Object.keys(agent.tools) : [];
                const agentTools = agent.tools ? Object.entries(agent.tools).map(([key, tool]) => ({
                    key,
                    type: tool.type,
                    name: tool.name,
                })) : [];

                const analysis = {
                    name: agent.name,
                    description: agent.description || 'No description',
                    model: agent.model || 'Not specified',
                    toolCount: toolsList.length,
                    tools: agentTools,
                    hasOtherAgents: agentTools.some(t => t.type === 'agent'),
                    structure: agent,
                };

                return {
                    success: true,
                    analysis,
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Failed to analyze agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
                };
            }
        },
    },

    loadSkill: {
        description: "Load a Flazz skill definition into context by fetching its guidance string",
        inputSchema: z.object({
            skillName: z.string().describe("Skill identifier or path (e.g., 'workflow-run-ops' or 'src/application/assistant/skills/workflow-run-ops/skill.ts')"),
        }),
        execute: async ({ skillName }: { skillName: string }) => {
            if (!skillRegistry) {
                return {
                    success: false,
                    message: "Skill registry is not initialized.",
                };
            }

            const resolved = await skillRegistry.get(skillName);
            if (!resolved) {
                const availableSkills = await skillRegistry.list();
                return {
                    success: false,
                    message: `Skill '${skillName}' not found. Available skills: ${availableSkills.map((skill) => skill.name).join(", ")}`,
                };
            }

            return {
                success: true,
                skillName: resolved.name,
                path: resolved.path,
                source: resolved.source,
                content: resolved.content,
            };
        },
    },


};
