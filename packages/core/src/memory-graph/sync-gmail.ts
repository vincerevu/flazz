import fs from 'fs';
import path from 'path';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { BackgroundService } from '../services/background_service.js';
import { WorkDir } from '../config/config.js';
import { serviceLogger, type ServiceRunContext } from '../services/service_logger.js';
import { limitEventItems } from './limit-event-items.js';
import { executeAction } from '../composio/client.js';
import { composioAccountsRepo } from '../composio/repo.js';
import { triggerGraphBuilderNow } from './build-graph.js';

const SYNC_DIR = path.join(WorkDir, 'gmail_sync');
const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const COMPOSIO_LOOKBACK_DAYS = 30;
const nhm = new NodeHtmlMarkdown();

type ComposioSyncState = {
    last_sync: string;
};

let isRunning = false;
let wakeResolve: (() => void) | null = null;

function cleanFilename(name: string): string {
    return name.replace(/[\\/*?:"<>|]/g, "").substring(0, 100).trim();
}

function triggerSync(): void {
    if (wakeResolve) {
        console.log('[Gmail] Triggered - waking up immediately');
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

function loadComposioState(stateFile: string): ComposioSyncState | null {
    if (fs.existsSync(stateFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
            if (data.last_sync) {
                return { last_sync: data.last_sync };
            }
        } catch (e) {
            console.error('[Gmail] Failed to load composio state:', e);
        }
    }
    return null;
}

function saveComposioState(stateFile: string, lastSync: string): void {
    fs.writeFileSync(stateFile, JSON.stringify({ last_sync: lastSync }, null, 2));
}

function tryParseDate(dateStr: string): Date | null {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

type ParsedMessage = {
    from: string;
    date: string;
    subject: string;
    body: string;
};

function extractBodyFromPayload(payload: Record<string, unknown>): string {
    const parts = payload.parts as Array<Record<string, unknown>> | undefined;

    if (parts) {
        for (const part of parts) {
            const mimeType = part.mimeType as string | undefined;
            const bodyData = part.body && typeof part.body === 'object'
                ? (part.body as Record<string, unknown>).data as string | undefined
                : undefined;

            if ((mimeType === 'text/plain' || mimeType === 'text/html') && bodyData) {
                const decoded = Buffer.from(bodyData, 'base64').toString('utf-8');
                if (mimeType === 'text/html') {
                    return nhm.translate(decoded);
                }
                return decoded;
            }

            if (part.parts) {
                const result = extractBodyFromPayload(part as Record<string, unknown>);
                if (result) return result;
            }
        }
    }

    const bodyData = payload.body && typeof payload.body === 'object'
        ? (payload.body as Record<string, unknown>).data as string | undefined
        : undefined;

    if (bodyData) {
        const decoded = Buffer.from(bodyData, 'base64').toString('utf-8');
        const mimeType = payload.mimeType as string | undefined;
        if (mimeType === 'text/html') {
            return nhm.translate(decoded);
        }
        return decoded;
    }

    return '';
}

function parseMessageData(messageData: Record<string, unknown>): ParsedMessage {
    const headers = messageData.payload && typeof messageData.payload === 'object'
        ? (messageData.payload as Record<string, unknown>).headers as Array<{ name: string; value: string }> | undefined
        : undefined;

    const from = headers?.find(h => h.name === 'From')?.value || String(messageData.from || messageData.sender || 'Unknown');
    const date = headers?.find(h => h.name === 'Date')?.value || String(messageData.date || messageData.internalDate || 'Unknown');
    const subject = headers?.find(h => h.name === 'Subject')?.value || String(messageData.subject || '(No Subject)');

    let body = '';

    if (messageData.payload && typeof messageData.payload === 'object') {
        body = extractBodyFromPayload(messageData.payload as Record<string, unknown>);
    }

    if (!body) {
        if (typeof messageData.body === 'string') {
            body = messageData.body;
        } else if (typeof messageData.snippet === 'string') {
            body = messageData.snippet;
        } else if (typeof messageData.text === 'string') {
            body = messageData.text;
        }
    }

    if (body && (body.includes('<html') || body.includes('<div') || body.includes('<p'))) {
        body = nhm.translate(body);
    }

    if (body) {
        body = body.split('\n').filter((line: string) => !line.trim().startsWith('>')).join('\n');
    }

    return { from, date, subject, body };
}

async function processThreadComposio(connectedAccountId: string, threadId: string, syncDir: string): Promise<string | null> {
    let threadResult;
    try {
        threadResult = await executeAction(
            'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
            connectedAccountId,
            { thread_id: threadId, user_id: 'me' },
        );
    } catch (error) {
        console.warn(`[Gmail] Skipping thread ${threadId} (fetch failed):`, error instanceof Error ? error.message : error);
        return null;
    }

    if (!threadResult.success || !threadResult.data) {
        console.error(`[Gmail] Failed to fetch thread ${threadId}:`, threadResult.error);
        return null;
    }

    const data = threadResult.data as Record<string, unknown>;
    const messages = data.messages as Array<Record<string, unknown>> | undefined;

    let newestDate: Date | null = null;

    if (!messages || messages.length === 0) {
        const parsed = parseMessageData(data);
        const mdContent = `# ${parsed.subject}\n\n` +
            `**Thread ID:** ${threadId}\n` +
            `**Message Count:** 1\n\n---\n\n` +
            `### From: ${parsed.from}\n` +
            `**Date:** ${parsed.date}\n\n` +
            `${parsed.body}\n\n---\n\n`;

        fs.writeFileSync(path.join(syncDir, `${cleanFilename(threadId)}.md`), mdContent);
        console.log(`[Gmail] Synced Thread: ${parsed.subject} (${threadId})`);
        newestDate = tryParseDate(parsed.date);
    } else {
        const firstParsed = parseMessageData(messages[0]);
        let mdContent = `# ${firstParsed.subject}\n\n`;
        mdContent += `**Thread ID:** ${threadId}\n`;
        mdContent += `**Message Count:** ${messages.length}\n\n---\n\n`;

        for (const msg of messages) {
            const parsed = parseMessageData(msg);
            mdContent += `### From: ${parsed.from}\n`;
            mdContent += `**Date:** ${parsed.date}\n\n`;
            mdContent += `${parsed.body}\n\n`;
            mdContent += `---\n\n`;

            const msgDate = tryParseDate(parsed.date);
            if (msgDate && (!newestDate || msgDate > newestDate)) {
                newestDate = msgDate;
            }
        }

        fs.writeFileSync(path.join(syncDir, `${cleanFilename(threadId)}.md`), mdContent);
        console.log(`[Gmail] Synced Thread: ${firstParsed.subject} (${threadId})`);
    }

    if (!newestDate) return null;
    return new Date(newestDate.getTime() + 1000).toISOString();
}

async function performSyncComposio() {
    const STATE_FILE = path.join(SYNC_DIR, 'sync_state.json');

    if (!fs.existsSync(SYNC_DIR)) fs.mkdirSync(SYNC_DIR, { recursive: true });

    const account = composioAccountsRepo.getAccount('gmail');
    if (!account || account.status !== 'ACTIVE') {
        console.log('[Gmail] Gmail not connected via Composio. Skipping sync.');
        return;
    }

    const connectedAccountId = account.id;
    const state = loadComposioState(STATE_FILE);
    let afterEpochSeconds: number;

    if (state) {
        afterEpochSeconds = Math.floor(new Date(state.last_sync).getTime() / 1000);
        console.log(`[Gmail] Syncing messages since ${state.last_sync}...`);
    } else {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - COMPOSIO_LOOKBACK_DAYS);
        afterEpochSeconds = Math.floor(pastDate.getTime() / 1000);
        console.log(`[Gmail] First sync - fetching last ${COMPOSIO_LOOKBACK_DAYS} days...`);
    }

    let run: ServiceRunContext | null = null;
    const ensureRun = async () => {
        if (!run) {
            run = await serviceLogger.startRun({
                service: 'gmail',
                message: 'Syncing Gmail',
                trigger: 'timer',
            });
        }
    };

    try {
        const allThreadIds: string[] = [];
        let pageToken: string | undefined;

        do {
            const params: Record<string, unknown> = {
                query: `after:${afterEpochSeconds}`,
                max_results: 20,
                user_id: 'me',
            };
            if (pageToken) {
                params.page_token = pageToken;
            }

            const result = await executeAction(
                'GMAIL_LIST_THREADS',
                connectedAccountId,
                params,
            );

            if (!result.success || !result.data) {
                console.error('[Gmail] Failed to list threads:', result.error);
                return;
            }

            const data = result.data as Record<string, unknown>;
            const threads = data.threads as Array<Record<string, unknown>> | undefined;

            if (threads && threads.length > 0) {
                for (const thread of threads) {
                    const threadId = thread.id as string | undefined;
                    if (threadId) {
                        allThreadIds.push(threadId);
                    }
                }
            }

            pageToken = data.nextPageToken as string | undefined;
        } while (pageToken);

        if (allThreadIds.length === 0) {
            console.log('[Gmail] No new threads.');
            return;
        }

        console.log(`[Gmail] Found ${allThreadIds.length} threads to sync.`);

        await ensureRun();
        const limitedThreads = limitEventItems(allThreadIds);
        await serviceLogger.log({
            type: 'changes_identified',
            service: run!.service,
            runId: run!.runId,
            level: 'info',
            message: `Found ${allThreadIds.length} thread${allThreadIds.length === 1 ? '' : 's'} to sync`,
            counts: { threads: allThreadIds.length },
            items: limitedThreads.items,
            truncated: limitedThreads.truncated,
        });

        allThreadIds.reverse();

        let highWaterMark: string | null = state?.last_sync ?? null;
        let processedCount = 0;
        for (const threadId of allThreadIds) {
            try {
                const newestInThread = await processThreadComposio(connectedAccountId, threadId, SYNC_DIR);
                processedCount++;

                if (newestInThread) {
                    if (!highWaterMark || new Date(newestInThread) > new Date(highWaterMark)) {
                        highWaterMark = newestInThread;
                    }
                    saveComposioState(STATE_FILE, highWaterMark);
                }
            } catch (error) {
                console.error(`[Gmail] Error processing thread ${threadId}, skipping:`, error);
            }
        }

        await serviceLogger.log({
            type: 'run_complete',
            service: run!.service,
            runId: run!.runId,
            level: 'info',
            message: `Gmail sync complete: ${processedCount}/${allThreadIds.length} thread${allThreadIds.length === 1 ? '' : 's'}`,
            durationMs: Date.now() - run!.startedAt,
            outcome: 'ok',
            summary: { threads: processedCount },
        });

        console.log(`[Gmail] Sync completed. Processed ${processedCount}/${allThreadIds.length} threads.`);
        triggerGraphBuilderNow();
    } catch (error) {
        console.error('[Gmail] Error during sync:', error);
        await ensureRun();
        await serviceLogger.log({
            type: 'error',
            service: run!.service,
            runId: run!.runId,
            level: 'error',
            message: 'Gmail sync error',
            error: error instanceof Error ? error.message : String(error),
        });
        await serviceLogger.log({
            type: 'run_complete',
            service: run!.service,
            runId: run!.runId,
            level: 'error',
            message: 'Gmail sync failed',
            durationMs: Date.now() - run!.startedAt,
            outcome: 'error',
        });
    }
}

async function runOnce() {
    if (!composioAccountsRepo.isConnected('gmail')) {
        console.log('[Gmail] Gmail not connected via Composio. Sleeping...');
        return;
    }
    await performSyncComposio();
}

export const gmailSyncService: BackgroundService = {
    name: 'GmailSync',
    async start() {
        if (isRunning) return;
        isRunning = true;

        console.log('[Gmail] Starting Gmail Sync Service...');
        console.log(`[Gmail] Will sync every ${SYNC_INTERVAL_MS / 1000} seconds.`);

        if (isRunning) {
            try {
                await runOnce();
            } catch (error) {
                console.error('[Gmail] Error in initial run:', error);
            }
        }

        void (async () => {
            while (isRunning) {
                await interruptibleSleep(SYNC_INTERVAL_MS);
                if (!isRunning) break;
                try {
                    await runOnce();
                } catch (error) {
                    console.error('[Gmail] Error in main loop:', error);
                }
            }
        })();
    },
    async stop() {
        isRunning = false;
        if (wakeResolve) {
            wakeResolve();
        }
    },
};

export async function triggerGmailSyncNow() {
    if (!isRunning) {
        return { success: false as const, error: 'GmailSync is not running.' };
    }
    await runOnce();
    triggerSync();
    return { success: true as const };
}
