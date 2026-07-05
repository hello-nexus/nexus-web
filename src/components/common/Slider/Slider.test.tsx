import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from './Slider';

describe('Slider', () => {
  it('commits the latest changed value when pointer-up sees a stale range value', async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();

    render(
      <Slider
        label="Opacity"
        value={100}
        min={0}
        max={100}
        ariaLabel="Opacity"
        onChange={onChange}
        onCommit={onCommit}
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Opacity' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '50' } });
    slider.value = '100';
    fireEvent.pointerUp(slider);

    expect(onChange).toHaveBeenCalledWith(50, false);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(50));
  });

  it('lets an input event that lands after pointer-up win before commit', async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();

    render(
      <Slider
        label="Widget opacity"
        value={100}
        min={0}
        max={100}
        ariaLabel="Widget opacity"
        onChange={onChange}
        onCommit={onCommit}
      />,
    );

    const slider = screen.getByRole('slider', { name: 'Widget opacity' }) as HTMLInputElement;
    fireEvent.pointerUp(slider);
    fireEvent.change(slider, { target: { value: '35' } });

    expect(onChange).toHaveBeenCalledWith(35, false);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(35));
  });

  it('inline editable value opens a number input on click', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Slider orientation="inline" editable label="Level" value={80} min={0} max={100}
        formatValue={v => `${v}%`} ariaLabel="Level" onChange={onChange} />,
    );
    // The inline root must NOT be a <label>: a label forwards a value click to
    // the range input and steals focus from the edit input (reverts it).
    expect(container.querySelector('label')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Level' }));
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('a typed + committed value fires onChange with commit=true (so parents can persist)', () => {
    const onChange = vi.fn();
    render(
      <Slider orientation="inline" editable label="Level" value={80} min={0} max={100}
        formatValue={v => `${v}%`} ariaLabel="Level" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Level' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Editable commits route through onChange(v, true), NOT onCommit; parents
    // that only persist in onCommit would silently drop typed edits.
    expect(onChange).toHaveBeenCalledWith(42, true);
  });
});
