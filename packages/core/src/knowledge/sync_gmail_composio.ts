import type { BackgroundService } from "../services/background_service.js";
import fs from 'fs';
import path from 'path';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { WorkDir } from '../config/config.js';
import { composioAccountsRepo } from '../composio/repo.js';
import { executeAction } from '../composio/client.js';
import { serviceLogger, type ServiceRunContext } from '../services/service_logger.js';
import { limitEventItems } from './limit_event_items.js';

// Configuration
const SYNC_DIR = path.join(WorkDir, 'gmail_sync');
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // Check every 1 hour
const LOOKBACK_DAYS = 30;
const nhm = new NodeHtmlMarkdown();

// --- Wake Signal for Immediate Sync Trigger ---
let wakeResolve: (() => void) | null = null;

export function triggerSync(): void {
    if (wakeResolve) {
        console.log('[Gmail Composio] Triggered - waking up immediately');
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
    return name.replace(/[\\/*?:":<>|]/g, "").substring(0, 100).trim();
}

function decodeBase64(data: string): string {
    try {
        return Buffer.from(data, 'base64').toString('utf-8');
    } catch (e) {
        console.error('Failed to decode base64:', e);
        return '';
    }
}

// --- State Management ---

interface SyncState {
    lastSyncTime?: string;
    historyId?: string;
}

function loadState(stateFile: string): SyncState {
    if (fs.existsSync(stateFile)) {
        try {
            return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    }
    return {};
}

function saveState(state: SyncState, stateFile: string) {
    fs.writeFileSync(stateFile, JSON.stringify({
        ...state,
        last_sync: new Date().toISOString()
    }, null, 2));
}

// --- Composio API Calls ---

async function listThreads(accountId: string, afterDate: string): Promise<any[]> {
    console.log(`[Gmail Composio] Listing threads after ${afterDate}`);
    
    const allThreads: any[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 10; // Safety limit: 10 pages × 500 = 5000 threads max

    do {
        const result = await executeAction(
            'GMAIL_LIST_THREADS',
            accountId,
            {
                q: `after:${afterDate}`,
                maxResults: 500, // Increased from 100 to 500 (Gmail API maximum)
                ...(pageToken && { pageToken })
            }
        );

        if (!result.success) {
            throw new Error(`Failed to list threads: ${result.error}`);
        }

        const threads = result.data?.threads || [];
        allThreads.push(...threads);
        pageToken = result.data?.nextPageToken;
        pageCount++;

        console.log(`[Gmail Composio] Page ${pageCount}: Fetched ${threads.length} threads (total: ${allThreads.length})`);

        // Safety limit to prevent runaway pagination
        if (pageCount >= MAX_PAGES) {
            console.log(`[Gmail Composio] Reached max pages (${MAX_PAGES}), stopping pagination`);
            break;
        }

    } while (pageToken);

    console.log(`[Gmail Composio] Total threads fetched: ${allThreads.length} in ${pageCount} page(s)`);
    return allThreads;
}

async function getThreadDetails(accountId: string, threadId: string): Promise<any> {
    console.log(`[Gmail Composio] Getting thread details: ${threadId}`);
    
    const result = await executeAction(
        'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
        accountId,
        { threadId }
    );

    if (!result.success) {
        throw new Error(`Failed to get thread details: ${result.error}`);
    }

    return result.data;
}

async function getAttachment(accountId: string, messageId: string, attachmentId: string): Promise<any> {
    console.log(`[Gmail Composio] Getting attachment: ${attachmentId}`);
    
    const result = await executeAction(
        'GMAIL_GET_ATTACHMENT',
        accountId,
        { 
            messageId,
            id: attachmentId
        }
    );

    if (!result.success) {
        throw new Error(`Failed to get attachment: ${result.error}`);
    }

    return result.data;
}

// --- Process Thread ---

function extractHeader(headers: any[], name: string): string {
    if (!Array.isArray(headers)) return 'Unknown';
    const header = headers.find((h: any) => h.name === name);
    return header?.value || 'Unknown';
}

function getBodyFromPayload(payload: any): string {
    let body = "";
    
    if (!payload) return body;

    // Handle multipart messages
    if (payload.parts && Array.isArray(payload.parts)) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                const text = decodeBase64(part.body.data);
                const cleanLines = text.split('\n').filter((line: string) => !line.trim().startsWith('>'));
                body += cleanLines.join('\n');
            } else if (part.mimeType === 'text/html' && part.body?.data) {
                const html = decodeBase64(part.body.data);
                const md = nhm.translate(html);
                const cleanLines = md.split('\n').filter((line: string) => !line.trim().startsWith('>'));
                body += cleanLines.join('\n');
            } else if (part.parts) {
                body += getBodyFromPayload(part);
            }
        }
    } 
    // Handle simple messages
    else if (payload.body?.data) {
        const data = decodeBase64(payload.body.data);
        if (payload.mimeType === 'text/html') {
            const md = nhm.translate(data);
            body += md.split('\n').filter((line: string) => !line.trim().startsWith('>')).join('\n');
        } else {
            body += data.split('\n').filter((line: string) => !line.trim().startsWith('>')).join('\n');
        }
    }

    return body;
}

async function saveAttachment(
    accountId: string,
    msgId: string,
    part: any,
    attachmentsDir: string
): Promise<string | null> {
    const filename = part.filename;
    const attId = part.body?.attachmentId;
    
    if (!filename || !attId) return null;

    const safeName = `${msgId}_${cleanFilename(filename)}`;
    const filePath = path.join(attachmentsDir, safeName);

    // Skip if already exists
    if (fs.existsSync(filePath)) return safeName;

    try {
        const attachmentData = await getAttachment(accountId, msgId, attId);
        
        if (attachmentData?.data) {
            fs.writeFileSync(filePath, Buffer.from(attachmentData.data, 'base64'));
            console.log(`Saved attachment: ${safeName}`);
            return safeName;
        }
    } catch (e) {
        console.error(`Error saving attachment ${filename}:`, e);
    }
    
    return null;
}

function collectParts(payload: any): any[] {
    const parts: any[] = [];
    
    if (!payload) return parts;
    
    const traverse = (p: any) => {
        parts.push(p);
        if (p.parts && Array.isArray(p.parts)) {
            p.parts.forEach(traverse);
        }
    };
    
    traverse(payload);
    return parts;
}

async function processThread(
    accountId: string,
    threadId: string,
    syncDir: string,
    attachmentsDir: string
): Promise<void> {
    try {
        const thread = await getThreadDetails(accountId, threadId);
        const messages = thread.messages;

        if (!messages || messages.length === 0) {
            console.log(`Thread ${threadId} has no messages`);
            return;
        }

        // Subject from first message
        const firstHeaders = messages[0].payload?.headers || [];
        const subject = extractHeader(firstHeaders, 'Subject') || '(No Subject)';

        let mdContent = `# ${subject}\n\n`;
        mdContent += `**Thread ID:** ${threadId}\n`;
        mdContent += `**Message Count:** ${messages.length}\n\n---\n\n`;

        for (const msg of messages) {
            const msgId = msg.id;
            const headers = msg.payload?.headers || [];
            const from = extractHeader(headers, 'From');
            const date = extractHeader(headers, 'Date');

            mdContent += `### From: ${from}\n`;
            mdContent += `**Date:** ${date}\n\n`;

            if (msg.payload) {
                const body = getBodyFromPayload(msg.payload);
                mdContent += `${body}\n\n`;
            }

            // Handle attachments
            const parts = collectParts(msg.payload);
            let attachmentsFound = false;
            
            for (const part of parts) {
                if (part.filename && part.body?.attachmentId) {
                    const savedName = await saveAttachment(accountId, msgId, part, attachmentsDir);
                    if (savedName) {
                        if (!attachmentsFound) {
                            mdContent += "**Attachments:**\n";
                            attachmentsFound = true;
                        }
                        mdContent += `- [${part.filename}](attachments/${savedName})\n`;
                    }
                }
            }
            
            mdContent += "\n---\n\n";
        }

        fs.writeFileSync(path.join(syncDir, `${threadId}.md`), mdContent);
        console.log(`Synced Thread: ${subject} (${threadId})`);

    } catch (error) {
        console.error(`Error processing thread ${threadId}:`, error);
    }
}

// --- Sync Logic ---

async function performSync() {
    const ATTACHMENTS_DIR = path.join(SYNC_DIR, 'attachments');
    const STATE_FILE = path.join(SYNC_DIR, 'sync_state.json');

    // Ensure directories exist
    if (!fs.existsSync(SYNC_DIR)) fs.mkdirSync(SYNC_DIR, { recursive: true });
    if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

    // Check if Gmail is connected via Composio
    const account = composioAccountsRepo.getAccount('gmail');
    if (!account || account.status !== 'ACTIVE') {
        console.log('[Gmail Composio] Gmail not connected via Composio. Skipping sync.');
        return;
    }

    let run: ServiceRunContext | null = null;
    const ensureRun = async () => {
        if (!run) {
            run = await serviceLogger.startRun({
                service: 'gmail',
                message: 'Syncing Gmail (Composio)',
                trigger: 'timer',
            });
        }
    };

    try {
        console.log('[Gmail Composio] Starting sync...');

        // Load state to check last sync time
        const state = loadState(STATE_FILE);

        // Calculate date query
        let dateQuery: string;
        let isIncrementalSync = false;

        if (state.lastSyncTime) {
            // Incremental sync: Only get threads after last sync (with 1 hour buffer for safety)
            const lastSync = new Date(state.lastSyncTime);
            lastSync.setHours(lastSync.getHours() - 1); // 1 hour buffer
            dateQuery = lastSync.toISOString().split('T')[0].replace(/-/g, '/');
            isIncrementalSync = true;
            console.log(`[Gmail Composio] Incremental sync from ${dateQuery}`);
        } else {
            // First sync: Get last 30 days
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - LOOKBACK_DAYS);
            dateQuery = pastDate.toISOString().split('T')[0].replace(/-/g, '/');
            console.log(`[Gmail Composio] Full sync (last ${LOOKBACK_DAYS} days)`);
        }

        // List threads
        const threads = await listThreads(account.id, dateQuery);

        if (threads.length === 0) {
            console.log('[Gmail Composio] No new threads found.');
            saveState({ lastSyncTime: new Date().toISOString() }, STATE_FILE);
            return;
        }

        console.log(`[Gmail Composio] Found ${threads.length} threads to check`);

        // Filter threads: skip if file exists and is recent
        let newCount = 0;
        let skippedCount = 0;
        const processedThreadIds: string[] = [];
        const ONE_HOUR_MS = 60 * 60 * 1000;

        for (const thread of threads) {
            if (!thread.id) continue;

            const filePath = path.join(SYNC_DIR, `${thread.id}.md`);

            // Check if file exists and is recent (< 1 hour old)
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const fileAge = Date.now() - stats.mtimeMs;

                if (fileAge < ONE_HOUR_MS) {
                    // File is recent, skip
                    skippedCount++;
                    continue;
                }
                // File is old (> 1 hour), re-sync in case thread was updated
            }

            // Process thread (new or updated)
            await processThread(account.id, thread.id, SYNC_DIR, ATTACHMENTS_DIR);
            processedThreadIds.push(thread.id);
            newCount++;
        }

        console.log(`[Gmail Composio] Synced ${newCount} threads, skipped ${skippedCount} existing`);

        // Only log if there were actual changes
        if (newCount > 0) {
            await ensureRun();
            const limitedThreads = limitEventItems(processedThreadIds);

            await serviceLogger.log({
                type: 'changes_identified',
                service: run!.service,
                runId: run!.runId,
                level: 'info',
                message: `Synced ${newCount} new thread${newCount === 1 ? '' : 's'}, skipped ${skippedCount} existing`,
                counts: { new: newCount, skipped: skippedCount },
                items: limitedThreads.items,
                truncated: limitedThreads.truncated,
            });

            await serviceLogger.log({
                type: 'run_complete',
                service: run!.service,
                runId: run!.runId,
                level: 'info',
                message: `Gmail sync complete: ${newCount} new, ${skippedCount} skipped`,
                durationMs: Date.now() - run!.startedAt,
                outcome: 'ok',
                summary: { new: newCount, skipped: skippedCount },
            });
        }

        // Save current time as last sync
        saveState({ lastSyncTime: new Date().toISOString() }, STATE_FILE);

        console.log('[Gmail Composio] Sync completed.');

    } catch (error) {
        console.error('[Gmail Composio] Error during sync:', error);
        
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

// --- Background Service ---

let isRunning = false;

export const gmailSyncService: BackgroundService = {
    name: 'GmailSyncComposio',
    async start(): Promise<void> {
        if (isRunning) return;
        isRunning = true;

        console.log('[Gmail Composio] Starting Gmail Sync (Composio)...');
        console.log(`[Gmail Composio] Will sync every ${SYNC_INTERVAL_MS / 1000} seconds.`);

        // Initial small delay to let other things boot up
        await new Promise(r => setTimeout(r, 1000));

        // Start background loop
        (async () => {
            while (isRunning) {
                try {
                    await performSync();
                } catch (error) {
                    console.error('[Gmail Composio] Error in main loop:', error);
                }

                if (!isRunning) break;
                
                console.log(`[Gmail Composio] Sleeping for ${SYNC_INTERVAL_MS / 1000} seconds...`);
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
