import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker, placePopupVertically } from './DatePicker';

// Mirrors the Enter-to-confirm idiom a caller like ConfirmModal wires on an
// ancestor via a bubble-phase keydown listener (see modalStack.ts).
function renderInsideKeyListener(onKey: (key: string) => void) {
  return render(
    <div onKeyDown={e => onKey(e.key)}>
      <DatePicker value="2026-08-15" onChange={vi.fn()} ariaLabel="Pick a date" />
    </div>,
  );
}

describe('DatePicker - Enter key propagation', () => {
  it('does not let Enter on the trigger reach an ancestor keydown listener', () => {
    const onKey = vi.fn();
    renderInsideKeyListener(onKey);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Pick a date' }), { key: 'Enter' });

    expect(onKey).not.toHaveBeenCalled();
  });

  it('does not let Enter on an open day cell reach an ancestor keydown listener', () => {
    const onKey = vi.fn();
    renderInsideKeyListener(onKey);

    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '15' }), { key: 'Enter' });

    expect(onKey).not.toHaveBeenCalled();
  });

  it('still lets other keys reach the ancestor listener', () => {
    const onKey = vi.fn();
    renderInsideKeyListener(onKey);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Pick a date' }), { key: 'a' });

    expect(onKey).toHaveBeenCalledWith('a');
  });
});

describe('placePopupVertically', () => {
  it('opens below when the popup fits', () => {
    expect(placePopupVertically(100, 130, 300, 800)).toEqual({ above: false });
  });

  it('flips above when only the top has room', () => {
    expect(placePopupVertically(500, 530, 300, 600)).toEqual({ above: true });
  });

  it('caps the height to the roomier side when neither side fits', () => {
    expect(placePopupVertically(127, 157, 310, 450)).toEqual({ above: false, maxHeight: 450 - 157 - 6 - 8 });
    expect(placePopupVertically(300, 330, 400, 450)).toEqual({ above: true, maxHeight: 300 - 6 - 8 });
  });
});
