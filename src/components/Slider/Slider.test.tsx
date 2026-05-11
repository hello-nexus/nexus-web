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
});
