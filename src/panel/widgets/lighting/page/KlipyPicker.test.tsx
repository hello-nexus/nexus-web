import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { centreCrop } from '../../../../api/klipy';
import { KlipyPicker } from './KlipyPicker';

const searchKlipy = vi.hoisted(() => vi.fn());

vi.mock('../../../../api/klipy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/klipy')>()),
  searchKlipy,
  klipyThumbUrl: (slug: string) => `/api/klipy/thumb/${slug}`,
}));

const gif = (slug: string, title = slug) => ({ slug, title, width: 220, height: 164 });

// jsdom has no IntersectionObserver; the picker's pagination is built on one.
const observers: { cb: IntersectionObserverCallback }[] = [];
class StubIntersectionObserver {
  constructor(public cb: IntersectionObserverCallback) { observers.push({ cb }); }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = '';
  thresholds = [];
}
vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);

describe('centreCrop', () => {
  it('takes the middle of a wide source horizontally', () => {
    // 2:1 into 16:9 keeps the full height and 88.9% of the width.
    expect(centreCrop(400, 200, 16 / 9)).toBe('0.055556,0,0.888889,1');
  });

  it('takes the middle of a tall source vertically', () => {
    expect(centreCrop(100, 200, 16 / 9)).toBe('0,0.359375,1,0.281250');
  });

  it('is the identity for a source already at the target aspect', () => {
    expect(centreCrop(1600, 900, 16 / 9)).toBe('0,0.000000,1,1.000000');
  });

  it('falls back to the whole frame for unusable dimensions', () => {
    expect(centreCrop(0, 0, 16 / 9)).toBe('0,0,1,1');
    expect(centreCrop(220, 164, 0)).toBe('0,0,1,1');
  });
});

describe('KlipyPicker', () => {
  beforeEach(() => {
    observers.length = 0;
    searchKlipy.mockReset();
    searchKlipy.mockResolvedValue({ items: [gif('happy-cat', 'Happy cat')], hasNext: false });
  });

  it('opens on trending - an empty query, not a search term', async () => {
    render(<KlipyPicker open busySlug={null} onPick={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(searchKlipy).toHaveBeenCalledWith('', 1));
    expect(await screen.findByLabelText('Happy cat')).toBeInTheDocument();
  });

  it('debounces typing into a single search call', async () => {
    vi.useFakeTimers();
    try {
      render(<KlipyPicker open busySlug={null} onPick={vi.fn()} onClose={vi.fn()} />);
      await act(() => vi.advanceTimersByTimeAsync(400));
      searchKlipy.mockClear();

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'c' } });
      fireEvent.change(input, { target: { value: 'ca' } });
      fireEvent.change(input, { target: { value: 'cat' } });
      await act(() => vi.advanceTimersByTimeAsync(400));

      expect(searchKlipy).toHaveBeenCalledTimes(1);
      expect(searchKlipy).toHaveBeenCalledWith('cat', 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands the picked gif to the caller', async () => {
    const onPick = vi.fn();
    render(<KlipyPicker open busySlug={null} onPick={onPick} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByLabelText('Happy cat'));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ slug: 'happy-cat' }));
  });

  it('ignores a second pick while one is importing', async () => {
    const onPick = vi.fn();
    render(<KlipyPicker open busySlug="happy-cat" onPick={onPick} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByLabelText('Happy cat'));

    expect(onPick).not.toHaveBeenCalled();
  });

  it('reports an unreachable catalog instead of an empty grid', async () => {
    searchKlipy.mockResolvedValue({ items: [], hasNext: false, error: true, msg: 'Klipy is unreachable' });

    render(<KlipyPicker open busySlug={null} onPick={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText('Klipy is unreachable')).toBeInTheDocument();
  });

  it('appends the next page when the sentinel comes into view', async () => {
    searchKlipy.mockResolvedValueOnce({ items: [gif('one', 'One')], hasNext: true });
    searchKlipy.mockResolvedValueOnce({ items: [gif('two', 'Two')], hasNext: false });
    render(<KlipyPicker open busySlug={null} onPick={vi.fn()} onClose={vi.fn()} />);
    await screen.findByLabelText('One');

    await act(async () => {
      observers[observers.length - 1].cb(
        [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(searchKlipy).toHaveBeenLastCalledWith('', 2);
    expect(await screen.findByLabelText('Two')).toBeInTheDocument();
    expect(screen.getByLabelText('One')).toBeInTheDocument();
  });

  it('drops a slug Klipy repeats on the next page', async () => {
    searchKlipy.mockResolvedValueOnce({ items: [gif('dupe', 'Dupe')], hasNext: true });
    searchKlipy.mockResolvedValueOnce({ items: [gif('dupe', 'Dupe'), gif('fresh', 'Fresh')], hasNext: false });
    render(<KlipyPicker open busySlug={null} onPick={vi.fn()} onClose={vi.fn()} />);
    await screen.findByLabelText('Dupe');

    await act(async () => {
      observers[observers.length - 1].cb(
        [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    await screen.findByLabelText('Fresh');
    expect(screen.getAllByLabelText('Dupe')).toHaveLength(1);
  });

  it('shows an import error inside the picker', async () => {
    render(<KlipyPicker open busySlug={null} importError="Import failed" onPick={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Import failed');
  });

  it('shows the required attribution', async () => {
    render(<KlipyPicker open busySlug={null} onPick={vi.fn()} onClose={vi.fn()} />);

    // t() returns the key under test, so this asserts the slot, not the copy.
    expect(await screen.findByText('lighting.controls.klipyPoweredBy')).toBeInTheDocument();
  });
});
