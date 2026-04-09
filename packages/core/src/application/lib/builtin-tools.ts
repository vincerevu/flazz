import { z, ZodType } from "zod";
import { workspaceTools, shellTools, mcpTools, researchTools, integrationTools, agentTools } from "./tools/index.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const BuiltinToolsSchema = z.record(z.string(), z.object({
    description: z.string(),
	inputSchema: z.custom<ZodType>(),
    execute: z.function({
        input: z.any(), // (input, ctx?) => Promise<any>
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
};
