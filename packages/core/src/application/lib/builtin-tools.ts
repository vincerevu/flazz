import { z, ZodType } from "zod";
import { workspaceTools, shellTools, mcpTools, researchTools, integrationTools, agentTools, memoryTools } from "./tools/index.js";


export const BuiltinToolsSchema = z.record(z.string(), z.object({
    description: z.string(),
    inputSchema: z.custom<ZodType>(),
    execute: z.function({
        input: z.any(),
        output: z.promise(z.any()),
    }),
    isAvailable: z.custom<() => Promise<boolean>>().optional(),
}));

export const BuiltinTools: z.infer<typeof BuiltinToolsSchema> = {
    ...workspaceTools,
    ...shellTools,
    ...mcpTools,
    ...researchTools,
    ...integrationTools,
    ...agentTools,
    ...memoryTools,
};
