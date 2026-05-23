// Tester view tests — local-mode capture (no HID driver wired yet). Verifies
// keydown is captured into the latest panel + history, repeat events are
// ignored, and Reset clears state.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KeebTesterView } from './KeebTesterView';

afterEach(() => { cleanup(); });

describe('KeebTesterView — local-mode key capture', () => {
  it('renders the Local Mode explainer when no keys have been pressed', () => {
    render(<KeebTesterView open />);
    expect(screen.getByText(/Local Mode/)).toBeInTheDocument();
    expect(screen.getByText(/Press any key to populate the history/i)).toBeInTheDocument();
  });

  it('a keydown updates the Latest panel + adds a history row', () => {
    render(<KeebTesterView open />);
    fireEvent.keyDown(window, { key: 'a', keyCode: 65 });
    // Single-char keys render as uppercase per the view's normalization.
    expect(screen.queryByText(/Press any key to populate the history/i)).toBeNull();
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);
  });

  it('repeats do NOT pile new rows into the history', () => {
    render(<KeebTesterView open />);
    fireEvent.keyDown(window, { key: 'a', keyCode: 65 });
    fireEvent.keyDown(window, { key: 'a', keyCode: 65, repeat: true });
    fireEvent.keyDown(window, { key: 'a', keyCode: 65, repeat: true });
    // Should be exactly one captured 'A' entry (latest + history row both
    // show it, but the history list itself only has one row for it).
    const rowsWithA = screen.getAllByText(/^A \(kc 65\)$/);
    expect(rowsWithA.length).toBe(1);
  });

  it('Reset button clears the captured history and Latest panel', () => {
    render(<KeebTesterView open />);
    fireEvent.keyDown(window, { key: 'a', keyCode: 65 });
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(screen.getByText(/Press any key to populate the history/i)).toBeInTheDocument();
  });

  it('listener is detached when open prop flips false', () => {
    const { rerender } = render(<KeebTesterView open />);
    fireEvent.keyDown(window, { key: 'a', keyCode: 65 });
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);

    rerender(<KeebTesterView open={false} />);
    // After re-render with open=false, further keys shouldn't be captured.
    fireEvent.keyDown(window, { key: 'b', keyCode: 66 });
    expect(screen.queryByText(/^B \(kc 66\)$/)).toBeNull();
  });
});
