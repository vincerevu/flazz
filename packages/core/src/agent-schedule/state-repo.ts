import { WorkDir } from "../config/config.js";
import { AgentScheduleState, AgentScheduleStateEntry } from "@flazz/shared";
import fs from "fs/promises";
import path from "path";
import z from "zod";

const DEFAULT_AGENT_SCHEDULE_STATE: z.infer<typeof AgentScheduleState>["agents"] = {};

function buildDefaultAgentScheduleState(): z.infer<typeof AgentScheduleState> {
    return { agents: { ...DEFAULT_AGENT_SCHEDULE_STATE } };
}

export interface IAgentScheduleStateRepo {
    ensureState(): Promise<void>;
    getState(): Promise<z.infer<typeof AgentScheduleState>>;
    getAgentState(agentName: string): Promise<z.infer<typeof AgentScheduleStateEntry> | null>;
    updateAgentState(agentName: string, entry: Partial<z.infer<typeof AgentScheduleStateEntry>>): Promise<void>;
    setAgentState(agentName: string, entry: z.infer<typeof AgentScheduleStateEntry>): Promise<void>;
    deleteAgentState(agentName: string): Promise<void>;
}

export class FSAgentScheduleStateRepo implements IAgentScheduleStateRepo {
    private readonly statePath = path.join(WorkDir, "config", "agent-schedule-state.json");

    private async writeState(state: z.infer<typeof AgentScheduleState>): Promise<void> {
        const dir = path.dirname(this.statePath);
        await fs.mkdir(dir, { recursive: true });
        const tmpPath = path.join(
            dir,
            `.agent-schedule-state.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`,
        );
        const serialized = JSON.stringify(state, null, 2);
        await fs.writeFile(tmpPath, serialized, "utf8");
        await fs.rename(tmpPath, this.statePath);
    }

    async ensureState(): Promise<void> {
        try {
            await fs.access(this.statePath);
        } catch {
            await this.writeState(buildDefaultAgentScheduleState());
        }
    }

    async getState(): Promise<z.infer<typeof AgentScheduleState>> {
        await this.ensureState();
        const raw = await fs.readFile(this.statePath, "utf8");
        try {
            return AgentScheduleState.parse(JSON.parse(raw));
        } catch {
            const corruptPath = `${this.statePath}.corrupt-${Date.now()}`;
            await fs.rename(this.statePath, corruptPath).catch(() => undefined);
            const fallback = buildDefaultAgentScheduleState();
            await this.writeState(fallback);
            return fallback;
        }
    }

    async getAgentState(agentName: string): Promise<z.infer<typeof AgentScheduleStateEntry> | null> {
        const state = await this.getState();
        return state.agents[agentName] ?? null;
    }

    async updateAgentState(agentName: string, entry: Partial<z.infer<typeof AgentScheduleStateEntry>>): Promise<void> {
        const state = await this.getState();
        const existing = state.agents[agentName] ?? {
            status: "scheduled" as const,
            startedAt: null,
            lastRunAt: null,
            nextRunAt: null,
            lastError: null,
            runCount: 0,
        };
        state.agents[agentName] = { ...existing, ...entry };
        await this.writeState(state);
    }

    async setAgentState(agentName: string, entry: z.infer<typeof AgentScheduleStateEntry>): Promise<void> {
        const state = await this.getState();
        state.agents[agentName] = entry;
        await this.writeState(state);
    }

    async deleteAgentState(agentName: string): Promise<void> {
        const state = await this.getState();
        delete state.agents[agentName];
        await this.writeState(state);
    }
}
