import { app as electronApp, BrowserWindow, shell } from 'electron';
import { isOnboardingComplete, markOnboardingComplete } from '@flazz/core/dist/config/note_creation_config.js';
import type { InvokeHandlers } from '../ipc.js';
import type { IPCChannels } from '@flazz/shared/dist/ipc.js';
import { setAttentionState } from '../attention-state.js';
import { checkForUpdates, getUpdateStatus, performUpdate } from '../updater.js';
import { getCurrentAppVersion } from '../version.js';

export function getVersions(): {
  app: string;
  chrome: string;
  node: string;
  electron: string;
  packaged: boolean;
} {
  return {
    app: getCurrentAppVersion(),
    chrome: process.versions.chrome,
    node: process.versions.node,
    electron: process.versions.electron,
    packaged: electronApp.isPackaged,
  };
}

export function getWindowState(win: BrowserWindow | null): IPCChannels['app:getWindowState']['res'] {
  return {
    isMaximized: win?.isMaximized() ?? false,
    isFullscreen: win?.isFullScreen() ?? false,
    platform: process.platform,
    supportsCustomTitlebar: process.platform !== 'darwin',
  };
}

export function getEventWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
}

export function registerAppHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['app:getVersions'] = async () => {
    // args is null for this channel (no request payload)
    return getVersions();
  };
  handlers['app:checkForUpdates'] = async () => {
    return checkForUpdates();
  };
  handlers['app:openUpdateUrl'] = async (_event, args) => {
    await shell.openExternal(args.url);
    return { success: true };
  };
  handlers['app:getUpdateStatus'] = async () => {
    return getUpdateStatus();
  };
  handlers['app:performUpdate'] = async () => {
    return performUpdate();
  };
  handlers['app:getWindowState'] = async (event) => {
    return getWindowState(getEventWindow(event));
  };
  handlers['app:minimizeWindow'] = async (event) => {
    getEventWindow(event)?.minimize();
    return { success: true };
  };
  handlers['app:toggleMaximizeWindow'] = async (event) => {
    const win = getEventWindow(event);
    if (!win) {
      return getWindowState(null);
    }

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }

    return getWindowState(win);
  };
  handlers['app:closeWindow'] = async (event) => {
    getEventWindow(event)?.close();
    return { success: true };
  };
  (handlers as Record<string, unknown>)['app:updateAttentionState'] = async (
    _event: Electron.IpcMainInvokeEvent,
    args: IPCChannels['app:updateAttentionState']['req']
  ) => {
    setAttentionState({
      activeRunId: args.activeRunId,
      isWindowFocused: args.isWindowFocused,
      isDocumentVisible: args.isDocumentVisible,
      notificationsEnabled: 'notificationsEnabled' in args ? Boolean(args.notificationsEnabled) : true,
    });
    return { success: true };
  };
  handlers['onboarding:getStatus'] = async () => {
    // Show onboarding if it hasn't been completed yet
    const complete = isOnboardingComplete();
    return { showOnboarding: !complete };
  };
  handlers['onboarding:markComplete'] = async () => {
    markOnboardingComplete();
    return { success: true };
  };
}
