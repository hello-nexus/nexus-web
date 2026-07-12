// Tester view tests - local-mode capture (no HID driver wired yet). Verifies
// keydown is captured into the latest panel + history, repeat events are
// ignored, and Reset clears state. Copy is asserted against locale keys via
// the key-echo i18n mock.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KeebTesterView } from './KeebTesterView';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

afterEach(() => { cleanup(); });

describe('KeebTesterView - local-mode key capture', () => {
  it('renders the Local Mode explainer when no keys have been pressed', () => {
    render(<KeebTesterView />);
    expect(screen.getByText('keeb.tester.localMode')).toBeInTheDocument();
    expect(screen.getByText('keeb.tester.empty')).toBeInTheDocument();
  });

  it('a keydown updates the Latest panel + adds a history row', () => {
    render(<KeebTesterView />);
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    // Single-char keys render as uppercase per the view's normalization.
    expect(screen.queryByText('keeb.tester.empty')).toBeNull();
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);
  });

  it('repeats do NOT pile new rows into the history', () => {
    render(<KeebTesterView />);
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA', repeat: true });
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA', repeat: true });
    // Should be exactly one captured 'A' entry (latest + history row both
    // show it, but the history list itself only has one row for it).
    const rowsWithA = screen.getAllByText(/^A · KeyA$/);
    expect(rowsWithA.length).toBe(1);
  });

  it('Reset button clears the captured history and Latest panel', () => {
    render(<KeebTesterView />);
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'keeb.tester.reset' }));
    expect(screen.getByText('keeb.tester.empty')).toBeInTheDocument();
  });

  it('detaches the keydown listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    try {
      const { unmount } = render(<KeebTesterView />);
      const handler = addSpy.mock.calls.find(([type]) => type === 'keydown')?.[1];
      expect(handler).toBeDefined();

      unmount();
      expect(removeSpy.mock.calls.some(
        ([type, fn]) => type === 'keydown' && fn === handler,
      )).toBe(true);
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});
