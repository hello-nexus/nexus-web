import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { Coachmark, placeCoachmark } from './Coachmark';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { Button } from '../Button/Button';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const view = (w: number, h: number) => ({ left: 0, top: 0, right: w, bottom: h });

describe('placeCoachmark', () => {
  it('keeps the preferred side when it fits', () => {
    expect(placeCoachmark(rect(200, 50, 30, 30), 300, 90, view(1000, 800), 'bottom')?.side).toBe('bottom');
  });

  it('flips to the opposite side when there is no room', () => {
    expect(placeCoachmark(rect(200, 740, 30, 30), 300, 90, view(1000, 800), 'bottom')?.side).toBe('top');
  });

  it('flips a side placement to the opposite side and then to the stacked axis', () => {
    expect(placeCoachmark(rect(900, 300, 30, 30), 300, 90, view(1000, 800), 'right')?.side).toBe('left');
    expect(placeCoachmark(rect(400, 300, 30, 30), 700, 90, view(1000, 800), 'right')?.side).toBe('bottom');
  });

  it('stays inside the viewport and aims the arrow at the target', () => {
    const p = placeCoachmark(rect(10, 50, 30, 30), 300, 90, view(400, 800), 'bottom');
    expect(p?.left).toBeGreaterThanOrEqual(8);
    expect((p?.left ?? 0) + 300).toBeLessThanOrEqual(392);
    // The target's center is nearer the corner than the arrow may go, so it stops at the edge distance.
    expect(p?.arrow).toBe(22);
  });

  it('never puts the bubble above a boundary, flipping to the side instead', () => {
    // Target just under a 100px tab row: top and bottom-above do not fit, bottom does.
    const bounds = { left: 0, top: 100, right: 1000, bottom: 800 };
    expect(placeCoachmark(rect(200, 110, 30, 30), 300, 90, bounds, 'top', true)?.side).not.toBe('top');
  });

  it('returns null in strict mode when the target itself is outside the boundary', () => {
    const bounds = { left: 0, top: 100, right: 1000, bottom: 800 };
    expect(placeCoachmark(rect(200, 60, 30, 30), 300, 90, bounds, 'bottom', true)).toBeNull();
    expect(placeCoachmark(rect(200, 60, 30, 30), 300, 90, bounds, 'bottom', false)).not.toBeNull();
  });

  it('keeps the arrow clear of the rounded corner when the bubble is clamped', () => {
    const geo = { margin: 8, offset: 16, arrowEdge: 22 };
    const p = placeCoachmark(rect(0, 50, 20, 20), 300, 90, view(400, 800), 'bottom', false, geo);
    expect(p?.arrow).toBeGreaterThanOrEqual(22);
    const q = placeCoachmark(rect(380, 50, 20, 20), 300, 90, view(400, 800), 'bottom', false, geo);
    expect(q?.arrow).toBeLessThanOrEqual(300 - 22);
  });

  it('returns null in strict mode when no side fits inside the boundary', () => {
    const tiny = { left: 0, top: 100, right: 340, bottom: 160 };
    expect(placeCoachmark(rect(100, 110, 30, 30), 300, 90, tiny, 'bottom', true)).toBeNull();
    expect(placeCoachmark(rect(100, 110, 30, 30), 300, 90, tiny, 'bottom', false)).not.toBeNull();
  });
});

type IoCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let ioCallbacks: IoCallback[] = [];
let ioObserved: Element[] = [];

function mountTarget(size = { width: 30, height: 30 }) {
  const el = document.createElement('button');
  el.setAttribute('data-coachmark', 't');
  el.getBoundingClientRect = () => rect(100, 100, size.width, size.height);
  document.body.appendChild(el);
  return el;
}

const props = { hintId: 'h', target: '[data-coachmark="t"]', title: 'Title', body: 'Body', dismissLabel: 'Close', onDismiss: () => {} };
const region = () => screen.getByRole('region', { hidden: true });

describe('Coachmark', () => {
  beforeEach(() => {
    ioCallbacks = [];
    ioObserved = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IoCallback) { ioCallbacks.push(cb); }
      observe(el: Element) { ioObserved.push(el); }
      disconnect() {}
    });
  });
  afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('shows next to a target that is rendered and sized', () => {
    mountTarget();
    render(<Coachmark {...props} />);
    expect(region().style.visibility).toBe('visible');
  });

  it('accepts a ref as the target', () => {
    const el = mountTarget();
    const ref = { current: el };
    render(<Coachmark {...props} target={ref} />);
    expect(region().style.visibility).toBe('visible');
  });

  it('stays hidden when the target is missing or has no size', () => {
    render(<Coachmark {...props} />);
    expect(region().style.visibility).toBe('hidden');
    cleanup();
    mountTarget({ width: 0, height: 0 });
    render(<Coachmark {...props} />);
    expect(region().style.visibility).toBe('hidden');
  });

  it('appears once a late target mounts', async () => {
    render(<Coachmark {...props} />);
    expect(region().style.visibility).toBe('hidden');
    await act(async () => { mountTarget(); await Promise.resolve(); });
    expect(region().style.visibility).toBe('visible');
  });

  it('hides while a modal dialog is open and returns when it closes', async () => {
    mountTarget();
    render(<Coachmark {...props} />);
    const modal = document.createElement('div');
    modal.setAttribute('role', 'alertdialog');
    await act(async () => { document.body.appendChild(modal); await Promise.resolve(); });
    expect(region().style.visibility).toBe('hidden');
    await act(async () => { modal.remove(); await Promise.resolve(); });
    expect(region().style.visibility).toBe('visible');
  });

  it('hides when the target scrolls out of view or is clipped, and returns', () => {
    mountTarget();
    render(<Coachmark {...props} />);
    act(() => ioCallbacks.forEach(cb => cb([{ isIntersecting: false, intersectionRatio: 0 }])));
    expect(region().style.visibility).toBe('hidden');
    act(() => ioCallbacks.forEach(cb => cb([{ isIntersecting: true, intersectionRatio: 1 }])));
    expect(region().style.visibility).toBe('visible');
  });

  it('hides instead of overlapping when nothing fits inside the boundary', () => {
    mountTarget();
    render(<Coachmark {...props} boundary={() => rect(90, 90, 60, 60)} />);
    expect(region().style.visibility).toBe('hidden');
  });

  it('shows when it fits inside the boundary', () => {
    mountTarget();
    render(<Coachmark {...props} boundary={() => rect(0, 0, 1000, 800)} />);
    expect(region().style.visibility).toBe('visible');
  });

  it('is a labelled, described, non-modal region', () => {
    mountTarget();
    render(<Coachmark {...props} />);
    const r = region();
    expect(r.getAttribute('aria-modal')).toBeNull();
    expect(document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Title');
    expect(document.getElementById(r.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Body');
  });

  it('reads the hint out once through a polite live region and leaves the target aria alone', async () => {
    const el = mountTarget();
    el.setAttribute('aria-describedby', 'existing');
    render(<Coachmark {...props} />);
    const status = screen.getByRole('status');
    await waitFor(() => expect(status.textContent).toBe('Title. Body'));
    expect(el.getAttribute('aria-describedby')).toBe('existing');
    // Re-measuring does not re-announce.
    act(() => ioCallbacks.forEach(cb => cb([{ isIntersecting: false, intersectionRatio: 0 }])));
    act(() => ioCallbacks.forEach(cb => cb([{ isIntersecting: true, intersectionRatio: 1 }])));
    expect(status.textContent).toBe('Title. Body');
  });

  it('does not clobber a HoverTooltip on the target', async () => {
    render(
      <>
        <HoverTooltip body="Tip" side="bottom">
          <Button data-coachmark="t" aria-describedby="tip-id" aria-label="Go" />
        </HoverTooltip>
        <Coachmark {...props} />
      </>,
    );
    const btn = screen.getByRole('button', { name: 'Go' });
    btn.getBoundingClientRect = () => rect(100, 100, 30, 30);
    await act(async () => { window.dispatchEvent(new Event('resize')); await Promise.resolve(); });
    expect(btn.getAttribute('aria-describedby')).toBe('tip-id');
    expect(region().style.visibility).toBe('visible');
    expect(screen.getByRole('status').textContent).toBe('Title. Body');
  });

  it('follows the target when it re-mounts as a new node', async () => {
    const a = mountTarget();
    render(<Coachmark {...props} />);
    expect(ioObserved).toContain(a);
    await act(async () => { a.remove(); await Promise.resolve(); });
    expect(region().style.visibility).toBe('hidden');
    let b!: HTMLElement;
    await act(async () => { b = mountTarget(); await Promise.resolve(); });
    expect(region().style.visibility).toBe('visible');
    expect(ioObserved).toContain(b);
  });

  describe('layout follow', () => {
    let frames: FrameRequestCallback[];
    let now: number;
    let left: number;
    let el: HTMLElement;
    const cancelled = vi.fn();
    const runFrame = () => act(async () => { frames.shift()?.(0); });
    const drain = async () => { for (let i = 0; i < 400 && frames.length; i++) await runFrame(); };

    beforeEach(() => {
      frames = [];
      now = 0;
      left = 100;
      cancelled.mockClear();
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
      vi.stubGlobal('cancelAnimationFrame', cancelled);
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      el = mountTarget();
      el.getBoundingClientRect = () => rect(left, 100, 30, 30);
    });

    it('follows a moving target frame by frame after a class change and then stops', async () => {
      render(<Coachmark {...props} />);
      await act(async () => { await Promise.resolve(); });
      const start = region().style.left;
      await act(async () => { el.classList.add('shifted'); await Promise.resolve(); });
      left = 300;
      await runFrame();
      const mid = region().style.left;
      expect(mid).not.toBe(start);
      left = 500;
      await runFrame();
      expect(region().style.left).not.toBe(mid);
      await drain();
      expect(frames).toHaveLength(0);
    });

    it('follows when a class change and a DOM change land in the same batch, with no transition events', async () => {
      render(<Coachmark {...props} />);
      await act(async () => { await Promise.resolve(); });
      const start = region().style.left;
      await act(async () => {
        el.classList.add('shifted');
        document.body.appendChild(document.createElement('span'));
        await Promise.resolve();
      });
      left = 400;
      await runFrame();
      expect(region().style.left).not.toBe(start);
    });

    it('stops following at the cap even while events keep arriving', async () => {
      render(<Coachmark {...props} />);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { el.classList.add('a'); await Promise.resolve(); });
      for (const at of [400, 800, 1200, 1400]) {
        left += 50;
        now = at;
        await act(async () => { document.body.dispatchEvent(new Event('transitionrun', { bubbles: true })); });
        await runFrame();
      }
      expect(frames).toHaveLength(1);
      // Past the cap measured from the first event, the next frame ends the loop.
      left += 50;
      now = 1600;
      await runFrame();
      expect(frames).toHaveLength(0);
    });

    it('cancels a pending frame on unmount', async () => {
      const view = render(<Coachmark {...props} />);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { el.classList.add('shifted'); await Promise.resolve(); });
      expect(frames.length).toBe(1);
      view.unmount();
      expect(cancelled).toHaveBeenCalled();
    });
  });

  it('hides the bubble and the ring when the target is outside the boundary', () => {
    mountTarget();
    const { container } = render(<Coachmark {...props} boundary={() => rect(0, 200, 1000, 600)} />);
    expect(region().style.visibility).toBe('hidden');
    expect(container.ownerDocument.querySelectorAll('div[aria-hidden="true"]').length).toBe(0);
  });

  it('mounts in the outermost isolated ancestor so in-flow dropdowns there out-rank it', () => {
    const layout = document.createElement('div');
    const inner = document.createElement('div');
    const el = document.createElement('button');
    el.setAttribute('data-coachmark', 't');
    el.getBoundingClientRect = () => rect(100, 100, 30, 30);
    inner.appendChild(el);
    layout.appendChild(inner);
    document.body.appendChild(layout);
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((n: Element, pseudo?: string | null) => {
      const cs = real(n, pseudo);
      if (n !== layout && n !== inner) return cs;
      return new Proxy(cs, { get: (t, k) => (k === 'isolation' ? 'isolate' : Reflect.get(t, k)) });
    });
    render(<Coachmark {...props} />);
    expect(layout.contains(region())).toBe(true);
    expect(layout.contains(screen.getByRole('status'))).toBe(true);
  });

  it('falls back to body when the isolated ancestor would re-anchor fixed positioning', () => {
    const layout = document.createElement('div');
    const el = document.createElement('button');
    el.setAttribute('data-coachmark', 't');
    el.getBoundingClientRect = () => rect(100, 100, 30, 30);
    layout.appendChild(el);
    document.body.appendChild(layout);
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((n: Element, pseudo?: string | null) => {
      const cs = real(n, pseudo);
      if (n !== layout) return cs;
      return new Proxy(cs, { get: (t, k) => (k === 'isolation' ? 'isolate' : k === 'transform' ? 'matrix(1, 0, 0, 1, 0, 0)' : Reflect.get(t, k)) });
    });
    render(<Coachmark {...props} />);
    expect(layout.contains(region())).toBe(false);
  });

  it('warns in dev when a selector matches several elements', () => {
    mountTarget();
    mountTarget();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Coachmark {...props} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('matches 2 elements'));
    warn.mockRestore();
  });

  it('dismisses from the X only; Escape belongs to whatever else is open', () => {
    mountTarget();
    const onDismiss = vi.fn();
    render(<Coachmark {...props} onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not poll', () => {
    mountTarget();
    const spy = vi.spyOn(window, 'setInterval');
    render(<Coachmark {...props} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
