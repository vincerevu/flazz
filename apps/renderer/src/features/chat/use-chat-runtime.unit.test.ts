import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatRuntime } from './use-chat-runtime.js';
import { runsIpc } from '../../services/runs-ipc.js';

vi.mock('../../services/runs-ipc', () => ({
  runsIpc: {
    list: vi.fn(),
    fetch: vi.fn(),
    create: vi.fn(),
    createMessage: vi.fn(),
    stop: vi.fn(),
    delete: vi.fn(),
    authorizePermission: vi.fn(),
    provideHumanInput: vi.fn(),
    onEvents: vi.fn(),
  },
}));

vi.mock('../../services/workspace-ipc', () => ({
  workspaceIpc: {
    readFile: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('useChatRuntime', () => {
  const agentId = 'test-agent';
  const onActiveTabRunIdChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runsIpc.list as any).mockResolvedValue({ runs: [], nextCursor: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runsIpc.onEvents as any).mockReturnValue(() => {}); // Return a dummy cleanup function
  });

  it('hydrates run events correctly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let eventHandler: ((event: any) => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (runsIpc.onEvents as any).mockImplementation((handler: any) => {
      eventHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() =>
      useChatRuntime({ agentId, onActiveTabRunIdChange })
    );

    // Initial state
    expect(result.current.isProcessing).toBe(false);

    if (eventHandler) {
      await act(async () => {
        result.current.restoreChatRuntime({
          runId: 'run-1',
          conversation: [],
          currentAssistantMessage: '',
          allPermissionRequests: new Map(),
          permissionResponses: new Map(),
          pendingAskHumanRequests: new Map()
        }, 'run-1');
      });

      await act(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (eventHandler as any)({
          type: 'run-processing-start',
          runId: 'run-1',
          timestamp: Date.now(),
        });
      });
      expect(result.current.processingRunIds.has('run-1')).toBe(true);

      await act(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (eventHandler as any)({
          type: 'run-processing-end',
          runId: 'run-1',
        });
      });
      expect(result.current.processingRunIds.has('run-1')).toBe(false);
    }
  });
});
