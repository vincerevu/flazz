import { z } from "zod";
import { FailureCategory, RunMemoryRecord, RunMemorySummary, RunOutcome } from "@flazz/shared";

export type RunMemoryRecord = z.infer<typeof RunMemoryRecord>;
export type RunMemorySummary = z.infer<typeof RunMemorySummary>;
export type RunOutcome = z.infer<typeof RunOutcome>;
export type FailureCategory = z.infer<typeof FailureCategory>;

