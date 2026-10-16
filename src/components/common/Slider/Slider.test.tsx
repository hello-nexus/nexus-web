import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  describe('end-of-drag commit', () => {
    afterEach(() => { vi.useRealTimers(); });

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

    it('commits once, not twice, when the pointer is released on the slider', () => {
      vi.useFakeTimers();
      const { onCommit, range } = mountSlider();
      fireEvent.pointerDown(range);
      fireEvent.change(range, { target: { value: '55' } });
      fireEvent.pointerUp(range);
      vi.runAllTimers();
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

    it('does not commit again for a later stray release', () => {
      vi.useFakeTimers();
      const { onCommit, range } = mountSlider();
      fireEvent.pointerDown(range);
      fireEvent.pointerUp(range);
      vi.runAllTimers();
      expect(onCommit).toHaveBeenCalledTimes(1);
      fireEvent.pointerUp(document.body);
      vi.runAllTimers();
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    // jsdom has no PointerEvent with an id or button, so build the events by hand.
    const press = (el: Element, type: string, props: { pointerId?: number; button?: number }) => {
      const ev = new Event(type, { bubbles: true });
      Object.defineProperties(ev, {
        pointerId: { value: props.pointerId },
        button: { value: props.button ?? 0 },
      });
      fireEvent(el, ev);
    };

    it('ignores another pointer lifting, and commits when the pressing pointer lifts', () => {
      vi.useFakeTimers();
      const { onCommit, range } = mountSlider();
      press(range, 'pointerdown', { pointerId: 1 });
      fireEvent.change(range, { target: { value: '60' } });
      press(document.body, 'pointerup', { pointerId: 2 });
      vi.runAllTimers();
      expect(onCommit).not.toHaveBeenCalled();
      press(document.body, 'pointerup', { pointerId: 1 });
      vi.runAllTimers();
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(60);
    });

    it('a secondary-button press does not arm a window release', () => {
      vi.useFakeTimers();
      const { onCommit, range } = mountSlider();
      press(range, 'pointerdown', { pointerId: 1, button: 2 });
      fireEvent.change(range, { target: { value: '60' } });
      press(document.body, 'pointerup', { pointerId: 1, button: 2 });
      vi.runAllTimers();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('losing focus mid-drag does not end it: the real release still commits', () => {
      vi.useFakeTimers();
      const { onCommit, range } = mountSlider();
      press(range, 'pointerdown', { pointerId: 1 });
      fireEvent.change(range, { target: { value: '45' } });
      fireEvent.blur(range);
      vi.runAllTimers();
      expect(onCommit).not.toHaveBeenCalled();
      press(document.body, 'pointerup', { pointerId: 1 });
      vi.runAllTimers();
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(45);
    });

    it('commits once when pointer capture is lost with no release', () => {
      vi.useFakeTimers();
      const { onCommit, range } = mountSlider();
      press(range, 'pointerdown', { pointerId: 1 });
      fireEvent.change(range, { target: { value: '65' } });
      press(range, 'lostpointercapture', { pointerId: 1 });
      vi.runAllTimers();
      press(document.body, 'pointerup', { pointerId: 1 });
      vi.runAllTimers();
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('never commits when it is disabled mid-drag, or when it unmounts mid-drag', () => {
      vi.useFakeTimers();
      const onCommit = vi.fn();
      const view = render(<Slider value={10} min={0} max={100} ariaLabel="Level" onChange={() => {}} onCommit={onCommit} />);
      press(screen.getByRole('slider'), 'pointerdown', { pointerId: 1 });
      fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
      view.rerender(<Slider value={10} min={0} max={100} ariaLabel="Level" disabled onChange={() => {}} onCommit={onCommit} />);
      press(document.body, 'pointerup', { pointerId: 1 });
      vi.runAllTimers();
      expect(onCommit).not.toHaveBeenCalled();

      view.rerender(<Slider value={10} min={0} max={100} ariaLabel="Level" onChange={() => {}} onCommit={onCommit} />);
      press(screen.getByRole('slider'), 'pointerdown', { pointerId: 2 });
      view.unmount();
      press(document.body, 'pointerup', { pointerId: 2 });
      vi.runAllTimers();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('commits on a key release, once', async () => {
      const { onCommit, range } = mountSlider();
      fireEvent.change(range, { target: { value: '30' } });
      fireEvent.keyUp(range);
      await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    });
  });

  describe('stacked with a label action', () => {
    const renderWithAction = (onAction: () => void) => render(
      <Slider orientation="stacked" editable label="Angle" value={40} min={0} max={100} onChange={() => {}}
        labelAction={<button type="button" onClick={onAction}>pin</button>} />,
    );

    it('opens the value for editing without pressing the action', () => {
      const onAction = vi.fn();
      renderWithAction(onAction);
      // A browser forwards a click inside a label to the label's first labelable descendant (jsdom does not for this target).
      expect(screen.getByRole('button', { name: '40' }).closest('label')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '40' }));
      expect(onAction).not.toHaveBeenCalled();
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it('does not press the action from a click on the name, which still names the range', () => {
      const onAction = vi.fn();
      renderWithAction(onAction);
      fireEvent.click(screen.getByText('Angle'));
      expect(onAction).not.toHaveBeenCalled();
      expect(screen.getByRole('slider', { name: 'Angle' })).toBeInTheDocument();
    });
  });
});

describe('Slider mixed', () => {
  it('shows the mixed label, an unfilled track and a spoken value, and still takes a drag', () => {
    const onChange = vi.fn();
    render(<Slider value={40} min={0} max={100} ariaLabel="Level" mixed mixedLabel="Mixed" editable onChange={onChange} />);
    const range = screen.getByRole('slider', { name: 'Level' });

    expect(screen.getByText('Mixed')).toBeInTheDocument();
    expect(range).toHaveAttribute('data-mixed', 'true');
    expect(range).toHaveAttribute('aria-valuetext', 'Mixed');
    expect(range.style.getPropertyValue('--slider-fill-end')).toBe('0%');

    fireEvent.change(range, { target: { value: '60' } });
    expect(onChange).toHaveBeenCalledWith(60, false);
  });

  it('keeps the editable field while mixed: empty, and a typed value commits even if it matches', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<Slider value={40} min={0} max={100} ariaLabel="Level" mixed mixedLabel="Mixed" editable onChange={onChange} onCommit={onCommit} />);
    fireEvent.click(screen.getByText('Mixed'));
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input).toHaveAttribute('placeholder', 'Mixed');

    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(40, true);
    expect(onCommit).toHaveBeenCalledWith(40);
  });

  it('commits nothing when the empty mixed field is left or confirmed untouched', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<Slider value={40} min={0} max={100} ariaLabel="Level" mixed mixedLabel="Mixed" editable onChange={onChange} onCommit={onCommit} />);

    fireEvent.click(screen.getByText('Mixed'));
    fireEvent.blur(screen.getByRole('spinbutton'));
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Mixed'));
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('renders normally when not mixed', () => {
    render(<Slider value={40} min={0} max={100} ariaLabel="Level" trackFill onChange={() => {}} />);
    const range = screen.getByRole('slider', { name: 'Level' });
    expect(range).not.toHaveAttribute('data-mixed');
    expect(range.style.getPropertyValue('--slider-fill-end')).toBe('calc(7px + (100% - 14px) * 0.4)');
  });
});

// The thumb's centre stops half a thumb (14px) short of each end of the track, so a value sits
// that far along the thumb's path. The fill, the zero tick, the band and the marker follow it.
describe('Slider positions on the thumb path', () => {
  const path = (fraction: number) => `calc(7px + (100% - 14px) * ${fraction})`;

  it('fills a level slider from the track start to under the thumb', () => {
    render(<Slider value={40} min={0} max={100} ariaLabel="Level" trackFill onChange={() => {}} />);
    const range = screen.getByRole('slider', { name: 'Level' });
    expect(range.style.getPropertyValue('--slider-fill-start')).toBe('0%');
    expect(range.style.getPropertyValue('--slider-fill-end')).toBe(path(0.4));
  });

  it('starts a centre-out fill where the thumb sits at 0 when 0 is not the middle', () => {
    render(<Slider value={-5} min={-25} max={75} ariaLabel="Gain" onChange={() => {}} />);
    const range = screen.getByRole('slider', { name: 'Gain' });
    expect(range.style.getPropertyValue('--slider-fill-start')).toBe(path(0.2));
    expect(range.style.getPropertyValue('--slider-fill-end')).toBe(path(0.25));
  });

  it('puts the dimmed part of a capped fill on the same path', () => {
    render(<Slider value={80} min={0} max={100} ariaLabel="Level" trackFill fillCap={60} onChange={() => {}} />);
    const range = screen.getByRole('slider', { name: 'Level' });
    expect(range.style.getPropertyValue('--slider-fill-cap')).toBe(path(0.6));
  });

  it('places the zero tick, band and marker together in a box beside the range', () => {
    const { container } = render(
      <Slider value={10} min={-25} max={75} ariaLabel="Gain" zeroMarker band={[0, 50]} marker={50} onChange={() => {}} />,
    );
    const range = screen.getByRole('slider', { name: 'Gain' });
    const placed = [...container.querySelectorAll<HTMLElement>('span[style*="left"]')];
    expect(placed.map(el => el.style.left)).toEqual(['25%', '25%', '75%']);
    const box = placed[0].parentElement;
    expect(placed.every(el => el.parentElement === box)).toBe(true);
    expect(box).not.toBe(range.parentElement);
    expect(box?.parentElement).toBe(range.parentElement);
  });
});
