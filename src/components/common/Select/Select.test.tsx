import { render, screen, fireEvent } from '@testing-library/react';
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

describe('Select', () => {
  it('shows the selected option label on the trigger', () => {
    render(<Select value="b" onChange={vi.fn()} options={OPTIONS} ariaLabel="fruit" />);
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('Banana');
    expect(screen.queryByRole('listbox')).toBeNull();
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
});
