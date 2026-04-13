import type { BackgroundService } from "../services/background_service.js";
import fs from 'fs';
import path from 'path';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { WorkDir } from '../config/config.js';
import { composioAccountsRepo } from '../composio/repo.js';
import { executeAction } from '../composio/client.js';
import { serviceLogger } from '../services/service_logger.js';
import { limitEventItems } from './limit_event_items.js';

// Configuration
const SYNC_DIR = path.join(WorkDir, 'calendar_sync');
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // Check every 1 hour
const LOOKBACK_DAYS = 14;
const nhm = new NodeHtmlMarkdown();

// --- Wake Signal for Immediate Sync Trigger ---
let wakeResolve: (() => void) | null = null;

export function triggerSync(): void {
    if (wakeResolve) {
        console.log('[Calendar Composio] Triggered - waking up immediately');
        wakeResolve();
        wakeResolve = null;
    }
}

function interruptibleSleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            wakeResolve = null;
            resolve();
        }, ms);
        wakeResolve = () => {
            clearTimeout(timeout);
            resolve();
        };
    });
}

// --- Helper Functions ---

function cleanFilename(name: string): string {
    return name.replace(/[\\/*?:"<>|]/g, "").replace(/\s+/g, "_").substring(0, 100).trim();
}

// --- Composio API Calls ---

async function listEvents(accountId: string, timeMin: string, timeMax: string): Promise<any[]> {
    console.log(`[Calendar Composio] Listing events from ${timeMin} to ${timeMax}`);
    
    const result = await executeAction(
        'GOOGLECALENDAR_LIST_EVENTS',
        accountId,
        {
            calendarId: 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime'
        }
    );

    if (!result.success) {
        throw new Error(`Failed to list events: ${result.error}`);
    }

    return (result.data as any)?.items || [];
}

async function getEvent(accountId: string, eventId: string): Promise<any> {
    console.log(`[Calendar Composio] Getting event: ${eventId}`);
    
    const result = await executeAction(
        'GOOGLECALENDAR_GET_EVENT',
        accountId,
        {
            calendarId: 'primary',
            eventId
        }
    );

    if (!result.success) {
        throw new Error(`Failed to get event: ${result.error}`);
    }

    return result.data;
}

// Note: Google Drive integration for meeting notes would require separate Drive toolkit
// For now, we'll just save event metadata

// --- Sync Logic ---

function cleanUpOldFiles(currentEventIds: Set<string>, syncDir: string): string[] {
    if (!fs.existsSync(syncDir)) return [];

    const files = fs.readdirSync(syncDir);
    const deleted: string[] = [];
    
    for (const filename of files) {
        if (filename === 'sync_state.json') continue;

        let eventId: string | null = null;

        if (filename.endsWith('.json')) {
            eventId = filename.replace('.json', '');
        } else if (filename.endsWith('.md')) {
            const parts = filename.split('_doc_');
            if (parts.length > 1) {
                eventId = parts[0];
            }
        }

        if (eventId && !currentEventIds.has(eventId)) {
            try {
                fs.unlinkSync(path.join(syncDir, filename));
                console.log(`Removed old/out-of-window file: ${filename}`);
                deleted.push(filename);
            } catch (e) {
                console.error(`Error deleting file ${filename}:`, e);
            }
        }
    }
    
    return deleted;
}

async function saveEvent(event: any, syncDir: string): Promise<{ changed: boolean; isNew: boolean; title: string }> {
    const eventId = event.id;
    if (!eventId) return { changed: false, isNew: false, title: 'Unknown' };

    const filePath = path.join(syncDir, `${eventId}.json`);
    const content = JSON.stringify(event, null, 2);
    const exists = fs.existsSync(filePath);

    try {
        if (exists) {
            const existing = fs.readFileSync(filePath, 'utf-8');
            if (existing === content) {
                return { changed: false, isNew: false, title: event.summary || eventId };
            }
        }

        fs.writeFileSync(filePath, content);
        return { changed: true, isNew: !exists, title: event.summary || eventId };
    } catch (e) {
        console.error(`Error saving event ${eventId}:`, e);
        return { changed: false, isNew: false, title: event.summary || eventId };
    }
}

async function syncCalendarWindow(accountId: string, syncDir: string, lookbackDays: number) {
    // Calculate window
    const now = new Date();
    const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;
    const twoWeeksForwardMs = 14 * 24 * 60 * 60 * 1000;

    const timeMin = new Date(now.getTime() - lookbackMs).toISOString();
    const timeMax = new Date(now.getTime() + twoWeeksForwardMs).toISOString();

    console.log(`[Calendar Composio] Syncing calendar from ${timeMin} to ${timeMax} (lookback: ${lookbackDays} days)...`);

    let runId: string | null = null;
    let runStartedAt = 0;
    let newCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    const changedTitles: string[] = [];

    const ensureRun = async () => {
        if (!runId) {
            const run = await serviceLogger.startRun({
                service: 'calendar',
                message: 'Syncing calendar (Composio)',
                trigger: 'timer',
            });
            runId = run.runId;
            runStartedAt = run.startedAt;
        }
    };

    try {
        const events = await listEvents(accountId, timeMin, timeMax);
        const currentEventIds = new Set<string>();

        if (events.length === 0) {
            console.log('[Calendar Composio] No events found in this window.');
        } else {
            console.log(`[Calendar Composio] Found ${events.length} events.`);
            
            for (const event of events) {
                if (event.id) {
                    const result = await saveEvent(event, syncDir);
                    currentEventIds.add(event.id);

                    if (result.changed) {
                        await ensureRun();
                        changedTitles.push(result.title);
                        if (result.isNew) {
                            newCount++;
                        } else {
                            updatedCount++;
                        }
                    }
                }
            }
        }

        const deletedFiles = cleanUpOldFiles(currentEventIds, syncDir);
        if (deletedFiles.length > 0) {
            await ensureRun();
            deletedCount = deletedFiles.length;
        }

        if (runId) {
            const totalChanges = newCount + updatedCount + deletedCount;
            const limitedTitles = limitEventItems(changedTitles);
            
            await serviceLogger.log({
                type: 'changes_identified',
                service: 'calendar',
                runId,
                level: 'info',
                message: `Calendar updates: ${totalChanges} change${totalChanges === 1 ? '' : 's'}`,
                counts: {
                    newEvents: newCount,
                    updatedEvents: updatedCount,
                    deletedFiles: deletedCount,
                },
                items: limitedTitles.items,
                truncated: limitedTitles.truncated,
            });
            
            await serviceLogger.log({
                type: 'run_complete',
                service: 'calendar',
                runId,
                level: 'info',
                message: `Calendar sync complete: ${totalChanges} change${totalChanges === 1 ? '' : 's'}`,
                durationMs: Date.now() - runStartedAt,
                outcome: 'ok',
                summary: {
                    newEvents: newCount,
                    updatedEvents: updatedCount,
                    deletedFiles: deletedCount,
                },
            });
        }

    } catch (error) {
        console.error('[Calendar Composio] An error occurred during calendar sync:', error);
        
        if (runId) {
            await serviceLogger.log({
                type: 'error',
                service: 'calendar',
                runId,
                level: 'error',
                message: 'Calendar sync error',
                error: error instanceof Error ? error.message : String(error),
            });
            await serviceLogger.log({
                type: 'run_complete',
                service: 'calendar',
                runId,
                level: 'error',
                message: 'Calendar sync failed',
                durationMs: Date.now() - runStartedAt,
                outcome: 'error',
            });
        }
        
        throw error;
    }
}

async function performSync(syncDir: string, lookbackDays: number) {
    try {
        if (!fs.existsSync(syncDir)) {
            fs.mkdirSync(syncDir, { recursive: true });
        }

        // Check if Google Calendar is connected via Composio
        const account = composioAccountsRepo.getAccount('googlecalendar');
        if (!account || account.status !== 'ACTIVE') {
            console.log('[Calendar Composio] Google Calendar not connected via Composio. Skipping sync.');
            return;
        }

        console.log('[Calendar Composio] Starting sync...');
        await syncCalendarWindow(account.id, syncDir, lookbackDays);
        console.log('[Calendar Composio] Sync completed.');
        
    } catch (error) {
        console.error('[Calendar Composio] Error during sync:', error);
    }
}

// --- Background Service ---

let isRunning = false;

export const calendarSyncService: BackgroundService = {
    name: 'CalendarSyncComposio',
    async start(): Promise<void> {
        if (isRunning) return;
        isRunning = true;

        console.log('[Calendar Composio] Starting Google Calendar Sync (Composio)...');
        console.log(`[Calendar Composio] Will sync every ${SYNC_INTERVAL_MS / 1000} seconds.`);

        // Initial small delay to let other things boot up
        await new Promise(r => setTimeout(r, 1000));

        // Start background loop
        (async () => {
            while (isRunning) {
                try {
                    await performSync(SYNC_DIR, LOOKBACK_DAYS);
                } catch (error) {
                    console.error('[Calendar Composio] Error in main loop:', error);
                }

                if (!isRunning) break;
                
                console.log(`[Calendar Composio] Sleeping for ${SYNC_INTERVAL_MS / 1000} seconds...`);
                await interruptibleSleep(SYNC_INTERVAL_MS);
            }
        })();
    },
    
    async stop(): Promise<void> {
        isRunning = false;
        if (wakeResolve) {
            wakeResolve();
        }
    }
};
