import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipGroup } from './ChipGroup';

const OPTIONS = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Bravo' },
  { key: 'c', label: 'Charlie' },
];

describe('ChipGroup single-select', () => {
  // A one-of-N choice is a radiogroup: aria-pressed toggle buttons would let AT
  // read the options as independent switches.
  it('exposes the options as radios in a radiogroup', () => {
    render(<ChipGroup ariaLabel="Letters" options={OPTIONS} activeKey="b" onChange={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: 'Letters' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
  });

  // One tab stop for the whole group, on the checked option.
  it('puts the tab stop on the checked chip', () => {
    render(<ChipGroup options={OPTIONS} activeKey="c" onChange={vi.fn()} />);

    const radios = screen.getAllByRole('radio');
    expect(radios.map(r => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('falls back to the first selectable chip when nothing is checked', () => {
    render(<ChipGroup options={OPTIONS} activeKey="" onChange={vi.fn()} />);

    expect(screen.getAllByRole('radio').map(r => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('selects the next chip on arrow key and wraps', () => {
    const onChange = vi.fn();
    render(<ChipGroup ariaLabel="Letters" options={OPTIONS} activeKey="c" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('a');

    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('skips disabled chips when arrowing', () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        ariaLabel="Letters"
        options={[OPTIONS[0], { ...OPTIONS[1], disabled: true }, OPTIONS[2]]}
        activeKey="a"
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('still selects on click', () => {
    const onChange = vi.fn();
    render(<ChipGroup options={OPTIONS} activeKey="a" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Bravo' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('ChipGroup multi-select', () => {
  // Independent toggles, so these stay pressed-state buttons in a plain group.
  it('keeps toggle-button semantics', () => {
    render(
      <ChipGroup
        ariaLabel="Letters"
        multiSelect
        options={OPTIONS}
        activeKeys={new Set(['a', 'c'])}
        onToggleKey={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Letters' })).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const pressed = screen.getAllByRole('button').map(b => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['true', 'false', 'true']);
  });

  it('does not hijack arrow keys', () => {
    const onToggleKey = vi.fn();
    render(
      <ChipGroup
        ariaLabel="Letters"
        multiSelect
        options={OPTIONS}
        activeKeys={new Set()}
        onToggleKey={onToggleKey}
      />,
    );

    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight' });
    expect(onToggleKey).not.toHaveBeenCalled();
  });
});
