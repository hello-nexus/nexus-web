import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postService = vi.fn();
vi.mock('../api/service', () => ({
  postService: (...a: unknown[]) => postService(...a),
  postServiceForm: vi.fn(),
}));

// Interpolation-aware t() so titles carry the frame's name/from/inbox.
vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { TransferToasts } from './TransferToasts';
import { ToastProvider } from '../components/common/Toast/Toast';
import { MultiplexContext, type MultiplexContextValue } from '../hooks/useMultiplexSocket';
import { SYSTEM_OPEN_PATH_PATH, TRANSFER_TOPIC, type TransferFrame } from '../api/transfer';

function renderWithMultiplex() {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const ctx = {
    subscribe: (topic: string, listener: (data: unknown) => void) => {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic)!.add(listener);
    },
    unsubscribe: (topic: string, listener: (data: unknown) => void) => {
      listeners.get(topic)?.delete(listener);
    },
    connected: true,
    transport: 'lan',
  } as unknown as MultiplexContextValue;

  const view = render(
    <MultiplexContext.Provider value={ctx}>
      <ToastProvider>
        <TransferToasts />
      </ToastProvider>
    </MultiplexContext.Provider>,
  );
  const emit = (frame: Partial<TransferFrame>) => {
    act(() => {
      for (const listener of listeners.get(TRANSFER_TOPIC) ?? []) listener(frame);
    });
  };
  return { ...view, emit };
}

const fileFrame: TransferFrame = {
  revision: 1,
  kind: 'file',
  name: 'IMG_001.jpg',
  size: 12345,
  from: 'iPhone',
  inbox: 'C:\\Users\\nicol\\Nexus Inbox',
};

describe('TransferToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    postService.mockReset().mockResolvedValue({ error: false, msg: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a file toast with name/from/inbox and auto-dismisses after 6s', () => {
    const { emit } = renderWithMultiplex();
    emit(fileFrame);

    expect(screen.getByText('transfer.toast.fileTitle name=IMG_001.jpg from=iPhone')).toBeTruthy();
    expect(screen.getByText(`transfer.toast.savedTo inbox=${fileFrame.inbox}`)).toBeTruthy();

    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByText('transfer.toast.fileTitle name=IMG_001.jpg from=iPhone')).toBeNull();
  });

  it('uses the generic phone word when from is empty', () => {
    const { emit } = renderWithMultiplex();
    emit({ ...fileFrame, from: '' });
    expect(screen.getByText('transfer.toast.fileTitle name=IMG_001.jpg from=transfer.fromPhone')).toBeTruthy();
  });

  it('shows a clipboard toast without an open-folder action', () => {
    const { emit } = renderWithMultiplex();
    emit({ revision: 2, kind: 'clipboard', name: '', size: 0, from: 'iPhone', inbox: '' });
    expect(screen.getByText('transfer.toast.clipboardTitle from=iPhone')).toBeTruthy();
    expect(screen.getByText('transfer.toast.clipboardBody')).toBeTruthy();
    expect(screen.queryByText('transfer.toast.openFolder')).toBeNull();
  });

  it('opens the inbox folder via /system/open-path and dismisses on action click', () => {
    const { emit } = renderWithMultiplex();
    emit(fileFrame);

    fireEvent.click(screen.getByText('transfer.toast.openFolder'));
    expect(postService).toHaveBeenCalledWith(SYSTEM_OPEN_PATH_PATH, { path: fileFrame.inbox });
    expect(screen.queryByText('transfer.toast.openFolder')).toBeNull();
  });

  it('dismisses a toast on click anywhere on it', () => {
    const { emit } = renderWithMultiplex();
    emit(fileFrame);
    fireEvent.click(screen.getByRole('status'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores malformed frames', () => {
    const { emit } = renderWithMultiplex();
    emit({} as TransferFrame);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
