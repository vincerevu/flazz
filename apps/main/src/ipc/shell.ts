import { shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { WorkDir } from '@flazz/core/dist/config/config.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerShellHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['shell:openPath'] = async (_event, args) => {
    let filePath = args.path;
    if (filePath.startsWith('~')) {
      filePath = path.join(os.homedir(), filePath.slice(1));
    } else if (!path.isAbsolute(filePath)) {
      // Workspace-relative path — resolve against the Flazz workspace
      filePath = path.join(WorkDir, filePath);
    }
    const error = await shell.openPath(filePath);
    return { error: error || undefined };
  };

  handlers['shell:readFileBase64'] = async (_event, args) => {
    let filePath = args.path;
    if (filePath.startsWith('~')) {
      filePath = path.join(os.homedir(), filePath.slice(1));
    } else if (!path.isAbsolute(filePath)) {
      // Workspace-relative path — resolve against the Flazz workspace
      filePath = path.join(WorkDir, filePath);
    }
    const stat = await fs.stat(filePath);
    if (stat.size > 10 * 1024 * 1024) {
      throw new Error('File too large (>10MB)');
    }
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp', '.ico': 'image/x-icon',
      '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac',
      '.pdf': 'application/pdf', '.json': 'application/json',
      '.txt': 'text/plain', '.md': 'text/markdown',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    return { data: buffer.toString('base64'), mimeType, size: stat.size };
  };
}
