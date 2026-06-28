import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
