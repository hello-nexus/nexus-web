import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postServiceForm = vi.fn();
const postService = vi.fn();
const pingService = vi.fn();
vi.mock('../../../api/service', () => ({
  postServiceForm: (...a: unknown[]) => postServiceForm(...a),
  postService: (...a: unknown[]) => postService(...a),
  pingService: (...a: unknown[]) => pingService(...a),
}));

import { TransferWidget } from './TransferWidget';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { NATIVE_TRANSFER_STATE_EVENT, type NativeTransferState } from '../../device/panelNativeBridge';
import { TRANSFER_CLIPBOARD_PATH, TRANSFER_ITEMS_PATH } from '../../../api/transfer';
import type { PanelWidget } from '../../types';

type BridgeWindow = Window & { nexusNative?: { transferFiles?: () => void; sendClipboard?: () => void } };

const widget: PanelWidget = { id: 'w1', type: 'transfer', size: '2x2', col: 0, row: 0 };

function emitTransferState(detail: NativeTransferState) {
  act(() => {
    window.dispatchEvent(new CustomEvent(NATIVE_TRANSFER_STATE_EVENT, { detail }));
  });
}

describe('TransferWidget', () => {
  beforeEach(() => {
    postServiceForm.mockReset().mockResolvedValue({ saved: [{ name: 'a.jpg', size: 1 }], inbox: 'X' });
    postService.mockReset().mockResolvedValue({ error: false, msg: '' });
    pingService.mockReset().mockResolvedValue({ machineName: 'Test-PC' });
  });

  afterEach(() => {
    delete (window as BridgeWindow).nexusNative;
    vi.useRealTimers();
  });

  it('renders the two action buttons and the idle status with the machine name', async () => {
    render(<TransferWidget widget={widget} />);
    expect(screen.getByText('transfer.photo')).toBeTruthy();
    expect(screen.getByText('transfer.clipboard')).toBeTruthy();
    // Default i18n context returns the key; the machine name only feeds the
    // {name} param, so the resolved ping surfaces as the sendTo key.
    await waitFor(() => expect(screen.getByText('transfer.sendTo')).toBeTruthy());
  });

  it('invokes the native bridge when present and renders no file input', () => {
    const transferFiles = vi.fn();
    const sendClipboard = vi.fn();
    (window as BridgeWindow).nexusNative = { transferFiles, sendClipboard };
    const { container } = render(<TransferWidget widget={widget} />);

    fireEvent.click(screen.getByText('transfer.photo'));
    expect(transferFiles).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('transfer.clipboard'));
    expect(sendClipboard).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(postServiceForm).not.toHaveBeenCalled();
    expect(postService).not.toHaveBeenCalled();
  });

  it('drives the status line from nexus:transfer-state events and resets to idle', async () => {
    (window as BridgeWindow).nexusNative = { transferFiles: vi.fn(), sendClipboard: vi.fn() };
    render(<TransferWidget widget={widget} />);

    emitTransferState({ phase: 'uploading', kind: 'file', count: 2 });
    expect(screen.getByText('transfer.sending')).toBeTruthy();

    vi.useFakeTimers();
    emitTransferState({ phase: 'done', kind: 'file', count: 2 });
    expect(screen.getByText('transfer.sent')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('transfer.sent')).toBeNull();

    emitTransferState({ phase: 'error', kind: 'clipboard', message: 'boom' });
    expect(screen.getByText('transfer.failed')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('transfer.failed')).toBeNull();

    emitTransferState({ phase: 'uploading', kind: 'file' });
    emitTransferState({ phase: 'cancelled', kind: 'file' });
    expect(screen.queryByText('transfer.sending')).toBeNull();
  });

  it('uploads picked files through the hidden input when no bridge exists', async () => {
    const { container } = render(<TransferWidget widget={widget} />);
    fireEvent.click(screen.getByText('transfer.photo'));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(postServiceForm).toHaveBeenCalledTimes(1));
    const [path, form] = postServiceForm.mock.calls[0] as [string, FormData];
    expect(path).toBe(TRANSFER_ITEMS_PATH);
    expect(form.getAll('files')).toHaveLength(1);
    expect((form.get('files') as File).name).toBe('photo.jpg');
    await waitFor(() => expect(screen.getByText('transfer.sent')).toBeTruthy());
  });

  it('shows failed when the upload helper returns null', async () => {
    postServiceForm.mockResolvedValue(null);
    const { container } = render(<TransferWidget widget={widget} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'x.png')] } });
    await waitFor(() => expect(screen.getByText('transfer.failed')).toBeTruthy());
  });

  it('falls back to the paste box without bridge or clipboard API and posts the text', async () => {
    // jsdom has no navigator.clipboard, so the clipboard button opens the box.
    render(<TransferWidget widget={widget} />);
    fireEvent.click(screen.getByText('transfer.clipboard'));

    const textarea = screen.getByPlaceholderText('transfer.pasteText') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello pc' } });
    fireEvent.click(screen.getByText('transfer.send'));

    await waitFor(() => expect(postService).toHaveBeenCalledWith(TRANSFER_CLIPBOARD_PATH, { text: 'hello pc' }));
    await waitFor(() => expect(screen.getByText('transfer.sent')).toBeTruthy());
  });

  it('renders a static idle state in preview mode with no I/O', () => {
    const { container } = render(
      <PanelPreviewProvider value={true}>
        <TransferWidget widget={widget} />
      </PanelPreviewProvider>,
    );
    expect(pingService).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByText('transfer.photo'));
    fireEvent.click(screen.getByText('transfer.clipboard'));
    expect(postServiceForm).not.toHaveBeenCalled();
    expect(postService).not.toHaveBeenCalled();
    expect(screen.getByText('transfer.sendTo')).toBeTruthy();
  });
});
