import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

function open(label = 'fruit') {
  fireEvent.click(screen.getByRole('button', { name: label }));
  return screen.getByRole('listbox');
}

describe('Select leadingAction', () => {
  it('comes before the trigger in DOM order, and pressing it does not open the list', () => {
    const onLead = vi.fn();
    render(
      <Select
        value="a" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit"
        leadingAction={<button type="button" aria-label="lead" onClick={onLead} />}
      />,
    );
    const lead = screen.getByRole('button', { name: 'lead' });
    const trigger = screen.getByRole('button', { name: 'fruit' });
    expect(lead.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(lead);
    expect(onLead).toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Select', () => {
  it('shows the selected option label on the trigger', () => {
    render(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" />);
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('Banana');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders only the icon on the trigger with triggerIconOnly, keeping full rows in the menu', () => {
    const iconOptions = [
      { value: 'en', label: 'English', icon: '🇺🇸' },
      { value: 'it', label: 'Italiano', icon: '🇮🇹' },
    ];
    render(<Select value="it" onChange={vi.fn()} options={iconOptions} ariaLabel="Language" triggerIconOnly />);
    const trigger = screen.getByRole('button', { name: 'Language' });
    expect(trigger).not.toHaveTextContent('Italiano');
    expect(trigger).toHaveTextContent('🇮🇹');
    expect(trigger).not.toHaveAttribute('title');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Italiano');
    fireEvent.blur(trigger);
    open('Language');
    expect(screen.getByRole('option', { name: 'Italiano' })).toBeInTheDocument();
  });

  it('renders an option description in the menu row only', () => {
    const opts = [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana', description: 'Ripe' }];
    render(<Select value="b" onChange={vi.fn()} options={opts} ariaLabel="fruit" />);
    expect(screen.getByRole('button', { name: 'fruit' })).not.toHaveTextContent('Ripe');
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('Banana');
    expect(within(open()).getByText('Ripe')).toBeInTheDocument();
  });

  it('draws a fontFamily option in its face in the menu row only', () => {
    const fontOptions = [
      { value: 'lexend', label: 'Lexend', fontFamily: 'Lexend' },
      { value: 'geist', label: 'Geist', fontFamily: "'Geist', sans-serif" },
    ];
    render(<Select value="geist" onChange={vi.fn()} options={fontOptions} ariaLabel="Font" />);
    expect(screen.getByText('Geist', { selector: 'button span' })).not.toHaveAttribute('style');
    open('Font');
    expect(screen.getByRole('option', { name: 'Lexend' })).toHaveStyle({ fontFamily: 'Lexend' });
  });

  it('falls back to the label on the trigger when the selected option has no icon', () => {
    render(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" triggerIconOnly />);
    const trigger = screen.getByRole('button', { name: 'fruit' });
    expect(trigger).toHaveTextContent('Banana');
    expect(trigger).not.toHaveAttribute('title');
  });

  it('pins the trigger to an explicit height when provided, leaving it unset by default', () => {
    const { rerender } = render(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" />);
    expect(screen.getByRole('button', { name: 'fruit' })).not.toHaveStyle({ height: '40px' });

    rerender(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" height={40} />);
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveStyle({ height: '40px' });
  });

  it('opens a listbox of options on click and selects one', () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={OPTIONS} ariaLabel="fruit" />);
    open();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.click(screen.getByRole('option', { name: 'Cherry' }));
    expect(onChange).toHaveBeenCalledWith('c');
    // Closes after a commit.
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('marks the current value selected', () => {
    render(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" />);
    open();
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'false');
  });

  it('navigates and commits with the keyboard', () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={OPTIONS} ariaLabel="fruit" />);
    const listbox = open();
    // Active starts on the current value (a); ArrowDown → b.
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('closes on Escape without selecting', () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={OPTIONS} ariaLabel="fruit" />);
    const listbox = open();
    fireEvent.keyDown(listbox, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('derives options from <option> children, carrying disabled', () => {
    const onChange = vi.fn();
    render(
      <Select value="x" onChange={onChange} ariaLabel="fruit">
        <option value="x">Xigua</option>
        <option value="y" disabled>Yuzu</option>
      </Select>,
    );
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('Xigua');
    open();
    expect(screen.getByRole('option', { name: 'Yuzu' })).toHaveAttribute('aria-disabled', 'true');
    // A disabled option does not commit.
    fireEvent.click(screen.getByRole('option', { name: 'Yuzu' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a divider that is not an announced option and is skipped by nav', () => {
    const onChange = vi.fn();
    const withDivider = [
      { value: 'a', label: 'Apple' },
      { value: '__sep__', label: '', divider: true },
      { value: 'b', label: 'Banana' },
    ];
    render(<Select value="a" onChange={onChange} options={withDivider} ariaLabel="fruit" />);
    const listbox = open();
    // The divider is not exposed as an option.
    expect(screen.getAllByRole('option')).toHaveLength(2);
    // ArrowDown from Apple skips the divider and lands on Banana.
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders a header as a non-option heading that nav and clicks skip', () => {
    const onChange = vi.fn();
    const grouped = [
      { value: '', label: 'Fruit', header: true },
      { value: 'a', label: 'Apple' },
      { value: '', label: 'Veg', header: true },
      { value: 'b', label: 'Beet' },
    ];
    render(<Select value="a" onChange={onChange} options={grouped} ariaLabel="fruit" />);
    const listbox = open();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(within(listbox).getByText('Veg')).toBeInTheDocument();
    fireEvent.click(within(listbox).getByText('Veg'));
    expect(onChange).not.toHaveBeenCalled();
    // ArrowDown from Apple skips the Veg header and lands on Beet.
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('never selects a header whose value equals the current value', () => {
    const grouped = [
      { value: '', label: 'Heading', header: true },
      { value: '', label: 'None' },
      { value: 'a', label: 'Apple' },
    ];
    render(<Select value="" onChange={vi.fn()} options={grouped} ariaLabel="fruit" />);
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('None');
    expect(screen.getByRole('button', { name: 'fruit' })).not.toHaveTextContent('Heading');
    const listbox = open();
    expect(within(listbox).getByRole('option', { selected: true })).toHaveTextContent('None');
  });

  it('typeahead does not land on a header', () => {
    const onChange = vi.fn();
    const grouped = [
      { value: '', label: 'Veg', header: true },
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Vine' },
    ];
    render(<Select value="a" onChange={onChange} options={grouped} ariaLabel="fruit" />);
    const listbox = open();
    fireEvent.keyDown(listbox, { key: 'v' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not open when disabled', () => {
    render(<Select value="a" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'fruit' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows placeholder when value matches no option', () => {
    render(<Select value="" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" placeholder="Pick one" />);
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('Pick one');
  });

  it('shows selected label (not placeholder) when value matches an option', () => {
    render(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" placeholder="Pick one" />);
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('Banana');
  });
});

// The in-menu search field is gated on a keyboard/pointer device
// (`(hover: hover) and (pointer: fine)`), which jsdom lacks by default. Stub
// matchMedia to that class so the gate is on, as it is on a desktop.
describe('Select in-menu search', () => {
  const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Grape', 'Mango', 'Orange', 'Peach', 'Pear']
    .map((label, i) => ({ value: `f${i}`, label }));

  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('grows a focused search field once the list reaches the threshold', () => {
    render(<Select value="f0" onChange={vi.fn()} options={FRUITS} ariaLabel="fruit" />);
    open();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('stays a plain dropdown below the threshold', () => {
    render(<Select value="a" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" />);
    open();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('substring-filters options as you type', () => {
    render(<Select value="f0" onChange={vi.fn()} options={FRUITS} ariaLabel="fruit" />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ap' } });
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Apple', 'Apricot', 'Grape']);
  });

  it('walks the filtered list with arrows while the field keeps focus, and commits on Enter', () => {
    const onChange = vi.fn();
    render(<Select value="f0" onChange={onChange} options={FRUITS} ariaLabel="fruit" />);
    open();
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'ap' } });
    // Active resets to the first match (Apple); ArrowDown → Apricot.
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveFocus();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('f1');
  });

  it('shows a no-results message and commits nothing when the query matches none', () => {
    const onChange = vi.fn();
    render(<Select value="f0" onChange={onChange} options={FRUITS} ariaLabel="fruit" />);
    open();
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops dividers from the filtered results', () => {
    const withDivider = [
      ...FRUITS.slice(0, 5),
      { value: '__sep__', label: '', divider: true },
      ...FRUITS.slice(5),
    ];
    render(<Select value="f0" onChange={vi.fn()} options={withDivider} ariaLabel="fruit" />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a' } });
    const labels = screen.getAllByRole('option').map(o => o.textContent);
    expect(labels).not.toContain('');
    expect(labels).toEqual(['Apple', 'Apricot', 'Banana', 'Grape', 'Mango', 'Orange', 'Peach', 'Pear']);
  });

  it('keeps a header only when an option in its group matches', () => {
    const grouped = [
      { value: '', label: 'Output', header: true },
      ...FRUITS.slice(0, 4).map(f => ({ ...f })),
      { value: '', label: 'Input', header: true },
      ...FRUITS.slice(4),
    ];
    render(<Select value="f0" onChange={vi.fn()} options={grouped} ariaLabel="fruit" />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'apple' } });
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.queryByText('Input')).toBeNull();
  });

  it('does not count headers toward the search threshold', () => {
    const grouped = [
      { value: '', label: 'H1', header: true },
      ...FRUITS.slice(0, 5),
      { value: '', label: 'H2', header: true },
      ...FRUITS.slice(5, 7),
    ];
    render(<Select value="f0" onChange={vi.fn()} options={grouped} ariaLabel="fruit" />);
    open();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('Select action rows', () => {
  it('runs the action on click and Enter without committing, closing or moving the selection', () => {
    const onChange = vi.fn();
    const onAction = vi.fn();
    render(
      <Select
        value="a" onChange={onChange} ariaLabel="fruit"
        options={[...OPTIONS, { value: '', label: 'Load more', onAction }]}
      />,
    );
    const list = open();
    const row = within(list).getByRole('option', { name: 'Load more' });
    fireEvent.click(row);
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'Apple' }).getAttribute('aria-selected')).toBe('true');
  });

  it('ignores activation while busy', () => {
    const onAction = vi.fn();
    render(<Select value="a" onChange={vi.fn()} ariaLabel="fruit" options={[...OPTIONS, { value: '', label: 'Loading', onAction, busy: true }]} />);
    const row = within(open()).getByRole('option', { name: 'Loading' });
    expect(row.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(row);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('Select action rows and in-place option changes', () => {
  it('never marks an action row selected, even when its value equals the current value', () => {
    render(<Select value="" onChange={vi.fn()} ariaLabel="fruit" options={[...OPTIONS, { value: '', label: 'Load more', onAction: vi.fn() }]} />);
    const row = within(open()).getByRole('option', { name: 'Load more' });
    expect(row.getAttribute('aria-selected')).toBe('false');
  });

  it('clears the active row when options are replaced while open, so Enter commits nothing', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Select value="zzz" onChange={onChange} ariaLabel="fruit" options={[...OPTIONS, { value: '', label: 'Load more', onAction: vi.fn() }]} />);
    const list = open();
    rerender(<Select value="zzz" onChange={onChange} ariaLabel="fruit" options={[...OPTIONS, { value: 'd', label: 'Date' }, { value: 'e', label: 'Elder' }]} />);
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
});

describe('Select action row button look', () => {
  it('shows the spinner only while busy, inside the same option', () => {
    const { rerender } = render(<Select value="a" onChange={vi.fn()} ariaLabel="fruit" options={[...OPTIONS, { value: '', label: 'Load', onAction: vi.fn() }]} />);
    let row = within(open()).getByRole('option', { name: 'Load' });
    expect(within(row).queryByRole('img', { hidden: true })).toBeNull();
    rerender(<Select value="a" onChange={vi.fn()} ariaLabel="fruit" options={[...OPTIONS, { value: '', label: 'Load', busyLabel: 'Loading', onAction: vi.fn(), busy: true }]} />);
    row = within(screen.getByRole('listbox')).getByRole('option', { name: 'Loading' });
    expect(within(row).getByRole('img', { hidden: true })).toBeTruthy();
    expect(row.getAttribute('aria-busy')).toBe('true');
    expect(row.getAttribute('aria-selected')).toBe('false');
    expect(row.getAttribute('aria-describedby')).toBeNull();
    // The idle label stays in the DOM (hidden by CSS) to hold the button size.
    const label = within(row).getByText('Load');
    expect(label.parentElement?.className).toMatch(/actionButtonBusy/);
  });

  it('falls back to the label as the busy accessible name', () => {
    render(<Select value="a" onChange={vi.fn()} ariaLabel="fruit" options={[...OPTIONS, { value: '', label: 'Load', onAction: vi.fn(), busy: true }]} />);
    expect(within(open()).getByRole('option', { name: 'Load' }).getAttribute('aria-busy')).toBe('true');
  });
});

describe('Select in-place option swaps', () => {
  const load = { value: '', label: 'Load', onAction: vi.fn() };

  it('with a search active, Enter after the list grows commits nothing', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ value: `f${i}`, label: `Font ${i}` }));
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(hover: hover) and (pointer: fine)', media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
    const onChange = vi.fn();
    const { rerender } = render(<Select value="zzz" onChange={onChange} ariaLabel="fruit" options={[...many, load]} />);
    const list = open();
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'font' } });
    rerender(<Select value="zzz" onChange={onChange} ariaLabel="fruit" options={[...many, { value: 'x', label: 'Font X' }]} />);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(list.isConnected).toBe(true);
    vi.unstubAllGlobals();
  });

  it('a same-count swap resets the active row', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Select value="zzz" onChange={onChange} ariaLabel="fruit" options={[...OPTIONS, load]} />);
    const list = open();
    rerender(<Select value="zzz" onChange={onChange} ariaLabel="fruit" options={[...OPTIONS, { value: 'd', label: 'Date' }]} />);
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
