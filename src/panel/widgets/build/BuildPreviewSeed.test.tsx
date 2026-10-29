import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessBuild } from '../../../components/views/BuildPage/BuildPage';
import { BuildPreviewSeed, resetPreviewSeed, SEED_TIMEOUT_MS } from './BuildPreviewSeed';

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
});
