import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLedFrame, publishLedFrame } from '../lib/ledFrameStore';
import { useLiveLedDots, type LiveLedSource } from './useLiveLedDots';

const seenRefs: unknown[] = [];

function Dots({ sources }: { sources: (LiveLedSource | undefined)[] }) {
  const ref = useLiveLedDots();
  return <>{sources.map((s, i) => { const r = ref(i, s); seenRefs.push(r); return <div key={i} data-testid={`d${i}`} ref={r} />; })}</>;
}

const frame = (bytes: number[]) => publishLedFrame(null, 0, 0, new Map([[3, new Uint8Array(bytes)]]));
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(100); });

beforeEach(() => { vi.useFakeTimers(); clearLedFrame(); });
afterEach(() => { clearLedFrame(); vi.useRealTimers(); });

describe('useLiveLedDots', () => {
  it('paints the exact frame color per LED and leaves unmapped or absent dots unpainted', async () => {
    frame([255, 0, 0, 1, 2, 3]);
    const { getByTestId } = render(<Dots sources={[{ frameIndex: 3, index: 0 }, { frameIndex: 3, index: 1 }, undefined, { frameIndex: 3, index: 5 }, { frameIndex: 8, index: 0 }]} />);
    await tick();
    expect(getByTestId('d0').style.background).toBe('rgb(255, 0, 0)');
    expect(getByTestId('d1').style.background).toBe('rgb(1, 2, 3)');
    expect(getByTestId('d2').style.background).toBe('');
    expect(getByTestId('d3').style.background).toBe('');
    expect(getByTestId('d4').style.background).toBe('');
  });

  it('follows new frames and clears when the section goes empty', async () => {
    frame([10, 20, 30]);
    const { getByTestId } = render(<Dots sources={[{ frameIndex: 3, index: 0 }]} />);
    await tick();
    expect(getByTestId('d0').style.background).toBe('rgb(10, 20, 30)');
    act(() => frame([40, 50, 60]));
    await tick();
    expect(getByTestId('d0').style.background).toBe('rgb(40, 50, 60)');
    act(() => frame([]));
    await tick();
    expect(getByTestId('d0').style.background).toBe('');
  });

  it('repaints when a dot is re-sourced', async () => {
    frame([1, 1, 1, 9, 9, 9]);
    const { getByTestId, rerender } = render(<Dots sources={[{ frameIndex: 3, index: 0 }]} />);
    await tick();
    rerender(<Dots sources={[{ frameIndex: 3, index: 1 }]} />);
    expect(getByTestId('d0').style.background).toBe('rgb(9, 9, 9)');
  });

  it('writes no style on a re-render with an unchanged frame and source', async () => {
    frame([5, 6, 7]);
    const sources = [{ frameIndex: 3, index: 0 }];
    const { getByTestId, rerender } = render(<Dots sources={sources} />);
    await tick();
    const el = getByTestId('d0');
    const observer = new MutationObserver(() => {});
    observer.observe(el, { attributes: true });
    seenRefs.length = 0;
    rerender(<Dots sources={[{ frameIndex: 3, index: 0 }]} />);
    rerender(<Dots sources={[{ frameIndex: 3, index: 0 }]} />);
    expect(new Set(seenRefs).size).toBe(1);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    expect(getByTestId('d0')).toBe(el);
    expect(el.style.background).toBe('rgb(5, 6, 7)');
  });
});
