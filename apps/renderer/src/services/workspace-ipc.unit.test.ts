import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspaceIpc } from './workspace-ipc.js';

describe('workspaceIpc', () => {
  beforeEach(() => {
    // Mock window.ipc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ipc = {
      invoke: vi.fn(),
      on: vi.fn(),
    };
  });

  it('calls workspace:readdir with correct payload', () => {
    workspaceIpc.readdir('test/path', { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).ipc.invoke).toHaveBeenCalledWith('workspace:readdir', {
      path: 'test/path',
      opts: { recursive: true },
    });
  });

  it('calls workspace:readFile with correct payload', () => {
    workspaceIpc.readFile('test/file.txt', 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).ipc.invoke).toHaveBeenCalledWith('workspace:readFile', {
      path: 'test/file.txt',
      encoding: 'utf8',
    });
  });

  it('calls workspace:writeFile with correct payload', () => {
    workspaceIpc.writeFile('test/file.txt', 'data', { encoding: 'utf8' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).ipc.invoke).toHaveBeenCalledWith('workspace:writeFile', {
      path: 'test/file.txt',
      data: 'data',
      opts: { encoding: 'utf8' },
    });
  });

  it('calls workspace:exists with correct payload', () => {
    workspaceIpc.exists('test/file.txt');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).ipc.invoke).toHaveBeenCalledWith('workspace:exists', {
      path: 'test/file.txt',
    });
  });
});
