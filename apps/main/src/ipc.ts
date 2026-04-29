import type { BackgroundService } from "@flazz/core/dist/services/background_service.js";
import { ipcMain, BrowserWindow } from 'electron';
import { ipc } from '@flazz/shared';
import { triggerGmailSyncNow, triggerGoogleMeetSyncNow, triggerGraphSyncNow, watcher as watcherCore, workspace } from '@flazz/core/dist/index.js';
import { workspace as workspaceShared } from '@flazz/shared';
import { bus } from '@flazz/core/dist/runs/bus.js';
import { serviceBus } from '@flazz/core/dist/services/service_bus.js';
import type { FSWatcher } from 'chokidar';
import fs from 'node:fs/promises';
import z from 'zod';
import { RunEvent } from '@flazz/shared';
import { ServiceEvent } from '@flazz/shared';
import { versionHistory } from '@flazz/core';
import {
  registerWorkspaceHandlers,
  registerShellHandlers,
  registerRunsHandlers,
  registerModelsHandlers,
  registerSearchHandlers,
  registerAuthHandlers,
  registerIntegrationHandlers,
  registerIntegrationResourceHandlers,
  registerScheduleHandlers,
  registerMemoryHandlers,
  registerAppHandlers,
  registerSkillsHandlers,
  registerRunMemoryHandlers,
  registerPresentationHandlers,
} from './ipc/index.js';
import { getWindowState } from './ipc/app.js';

type InvokeChannels = ipc.InvokeChannels;
type IPCChannels = ipc.IPCChannels;

/**
 * Type-safe handler function for invoke channels
 */
type InvokeHandler<K extends InvokeChannels> = (
  event: Electron.IpcMainInvokeEvent,
  args: IPCChannels[K]['req']
) => IPCChannels[K]['res'] | Promise<IPCChannels[K]['res']>;

/**
 * Type-safe handler registration map
 * Ensures all invoke channels have handlers
 */
export type InvokeHandlers = {
  [K in InvokeChannels]: InvokeHandler<K>;
};

/**
 * Register all IPC handlers with type safety and runtime validation
 * 
 * This function ensures:
 * 1. All invoke channels have handlers (exhaustiveness checking)
 * 2. Handler signatures match channel definitions
 * 3. Request/response payloads are validated at runtime
 * 4. Errors are caught and returned as error responses
 */
export function registerIpcHandlers(handlers: InvokeHandlers) {
  // Register each handler with runtime validation
  for (const [channel, handler] of Object.entries(handlers) as [
    InvokeChannels,
    InvokeHandler<InvokeChannels>
  ][]) {
    ipcMain.handle(channel, async (event, rawArgs) => {
      try {
        // Validate request payload
        const args = ipc.validateRequest(channel, rawArgs);
        
        // Call handler
        const result = await handler(event, args);
        
        // Validate response payload
        return ipc.validateResponse(channel, result);
      } catch (error) {
        console.error(`[IPC] Error in handler '${channel}':`, error);
        // Return error response instead of throwing
        // This prevents the IPC call from failing completely
        throw error;
      }
    });
  }
}

// ============================================================================
// Electron-Specific Utilities
// ============================================================================

export function emitWindowStateChanged(win: BrowserWindow): void {
  if (win.isDestroyed() || !win.webContents) {
    return;
  }

  win.webContents.send('app:windowStateChanged', getWindowState(win));
}

// ============================================================================
// Workspace Watcher (with debouncing and lifecycle management)
// ============================================================================

let watcher: FSWatcher | null = null;
const changeQueue = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Emit memory commit event to all renderer windows
 */
function emitMemoryCommitEvent(): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send('memory:didCommit', {});
    }
  }
}

/**
 * Emit workspace change event to all renderer windows
 */
function emitWorkspaceChangeEvent(event: z.infer<typeof workspaceShared.WorkspaceChangeEvent>): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send('workspace:didChange', event);
    }
  }
}

/**
 * Process queued changes and emit events (debounced)
 */
function processChangeQueue(): void {
  if (changeQueue.size === 0) {
    return;
  }

  const paths = Array.from(changeQueue);
  changeQueue.clear();

  if (paths.length === 1) {
    // For single path, try to determine kind from file stats
    const relPath = paths[0]!;
    try {
      const absPath = workspace.resolveWorkspacePath(relPath);
      fs.lstat(absPath)
        .then((stats) => {
          const kind = stats.isDirectory() ? 'dir' : 'file';
          emitWorkspaceChangeEvent({ type: 'changed', path: relPath, kind });
        })
        .catch(() => {
          // File no longer exists (edge case), emit without kind
          emitWorkspaceChangeEvent({ type: 'changed', path: relPath });
        });
    } catch {
      // Invalid path, ignore
    }
  } else {
    // Emit bulkChanged for multiple paths
    emitWorkspaceChangeEvent({ type: 'bulkChanged', paths });
  }
}

/**
 * Queue a path change for debounced emission
 */
function queueChange(relPath: string): void {
  changeQueue.add(relPath);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    processChangeQueue();
    debounceTimer = null;
  }, 150); // 150ms debounce
}

/**
 * Handle workspace change event from core watcher
 */
function handleWorkspaceChange(event: z.infer<typeof workspaceShared.WorkspaceChangeEvent>): void {
  // Debounce 'changed' events, emit others immediately
  if (event.type === 'changed' && event.path) {
    queueChange(event.path);
  } else {
    emitWorkspaceChangeEvent(event);
  }
}

/**
 * Start workspace watcher
 * Watches the Flazz workspace recursively and emits change events to renderer
 * 
 * This should be called once when the app starts (from main.ts).
 * The watcher runs as a main-process service and catches ALL filesystem changes
 * (both from IPC handlers and external changes like terminal/git).
 * 
 * Safe to call multiple times - guards against duplicate watchers.
 */
async function startWorkspaceWatcher(): Promise<void> {
  if (watcher) {
    // Watcher already running - safe to ignore subsequent calls
    return;
  }

  watcher = await watcherCore.createWorkspaceWatcher(handleWorkspaceChange);
}

/**
 * Stop workspace watcher
 */
function stopWorkspaceWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  changeQueue.clear();
}

function emitRunEvent(event: z.infer<typeof RunEvent>): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send('runs:events', event);
    }
  }
}

function emitServiceEvent(event: z.infer<typeof ServiceEvent>): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send('services:events', event);
    }
  }
}

export function emitOAuthEvent(event: { provider: string; success: boolean; error?: string }): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send('oauth:didConnect', event);
    }
  }
}

export function emitNotificationActivated(event: { runId: string }): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send('app:notificationActivated', event);
    }
  }
}

let runsWatcher: (() => void) | null = null;
async function startRunsWatcher(): Promise<void> {
  if (runsWatcher) {
    return;
  }
  runsWatcher = await bus.subscribe('*', async (event) => {
    emitRunEvent(event);
  });
}

let servicesWatcher: (() => void) | null = null;
async function startServicesWatcher(): Promise<void> {
  if (servicesWatcher) {
    return;
  }
  servicesWatcher = await serviceBus.subscribe(async (event) => {
    emitServiceEvent(event);
  });
}

function stopRunsWatcher(): void {
  if (runsWatcher) {
    runsWatcher();
    runsWatcher = null;
  }
}

function stopServicesWatcher(): void {
  if (servicesWatcher) {
    servicesWatcher();
    servicesWatcher = null;
  }
}

// ============================================================================
// Handler Implementations
// ============================================================================

/**
 * Register all IPC handlers
 * Add new handlers here as you add channels to IPCChannels
 */
export function setupIpcHandlers() {
  // Forward memory commit events to renderer for panel refresh
  versionHistory.onCommit(() => emitMemoryCommitEvent());

  const handlers: Partial<InvokeHandlers> = {};

  registerAppHandlers(handlers);
  registerWorkspaceHandlers(handlers);
  registerShellHandlers(handlers);
  registerRunsHandlers(handlers);
  registerModelsHandlers(handlers);
  registerSearchHandlers(handlers);
  registerAuthHandlers(handlers);
  registerIntegrationHandlers(handlers);
  registerIntegrationResourceHandlers(handlers);
  registerScheduleHandlers(handlers);
  registerMemoryHandlers(handlers);
  registerSkillsHandlers(handlers);
  registerRunMemoryHandlers(handlers);
  registerPresentationHandlers(handlers);

  handlers['services:triggerGraphSync'] = async (_event, args) => {
    const [graphResult, gmailResult, googleMeetResult] = await Promise.all([
      triggerGraphSyncNow({ force: args.force ?? true }),
      triggerGmailSyncNow(),
      triggerGoogleMeetSyncNow(),
    ]);
    if (!graphResult.success) {
      return {
        success: false,
        error: graphResult.error,
      };
    }
    if (!gmailResult.success) {
      return {
        success: false,
        error: gmailResult.error,
      };
    }
    if (!googleMeetResult.success) {
      return {
        success: false,
        error: googleMeetResult.error,
      };
    }
    return {
      success: true,
    };
  };

  registerIpcHandlers(handlers as InvokeHandlers);
}


export const workspaceWatcherService: BackgroundService = {
    name: 'WorkspaceWatcher',
    async start(): Promise<void> {
        await startWorkspaceWatcher();
    },
    async stop(): Promise<void> {
        stopWorkspaceWatcher();
    }
};

export const runsWatcherService: BackgroundService = {
    name: 'RunsWatcher',
    async start(): Promise<void> {
        await startRunsWatcher();
    },
    async stop(): Promise<void> {
        stopRunsWatcher();
    }
};

export const servicesWatcherService: BackgroundService = {
    name: 'ServicesWatcher',
    async start(): Promise<void> {
        await startServicesWatcher();
    },
    async stop(): Promise<void> {
        stopServicesWatcher();
    }
};
