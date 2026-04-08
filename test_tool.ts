import { registerTool } from "./packages/core/src/application/lib/tool-registry.js";
import { z } from "zod";

registerTool({
  name: "test-tool",
  description: "A test tool",
  inputSchema: z.object({}),
  execute: async () => { return { success: true }; }
});
