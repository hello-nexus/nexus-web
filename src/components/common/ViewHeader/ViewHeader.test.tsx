import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewHeader } from './ViewHeader';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const tabs = [{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }];

// The tab row is the element that holds both the tab strip and the rail.
const tabRow = () => screen.getByRole('tablist').parentElement as HTMLElement;

describe('ViewHeader actions', () => {
  it('puts actions inside the tab row, not in a row of their own', () => {
    const { container } = render(<ViewHeader title="Page" tabs={tabs} activeTab="one" actions={<span>Busy</span>} />);
    const header = container.querySelector('header') as HTMLElement;
    const row = tabRow();
    expect(row.contains(screen.getByText('Busy'))).toBe(true);
    expect(header.children).toHaveLength(1);
    expect(header.firstElementChild).toBe(row);
  });

  it('adds no element to the header flow when actions appear over tabs', () => {
    const { container, rerender } = render(<ViewHeader title="Page" tabs={tabs} activeTab="one" />);
    const header = container.querySelector('header') as HTMLElement;
    expect(header.children).toHaveLength(1);
    rerender(<ViewHeader title="Page" tabs={tabs} activeTab="one" actions={<span>Busy</span>} />);
    expect(header.children).toHaveLength(1);
  });

  it('shares the right rail with tabActions', () => {
    render(<ViewHeader title="Page" tabs={tabs} activeTab="one" tabActions={<span>Tools</span>} actions={<span>Busy</span>} />);
    const rail = tabRow().lastElementChild as HTMLElement;
    expect(rail).toContainElement(screen.getByText('Tools'));
    expect(rail).toContainElement(screen.getByText('Busy'));
  });

  it('never adds a row for actions on a header without a tab row', () => {
    const { container } = render(<ViewHeader title="Page" actions={<span>Busy</span>} />);
    const header = container.querySelector('header') as HTMLElement;
    expect(header.children).toHaveLength(0);
    expect(screen.queryByText('Busy')).toBeNull();
  });
});

describe('ViewHeader tabArrows', () => {
  let metrics: { scrollWidth: number; clientWidth: number };
  let scrollTo: ReturnType<typeof vi.fn>;
  const observers: Array<() => void> = [];

  beforeEach(() => {
    metrics = { scrollWidth: 300, clientWidth: 300 };
    observers.length = 0;
    scrollTo = vi.fn(function (this: HTMLElement, opts: ScrollToOptions) { this.scrollLeft = opts.left ?? 0; });
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { observers.push(cb); }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => metrics.scrollWidth);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => metrics.clientWidth);
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  });

  const left = () => screen.queryByRole('button', { name: 'common.tabs.scrollLeft' });
  const right = () => screen.queryByRole('button', { name: 'common.tabs.scrollRight' });

  it('hides the arrows when the tabs fit', () => {
    render(<ViewHeader title="Page" tabs={tabs} activeTab="one" tabArrows />);
    expect(left()).toBeNull();
    expect(right()).toBeNull();
  });

  it('shows both arrows together after the tab strip when the tabs overflow', () => {
    metrics = { scrollWidth: 600, clientWidth: 300 };
    render(<ViewHeader title="Page" tabs={tabs} activeTab="one" tabArrows />);
    expect(left()).toBeInTheDocument();
    expect(right()).toBeInTheDocument();
    expect(left()!.parentElement).toBe(right()!.parentElement);
    expect(tabRow().parentElement!.lastElementChild).toBe(left()!.parentElement);
  });

  it('reveals the arrows when a resize makes the tabs overflow', () => {
    render(<ViewHeader title="Page" tabs={tabs} activeTab="one" tabArrows />);
    expect(right()).toBeNull();
    metrics = { scrollWidth: 600, clientWidth: 300 };
    act(() => observers.forEach(cb => cb()));
    expect(right()).toBeInTheDocument();
  });

  it('disables each arrow at its scroll end and scrolls on click', () => {
    metrics = { scrollWidth: 600, clientWidth: 300 };
    render(<ViewHeader title="Page" tabs={tabs} activeTab="one" tabArrows />);
    const scroller = screen.getByRole('tablist').parentElement as HTMLElement;
    expect(left()).toBeDisabled();
    expect(right()).toBeEnabled();
    fireEvent.click(right()!);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scroller.scrollLeft).toBeGreaterThan(0);
    fireEvent.scroll(scroller);
    expect(left()).toBeEnabled();
    scroller.scrollLeft = 300;
    fireEvent.scroll(scroller);
    expect(right()).toBeDisabled();
    fireEvent.click(left()!);
    expect(scroller.scrollLeft).toBeLessThan(300);
  });

  it('scrolls the active tab into view on load and again when the strip resizes', () => {
    metrics = { scrollWidth: 600, clientWidth: 300 };
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(450);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    render(<ViewHeader title="Page" tabs={tabs} activeTab="two" tabArrows />);
    const scroller = screen.getByRole('tablist').parentElement as HTMLElement;
    expect(scroller.scrollLeft).toBe(250);
    scroller.scrollLeft = 0;
    act(() => observers.forEach(cb => cb()));
    expect(scroller.scrollLeft).toBe(250);
  });

  it('adds no arrows to a header that has not opted in, even when its tabs overflow', () => {
    metrics = { scrollWidth: 600, clientWidth: 300 };
    render(<ViewHeader title="Page" tabs={tabs} activeTab="one" />);
    expect(left()).toBeNull();
    expect(right()).toBeNull();
  });
});
