import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const tabs = [{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }];

describe('Tabs', () => {
  it('renders every tab label', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });

  it('fires onChange with the tab key on click', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }]}
        activeKey="one"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Two'));
    expect(onChange).toHaveBeenCalledWith('two', expect.any(HTMLButtonElement));
  });

  it('omits the trailing slot when a tab has no trailing node', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('trailing')).not.toBeInTheDocument();
  });

  it('renders a trailing node and stops its click from reaching onChange', () => {
    const onChange = vi.fn();
    const onTrailingClick = vi.fn();
    render(
      <Tabs
        tabs={[{
          key: 'one', label: 'One',
          trailing: <span data-testid="trailing" onClick={onTrailingClick}>*</span>,
        }]}
        activeKey="one"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('trailing'));
    expect(onTrailingClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the trailing node as a sibling of the tab button, never nested inside it', () => {
    render(
      <Tabs
        tabs={[{
          key: 'one', label: 'One',
          trailing: <span data-testid="trailing">*</span>,
        }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    const trailing = screen.getByTestId('trailing');
    const tabButton = screen.getByRole('tab', { name: 'One' });
    // A focusable control nested inside a <button> is invalid ARIA and, for a
    // literal <button>, invalid HTML - the trailing control must sit outside
    // the tab button's subtree, not inside it.
    expect(tabButton.contains(trailing)).toBe(false);
  });

  it('keeps a tab with no trailing node as a bare button (no extra wrapper)', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    const tabButton = screen.getByRole('tab', { name: 'One' });
    expect(tabButton.parentElement).toHaveAttribute('role', 'tablist');
  });

  it('shows a hover tooltip only on a tab that carries one', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One', tooltip: 'About one' }, { key: 'two', label: 'Two' }]}
        activeKey="two"
        onChange={() => {}}
      />,
    );
    fireEvent.focus(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(screen.getByRole('tab', { name: 'One' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('About one');
  });

  it('shows the tooltip on a tab that also has a trailing control', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One', tooltip: 'About one', trailing: <span>x</span> }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    fireEvent.focus(screen.getByRole('tab', { name: 'One' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('About one');
  });
});

describe('Tabs overflow arrows', () => {
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
    render(<Tabs tabs={tabs} activeKey="one" onChange={() => {}} />);
    expect(left()).toBeNull();
    expect(right()).toBeNull();
  });

  it('shows both arrows together after the tab strip when the tabs overflow', () => {
    metrics = { scrollWidth: 600, clientWidth: 300 };
    render(<Tabs tabs={tabs} activeKey="one" onChange={() => {}} />);
    expect(left()).toBeInTheDocument();
    expect(right()).toBeInTheDocument();
    expect(left()!.parentElement).toBe(right()!.parentElement);
    expect(screen.getByRole('tablist').parentElement!.parentElement!.lastElementChild).toBe(left()!.parentElement);
  });

  it('reveals the arrows when a resize makes the tabs overflow', () => {
    render(<Tabs tabs={tabs} activeKey="one" onChange={() => {}} />);
    expect(right()).toBeNull();
    metrics = { scrollWidth: 600, clientWidth: 300 };
    act(() => observers.forEach(cb => cb()));
    expect(right()).toBeInTheDocument();
  });

  it('disables each arrow at its scroll end and scrolls on click', () => {
    metrics = { scrollWidth: 600, clientWidth: 300 };
    render(<Tabs tabs={tabs} activeKey="one" onChange={() => {}} />);
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
    render(<Tabs tabs={tabs} activeKey="two" onChange={() => {}} />);
    const scroller = screen.getByRole('tablist').parentElement as HTMLElement;
    expect(scroller.scrollLeft).toBe(250);
    scroller.scrollLeft = 0;
    act(() => observers.forEach(cb => cb()));
    expect(scroller.scrollLeft).toBe(250);
  });
});
