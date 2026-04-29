import z from "zod";
import { Run, RunConversation, RunEvent, CreateRunOptions, ListRunsResponse } from "@flazz/shared";

export interface IRunsRepo {
    create(options: z.infer<typeof CreateRunOptions>): Promise<z.infer<typeof Run>>;
    fetch(id: string): Promise<z.infer<typeof Run>>;
    fetchConversation(id: string): Promise<z.infer<typeof RunConversation>>;
    list(cursor?: string, filters?: { runType?: z.infer<typeof Run>["runType"] }): Promise<z.infer<typeof ListRunsResponse>>;
    appendEvents(runId: string, events: z.infer<typeof RunEvent>[]): Promise<void>;
    delete(id: string): Promise<void>;
}
