import { app, BrowserWindow, shell } from 'electron';
import { createRequire } from 'node:module';
import type { IPCChannels } from '@flazz/shared/dist/ipc.js';

const require = createRequire(import.meta.url);

type ProgressInfo = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

type UpdateDownloadedEvent = {
  version: string;
};

type UpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: () => void;
};

const electronUpdater = require('electron-updater') as { autoUpdater: UpdaterLike };
const { autoUpdater } = electronUpdater;

const RELEASES_URL = 'https://api.github.com/repos/vincerevu/flazz/releases/latest';

type UpdateStatus = IPCChannels['app:getUpdateStatus']['res'];
type UpdateCheckResult = IPCChannels['app:checkForUpdates']['res'];

type GitHubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
};

let initialized = false;

let updateStatus: UpdateStatus = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseUrl: null,
  downloadUrl: null,
  checkedAt: null,
  progressPercent: null,
  transferredBytes: null,
  totalBytes: null,
  bytesPerSecond: null,
  message: null,
  autoUpdateSupported: false,
};

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').split('-')[0] ?? version.trim();
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function matchesCurrentArch(name: string): boolean {
  const normalized = name.toLowerCase();
  if (process.arch === 'arm64') {
    return normalized.includes('arm64') || normalized.includes('aarch64');
  }
  if (process.arch === 'x64') {
    return normalized.includes('x64') || normalized.includes('amd64');
  }
  return true;
}

function selectPreferredAsset(assets: GitHubReleaseAsset[]): string | null {
  const validAssets = assets.filter((asset) => asset.name && asset.browser_download_url) as Array<Required<GitHubReleaseAsset>>;
  const matchingArchAssets = validAssets.filter((asset) => matchesCurrentArch(asset.name));
  const pool = matchingArchAssets.length > 0 ? matchingArchAssets : validAssets;

  const pick = (predicate: (asset: Required<GitHubReleaseAsset>) => boolean) =>
    pool.find(predicate)?.browser_download_url ?? null;

  if (process.platform === 'win32') {
    return pick((asset) => asset.name.endsWith('.exe')) ?? pick((asset) => asset.name.endsWith('.zip')) ?? null;
  }

  if (process.platform === 'darwin') {
    return pick((asset) => asset.name.endsWith('.dmg')) ?? pick((asset) => asset.name.endsWith('.zip')) ?? null;
  }

  return (
    pick((asset) => asset.name.endsWith('.deb')) ??
    pick((asset) => asset.name.endsWith('.rpm')) ??
    pick((asset) => asset.name.endsWith('.zip')) ??
    null
  );
}

function isAutoUpdateSupported(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === 'darwin') return false;
  return process.platform === 'win32' || process.platform === 'linux';
}

function emitUpdateStatus(): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send('app:updateStatusChanged', updateStatus);
    }
  }
}

function setUpdateStatus(next: Partial<UpdateStatus>): void {
  updateStatus = {
    ...updateStatus,
    ...next,
    currentVersion: app.getVersion(),
    autoUpdateSupported: isAutoUpdateSupported(),
  };
  emitUpdateStatus();
}

function applyProgress(progress: ProgressInfo): void {
  setUpdateStatus({
    status: 'downloading',
    progressPercent: progress.percent,
    transferredBytes: progress.transferred,
    totalBytes: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
    message: 'Downloading update…',
  });
}

function applyDownloaded(event: UpdateDownloadedEvent): void {
  setUpdateStatus({
    status: 'downloaded',
    latestVersion: event.version,
    message: 'Update downloaded. Restart Flazz to install.',
    progressPercent: 100,
  });
}

export function initializeUpdater(): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({
      status: 'checking',
      checkedAt: new Date().toISOString(),
      message: 'Checking for updates…',
      progressPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    applyProgress(progress as ProgressInfo);
  });

  autoUpdater.on('update-downloaded', (event) => {
    applyDownloaded(event as UpdateDownloadedEvent);
  });

  autoUpdater.on('error', (error) => {
    setUpdateStatus({
      status: 'error',
      message: error == null ? 'Auto-update failed.' : String(error),
    });
  });
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Flazz/${app.getVersion()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status})`);
  }

  return await response.json() as GitHubRelease;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const checkedAt = new Date().toISOString();

  try {
    const release = await fetchLatestRelease();
    const latestVersion = release.tag_name ? normalizeVersion(release.tag_name) : null;
    const updateAvailable = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
    const releaseUrl = release.html_url ?? null;
    const downloadUrl = Array.isArray(release.assets) ? selectPreferredAsset(release.assets) : null;

    setUpdateStatus({
      status: updateAvailable ? 'available' : 'not-available',
      latestVersion,
      releaseUrl,
      downloadUrl,
      checkedAt,
      progressPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      message: updateAvailable
        ? `Flazz ${latestVersion} is available.`
        : 'You already have the latest version.',
    });

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl,
      downloadUrl,
      publishedAt: release.published_at ?? null,
      checkedAt,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check for updates';
    setUpdateStatus({
      status: 'error',
      checkedAt,
      message,
    });
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      downloadUrl: null,
      publishedAt: null,
      checkedAt,
      error: message,
    };
  }
}

export function getUpdateStatus(): UpdateStatus {
  return {
    ...updateStatus,
    currentVersion: app.getVersion(),
    autoUpdateSupported: isAutoUpdateSupported(),
  };
}

export async function performUpdate(): Promise<IPCChannels['app:performUpdate']['res']> {
  const targetUrl = updateStatus.downloadUrl ?? updateStatus.releaseUrl;

  if (updateStatus.status === 'downloaded') {
    autoUpdater.quitAndInstall();
    return {
      started: true,
      fallback: false,
      status: 'downloaded',
      message: 'Restarting to install the update…',
    };
  }

  if (!isAutoUpdateSupported()) {
    if (targetUrl) {
      await shell.openExternal(targetUrl);
      return {
        started: true,
        fallback: true,
        status: updateStatus.status,
        message: 'Opened the latest download in your browser.',
      };
    }

    return {
      started: false,
      fallback: true,
      status: updateStatus.status,
      message: 'No update link is available yet.',
    };
  }

  if (updateStatus.status !== 'available') {
    const result = await checkForUpdates();
    if (!result.updateAvailable) {
      if (result.downloadUrl ?? result.releaseUrl) {
        await shell.openExternal(result.downloadUrl ?? result.releaseUrl!);
        return {
          started: true,
          fallback: true,
          status: updateStatus.status,
          message: 'Opened the latest download in your browser.',
        };
      }

      return {
        started: false,
        fallback: false,
        status: updateStatus.status,
        message: result.error ?? 'No update is available right now.',
      };
    }
  }

  setUpdateStatus({
    status: 'downloading',
    message: 'Downloading update…',
    progressPercent: 0,
    transferredBytes: 0,
    totalBytes: null,
    bytesPerSecond: null,
  });

  try {
    await autoUpdater.downloadUpdate();
    return {
      started: true,
      fallback: false,
      status: 'downloading',
      message: 'Downloading update…',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download update';
    setUpdateStatus({
      status: 'error',
      message,
    });

    if (targetUrl) {
      await shell.openExternal(targetUrl);
      return {
        started: true,
        fallback: true,
        status: 'error',
        message: 'Auto-update failed, so the latest download was opened in your browser.',
      };
    }

    return {
      started: false,
      fallback: false,
      status: 'error',
      message,
    };
  }
}
