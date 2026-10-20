import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObsStatusResponse } from '../../../api/obs';
import type { PanelWidget } from '../../types';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { ObsWidget } from './ObsWidget';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const api = vi.hoisted(() => ({
  fetchObsStatus: vi.fn(),
  connectObs: vi.fn(),
  setObsScene: vi.fn(),
  toggleObsRecording: vi.fn(),
  toggleObsStreaming: vi.fn(),
}));
vi.mock('../../../api/obs', () => api);

function status(patch: Partial<ObsStatusResponse>): ObsStatusResponse {
  return {
    error: false,
    msg: '',
    reason: '',
    connected: true,
    host: 'h',
    port: 1,
    activeScene: 'A',
    scenes: [{ name: 'A', uuid: 'a' }],
    streaming: false,
    streamingDurationMs: 0,
    recording: false,
    recordingDurationMs: 0,
    ...patch,
  };
}

const widget = { id: 'w', type: 'obs', size: '4x2' } as unknown as PanelWidget;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
  Object.values(api).forEach(fn => fn.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ObsWidget timers', () => {
  it('ticks the live timer every second between polls', async () => {
    api.fetchObsStatus.mockResolvedValue(status({ streaming: true, streamingDurationMs: 5000 }));
    render(<ObsWidget widget={widget} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('00:05')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText('00:06')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText('00:07')).toBeTruthy();
  });

  it('keeps no interval running while idle', async () => {
    api.fetchObsStatus.mockResolvedValue(status({}));
    render(<ObsWidget widget={widget} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // Only the poll interval remains.
    expect(vi.getTimerCount()).toBe(1);
  });

  it('ignores a slow older poll that resolves after a newer one', async () => {
    let resolveOld: (s: ObsStatusResponse) => void = () => {};
    api.fetchObsStatus
      .mockImplementationOnce(() => new Promise<ObsStatusResponse>(r => { resolveOld = r; }))
      .mockResolvedValue(status({ streaming: true, streamingDurationMs: 10000 }));
    render(<ObsWidget widget={widget} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.getByText('00:10')).toBeTruthy();
    await act(async () => { resolveOld(status({ streaming: true, streamingDurationMs: 3000 })); });
    expect(screen.queryByText('00:03')).toBeNull();
    expect(screen.getByText('00:10')).toBeTruthy();
  });

  it('ignores a poll started before a toggle that resolves after it', async () => {
    let resolvePoll: (s: ObsStatusResponse) => void = () => {};
    api.fetchObsStatus
      .mockResolvedValueOnce(status({}))
      .mockImplementationOnce(() => new Promise<ObsStatusResponse>(r => { resolvePoll = r; }));
    api.toggleObsStreaming.mockResolvedValue(status({ streaming: true, streamingDurationMs: 1000 }));
    render(<ObsWidget widget={widget} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await act(async () => { screen.getByText('panel.widget.obs.stream').click(); });
    expect(screen.getByText('00:01')).toBeTruthy();
    await act(async () => { resolvePoll(status({})); });
    expect(screen.getByText('00:01')).toBeTruthy();
    expect(screen.queryByText('panel.widget.obs.stream')).toBeNull();
  });

  it('keeps a toggle response that resolves after a poll started during it', async () => {
    let resolveToggle: (s: ObsStatusResponse) => void = () => {};
    let resolvePoll: (s: ObsStatusResponse) => void = () => {};
    api.fetchObsStatus
      .mockResolvedValueOnce(status({}))
      .mockImplementationOnce(() => new Promise<ObsStatusResponse>(r => { resolvePoll = r; }));
    api.toggleObsStreaming.mockImplementation(() => new Promise<ObsStatusResponse>(r => { resolveToggle = r; }));
    render(<ObsWidget widget={widget} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { screen.getByText('panel.widget.obs.stream').click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await act(async () => { resolvePoll(status({ streaming: false })); });
    await act(async () => { resolveToggle(status({ streaming: true, streamingDurationMs: 1000 })); });
    expect(screen.getByText('panel.widget.obs.live')).toBeTruthy();
    expect(screen.getByText('00:01')).toBeTruthy();
  });

  it('does not poll or tick in picker preview', () => {
    render(
      <PanelPreviewProvider value>
        <ObsWidget widget={widget} />
      </PanelPreviewProvider>,
    );
    expect(api.fetchObsStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
