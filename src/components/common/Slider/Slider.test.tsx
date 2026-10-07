import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from './Slider';

describe('Slider', () => {
  it('fires onCommit when a value is typed into the editable field', async () => {
    // A typed edit has no drag-end, so without this the value landed in state
    // and consumers that apply/persist in onCommit (the effect editor applies
    // the shader and refreshes its thumbnail there) never ran.
    const onChange = vi.fn();
    const onCommit = vi.fn();

    render(
      <Slider
        label="Position"
        value={10}
        min={0}
        max={100}
        editable
        ariaLabel="Position"
        onChange={onChange}
        onCommit={onCommit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Position' }));
    // The range input carries the same aria-label, so select the typed field
    // by its role rather than by label.
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '75' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(75, true);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(75));
  });

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

  it('draws marks at their value with captions, without intercepting the slider', () => {
    const onChange = vi.fn();
    render(
      <Slider value={50} min={0} max={200} ariaLabel="Level" onChange={onChange}
        marks={[{ value: 50, label: 'Half' }, { value: 200 }]} />,
    );
    expect((screen.getByText('Half').parentElement as HTMLElement).style.left).toBe('25%');
    // The range input is still the control that changes the value.
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    expect(onChange).toHaveBeenCalledWith(60, false);
  });

  it('renders no mark elements when marks is omitted', () => {
    const { container } = render(<Slider value={5} min={0} max={10} ariaLabel="Level" onChange={() => {}} />);
    expect(container.querySelector('[style*="left"]')).toBeNull();
  });

  describe('end-of-drag commit', () => {
    const mountSlider = () => {
      const onCommit = vi.fn();
      render(<Slider value={10} min={0} max={100} ariaLabel="Level" onChange={() => {}} onCommit={onCommit} />);
      return { onCommit, range: screen.getByRole('slider') };
    };

    it('commits once when the pointer is released outside the slider', async () => {
      const { onCommit, range } = mountSlider();
      fireEvent.pointerDown(range);
      fireEvent.change(range, { target: { value: '40' } });
      fireEvent.pointerUp(document.body);
      await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
      expect(onCommit).toHaveBeenCalledWith(40);
    });

    it('commits once, not twice, when the pointer is released on the slider', async () => {
      const { onCommit, range } = mountSlider();
      fireEvent.pointerDown(range);
      fireEvent.change(range, { target: { value: '55' } });
      fireEvent.pointerUp(range);
      await new Promise(r => setTimeout(r, 20));
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(55);
    });

    it('commits once for a cancelled pointer', async () => {
      const { onCommit, range } = mountSlider();
      fireEvent.pointerDown(range);
      fireEvent.change(range, { target: { value: '70' } });
      fireEvent.pointerCancel(document.body);
      await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    });

    it('still commits a release it never saw start', async () => {
      const { onCommit, range } = mountSlider();
      fireEvent.change(range, { target: { value: '20' } });
      fireEvent.pointerUp(range);
      await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    });

    it('does not commit again for a later stray release', async () => {
      const { onCommit, range } = mountSlider();
      fireEvent.pointerDown(range);
      fireEvent.pointerUp(range);
      await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
      fireEvent.pointerUp(document.body);
      await new Promise(r => setTimeout(r, 20));
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('commits on a key release, once', async () => {
      const { onCommit, range } = mountSlider();
      fireEvent.change(range, { target: { value: '30' } });
      fireEvent.keyUp(range);
      await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    });
  });
});
