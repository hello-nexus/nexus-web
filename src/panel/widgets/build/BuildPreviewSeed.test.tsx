import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessBuild } from '../../../components/views/BuildPage/BuildPage';
import { BuildPreviewSeed, resetPreviewSeed, SEED_TIMEOUT_MS } from './BuildPreviewSeed';
import { recordSeedFailure, seedAttemptKey, seedFailedRecently } from './seedAttempts';

const h = vi.hoisted(() => ({
  machine: null as { caseId?: string } | null,
  key: null as string | null,
  frames: [] as HeadlessBuild[],
}));

vi.mock('../../../components/views/BuildPage/buildMachine', () => ({
  useBuildMachine: () => ({ machine: h.machine, key: h.key }),
}));
vi.mock('../../../components/views/BuildPage/BuildPage', () => ({
  BuildPage: ({ headless }: { headless: HeadlessBuild }) => {
    h.frames.push(headless);
    return <div data-testid="frame" />;
  },
}));

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

describe('BuildPreviewSeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPreviewSeed();
    h.machine = { caseId: 'y70' };
    h.key = 'case=y70';
    h.frames = [];
  });
  afterEach(() => vi.useRealTimers());

  it('frames Build headless with the host machine, asking for the preview', async () => {
    const view = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(view.queryByTestId('frame')).not.toBeNull();
    expect(h.frames.at(-1)).toMatchObject({ machine: h.machine, layoutKey: 'case=y70', preview: true });
  });

  it('waits for a machine that names the same case', async () => {
    h.machine = { caseId: 'other' };
    const view = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(view.queryByTestId('frame')).toBeNull();
  });

  it('runs one frame for two tiles', async () => {
    const view = render(<><BuildPreviewSeed caseId="y70" /><BuildPreviewSeed caseId="y70" /></>);
    await flush();
    expect(view.queryAllByTestId('frame')).toHaveLength(1);
  });

  it('hands the frame to the next tile when the owner unmounts', async () => {
    const first = render(<BuildPreviewSeed caseId="y70" />);
    const second = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(first.container.querySelector('[data-testid="frame"]')).not.toBeNull();
    expect(second.container.querySelector('[data-testid="frame"]')).toBeNull();
    first.unmount();
    await flush();
    expect(second.container.querySelector('[data-testid="frame"]')).not.toBeNull();
  });

  it('gives up when Build is unavailable and does not try the case again this session', async () => {
    const view = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    act(() => h.frames.at(-1)!.onUnavailable());
    expect(view.queryByTestId('frame')).toBeNull();
    view.unmount();
    const again = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(again.queryByTestId('frame')).toBeNull();
  });

  it('gives up after the timeout', async () => {
    const view = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(SEED_TIMEOUT_MS); });
    expect(view.queryByTestId('frame')).toBeNull();
  });

  it('keeps a timed-out attempt for a day: the next launch frames nothing until the setup changes', async () => {
    const first = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(first.queryByTestId('frame')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(SEED_TIMEOUT_MS + 1); });
    expect(first.queryByTestId('frame')).toBeNull();
    expect(seedFailedRecently(seedAttemptKey('y70', 'case=y70'))).toBe(true);
    first.unmount();
    // A new page: the in-memory memory is gone, the stored failure holds.
    const stored = localStorage.getItem('nexus.buildSeed.failed');
    resetPreviewSeed();
    localStorage.setItem('nexus.buildSeed.failed', stored ?? '{}');
    const second = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(second.queryByTestId('frame')).toBeNull();
    second.unmount();
    // A changed setup is a new attempt (on a new page, as the in-memory memory is per page).
    const kept = localStorage.getItem('nexus.buildSeed.failed');
    resetPreviewSeed();
    localStorage.setItem('nexus.buildSeed.failed', kept ?? '{}');
    h.key = 'case=y70,gpu=other';
    const third = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(third.queryByTestId('frame')).not.toBeNull();
  });

  it('frames again once the stored failure is a day old', async () => {
    recordSeedFailure(seedAttemptKey('y70', 'case=y70'), Date.now() - 25 * 60 * 60 * 1000);
    const view = render(<BuildPreviewSeed caseId="y70" />);
    await flush();
    expect(view.queryByTestId('frame')).not.toBeNull();
  });
});
