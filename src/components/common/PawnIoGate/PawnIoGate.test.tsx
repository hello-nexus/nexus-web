import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PawnIoState, PawnIoStatus } from '../../../api/pawnio';
import type { PawnIoPhase } from './gateLogic';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fixPawnIo = vi.fn();
const restartPcForPawnIo = vi.fn();
const fetchPawnIoStatus = vi.fn();
vi.mock('../../../api/pawnio', () => ({
  fixPawnIo: (...args: unknown[]) => fixPawnIo(...args),
  restartPcForPawnIo: (...args: unknown[]) => restartPcForPawnIo(...args),
  fetchPawnIoStatus: (...args: unknown[]) => fetchPawnIoStatus(...args),
}));
const downloadSupportBundle = vi.fn();
vi.mock('../../../api/diagnostics', () => ({
  downloadSupportBundle: (...args: unknown[]) => downloadSupportBundle(...args),
}));

import { PawnIoGate } from './PawnIoGate';

function status(state: PawnIoState): PawnIoStatus {
  return { installed: true, open: false, state, errorCode: null, fixAction: 'none', fixing: false };
}

function renderGate(state: PawnIoState, over: { phase?: PawnIoPhase; preview?: boolean } = {}) {
  const props = { onStatus: vi.fn(), onFixed: vi.fn(), onContinue: vi.fn() };
  render(<PawnIoGate status={status(state)} initialPhase={over.phase} preview={over.preview} {...props} />);
  return props;
}

beforeEach(() => {
  fixPawnIo.mockReset();
  restartPcForPawnIo.mockReset();
  fetchPawnIoStatus.mockReset();
  downloadSupportBundle.mockReset();
});

describe('PawnIoGate screens', () => {
  it.each(['notInstalled', 'installFailed'] as const)('%s offers Install driver', state => {
    renderGate(state);
    expect(screen.getByRole('button', { name: 'pawnioGate.install.button' })).toBeTruthy();
    expect(screen.queryByText('pawnioGate.install.permission')).toBeNull();
  });

  it('permissionDeclined adds the permission note', () => {
    renderGate('permissionDeclined');
    expect(screen.getByText('pawnioGate.install.permission')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'pawnioGate.install.button' })).toBeTruthy();
  });

  it('restartRequired offers Restart PC and a later link', () => {
    renderGate('restartRequired');
    expect(screen.getByRole('button', { name: 'pawnioGate.restart.button' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'pawnioGate.restart.later' }));
    expect(screen.getByText('pawnioGate.restart.laterBody')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'pawnioGate.restart.later' })).toBeNull();
  });

  it('notRunning offers Fix driver', () => {
    renderGate('notRunning');
    expect(screen.getByRole('button', { name: 'pawnioGate.notRunning.button' })).toBeTruthy();
  });

  it('blocked has no fix button, only Check again and the support bundle', () => {
    renderGate('blocked');
    expect(screen.queryByRole('button', { name: 'pawnioGate.notRunning.button' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'pawnioGate.install.button' })).toBeNull();
    expect(screen.getByRole('button', { name: 'pawnioGate.blocked.check' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'settings.diagnostics.supportBundleButton' })).toBeTruthy();
  });

  it('a failed fix shows the three steps with Restart PC and the support bundle', async () => {
    fixPawnIo.mockResolvedValue(status('notRunning'));
    renderGate('notRunning');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'pawnioGate.notRunning.button' })); });
    expect(screen.getByText('pawnioGate.steps.title')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'pawnioGate.restart.button' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'settings.diagnostics.supportBundleButton' })).toBeTruthy();
  });

  it('the support bundle runs the real export and reports a failure inline', async () => {
    downloadSupportBundle.mockResolvedValue(false);
    renderGate('blocked');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'settings.diagnostics.supportBundleButton' })); });
    expect(downloadSupportBundle).toHaveBeenCalledTimes(1);
    expect(screen.getByText('settings.diagnostics.supportBundleFailed')).toBeTruthy();
  });

  it('Check again that still finds it blocked shows the note', async () => {
    fetchPawnIoStatus.mockResolvedValue(status('blocked'));
    renderGate('blocked');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'pawnioGate.blocked.check' })); });
    expect(screen.getByText('pawnioGate.blocked.still')).toBeTruthy();
  });
});

describe('PawnIoGate fix flow', () => {
  it('a successful fix reports ok to the host and continues after the delay', async () => {
    vi.useFakeTimers();
    try {
      fixPawnIo.mockResolvedValue(status('ok'));
      const props = renderGate('notInstalled');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'pawnioGate.install.button' })); });
      expect(props.onFixed).toHaveBeenCalledTimes(1);
      expect(screen.getByText('pawnioGate.done.title')).toBeTruthy();
      expect(props.onContinue).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
      expect(props.onContinue).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a fix that lands in another state hands that state to the host', async () => {
    fixPawnIo.mockResolvedValue(status('restartRequired'));
    const props = renderGate('notInstalled');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'pawnioGate.install.button' })); });
    expect(props.onStatus).toHaveBeenCalledWith(status('restartRequired'));
    expect(screen.getByRole('button', { name: 'pawnioGate.restart.button' })).toBeTruthy();
  });

  it('Restart PC posts the restart request', async () => {
    restartPcForPawnIo.mockResolvedValue(true);
    renderGate('restartRequired');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'pawnioGate.restart.button' })); });
    expect(restartPcForPawnIo).toHaveBeenCalledTimes(1);
  });
});

describe('PawnIoGate preview', () => {
  it('never calls fix, restart, refetch or the bundle export', async () => {
    vi.useFakeTimers();
    try {
      renderGate('notInstalled', { preview: true });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'pawnioGate.install.button' })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(screen.getByText('pawnioGate.done.title')).toBeTruthy();
      expect(fixPawnIo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    expect(restartPcForPawnIo).not.toHaveBeenCalled();
    expect(fetchPawnIoStatus).not.toHaveBeenCalled();
  });

  it('lands on a sub-state without any request', () => {
    renderGate('notRunning', { preview: true, phase: 'failed' });
    expect(screen.getByText('pawnioGate.steps.title')).toBeTruthy();
    expect(fixPawnIo).not.toHaveBeenCalled();
  });
});
