import { BrowserWindow } from 'electron';
import { isOnboardingComplete, markOnboardingComplete } from '@flazz/core/dist/config/note_creation_config.js';
import type { InvokeHandlers } from '../ipc.js';
import type { IPCChannels } from '@flazz/shared/dist/ipc.js';

export function getVersions(): {
  chrome: string;
  node: string;
  electron: string;
} {
  return {
    chrome: process.versions.chrome,
    node: process.versions.node,
    electron: process.versions.electron,
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
