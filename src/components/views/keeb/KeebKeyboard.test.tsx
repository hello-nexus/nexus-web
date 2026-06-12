// Render tests for the keeb keyboard graphic. Asserts the visual classes
// land on the right positional cells, the wheels are clickable on row 0,
// and the user-facing layer key (function name on every cell) actually
// renders for the canonical default state. Wheel aria-labels resolve through
// the key-echo i18n mock, so queries use the keeb.keyboard.* locale keys.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { KeyboardState } from '../../../api/keeb';
import { KeebKeyboard, type KeebSelection } from './KeebKeyboard';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

function buildState(overrides: Partial<KeyboardState> = {}): KeyboardState {
  return {
    isConnected: true,
    profile: 0,
    layout: 'ANSI',
    layer: 0,
    keys: [],
    ...overrides,
  };
}

describe('KeebKeyboard - render', () => {
  it('renders every layout cell as a button with its function in the title attribute', () => {
    const { container } = render(<KeebKeyboard state={buildState()} />);
    // ANSI cell count by row:
    //   0:1 (RGB)  1:9 (media)  2:18 (Esc + F12 + nav + None/PassThrough)
    //   3:21 (numbers + Backspace + Ins/Home/PgUp + NumLock-row of numpad)
    //   4:21 (Tab/QWERTY top + Backslash + Del/End/PgDn + numpad row + KeypadPlus)
    //   5:16 (CapsLock + ASDF + Return + numpad row)
    //   6:17 (LeftShift + ZXC + RightShift + UpArrow + numpad + KeypadEqual)
    //   7:13 (bottom-row modifiers + Space + arrows + Keypad0 + KeypadPeriodDelete)
    // Total cells = 116, plus 2 wheel buttons = 118.
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(118);
  });

  it('renders the two rotary wheel buttons inline on row 0', () => {
    render(<KeebKeyboard state={buildState()} />);
    expect(screen.getByRole('button', { name: 'keeb.keyboard.leftWheel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'keeb.keyboard.rightWheel' })).toBeInTheDocument();
  });

  it('applies the middle-button visual class to the RGB-cycle key (row 0, col 0)', () => {
    const { container } = render(<KeebKeyboard state={buildState()} />);
    const rgb = container.querySelector('button[title="RGBEffectLoop"]') as HTMLButtonElement;
    expect(rgb).not.toBeNull();
    expect(rgb.className).toMatch(/keyMiddle/);
  });

  it('applies the media-key visual class to all 9 row-1 cells', () => {
    const { container } = render(<KeebKeyboard state={buildState()} />);
    const media = ['Stop', 'ScanPreviousTrack', 'PlayAndPause', 'ScanNextTrack', 'Mute', 'VolumeUp', 'VolumeDown', 'Rewind', 'FastForward'];
    for (const fn of media) {
      const btn = container.querySelector(`button[title="${fn}"]`) as HTMLButtonElement;
      expect(btn, fn).not.toBeNull();
      expect(btn.className, fn).toMatch(/keyMedia/);
    }
  });

  it('does NOT apply media/middle class to row 2+ keys (Esc, F1, Tab, etc.)', () => {
    const { container } = render(<KeebKeyboard state={buildState()} />);
    for (const fn of ['Escape', 'F1', 'Tab', 'A', 'LeftShift', 'Space']) {
      const btn = container.querySelector(`button[title="${fn}"]`) as HTMLButtonElement;
      expect(btn, fn).not.toBeNull();
      expect(btn.className, fn).not.toMatch(/keyMedia|keyMiddle/);
    }
  });

  it('strips position:absolute and left: from row-0 cell styles (RGBEffectLoop)', () => {
    const { container } = render(<KeebKeyboard state={buildState()} />);
    const rgb = container.querySelector('button[title="RGBEffectLoop"]') as HTMLButtonElement;
    expect(rgb.style.position).toBe('');
    expect(rgb.style.left).toBe('');
  });

  it('forwards inline width/margin from the layout data (e.g. Backspace, Tab, Space, KeypadPlus)', () => {
    const { container } = render(<KeebKeyboard state={buildState()} />);
    const bs = container.querySelector('button[title="Backspace"]') as HTMLButtonElement;
    const tab = container.querySelector('button[title="Tab"]') as HTMLButtonElement;
    const space = container.querySelector('button[title="Space"]') as HTMLButtonElement;
    const kp = container.querySelector('button[title="KeypadPlus"]') as HTMLButtonElement;
    expect(bs.style.width).toBe('205px');
    expect(bs.style.marginRight).toBe('30px');
    expect(tab.style.width).toBe('140px');
    expect(space.style.width).toBe('508px');
    expect(kp.style.height).toBe('145px');
    expect(kp.style.marginTop).toBe('80px');
  });

  it('renders ANSI Backslash on row 4, ISO Return instead', () => {
    const { container: ansi } = render(<KeebKeyboard state={buildState({ layout: 'ANSI' })} />);
    expect(ansi.querySelector('button[title="Backslash"]')).not.toBeNull();

    const { container: iso } = render(<KeebKeyboard state={buildState({ layout: 'ISO' })} />);
    // ISO has a Return on row 4 (the wide enter top half) AND no row-4 Backslash.
    expect(iso.querySelectorAll('button[title="Return"]').length).toBeGreaterThanOrEqual(1);
    // ISO has one fewer Backslash than ANSI (still keeps NonUsBackslash on row 6).
    expect(iso.querySelector('button[title="Backslash"]')).toBeNull();
  });

  it('overlay appears when offlineCopy is set AND state.isConnected is false', () => {
    const { rerender } = render(
      <KeebKeyboard state={buildState({ isConnected: false })} offlineCopy="connect your keeb" />
    );
    expect(screen.getByText('connect your keeb')).toBeInTheDocument();

    rerender(<KeebKeyboard state={buildState({ isConnected: true })} offlineCopy="connect your keeb" />);
    expect(screen.queryByText('connect your keeb')).toBeNull();
  });

  it('uses the layer-state assigned function when present (overrides the printed legend)', () => {
    // Override row 2 col 1 (F1 default) with a Macro1 assignment from the
    // firmware. The cell's `title` should reflect the assigned function, not
    // the default.
    const keys = Array.from({ length: 8 }, () => [] as { mode: string; function: string; input: number | null }[]);
    keys[2] = [
      { mode: 'StandardKey', function: 'Escape', input: null },
      { mode: 'MacroKey', function: 'Macro1', input: 1 },
    ];
    const { container } = render(<KeebKeyboard state={buildState({ keys })} />);
    // The button at row 2 col 1 should show Macro1, not F1.
    const buttons = container.querySelectorAll('button[title="Macro1"]');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('with `useDefaults`, ignores state.keys assignments and renders the printed-legend layout', () => {
    // Same override as the previous test, but `useDefaults` should make the
    // rendered button title revert to F1 (the printed default at row 2 col 1).
    const keys = Array.from({ length: 8 }, () => [] as { mode: string; function: string; input: number | null }[]);
    keys[2] = [
      { mode: 'StandardKey', function: 'Escape', input: null },
      { mode: 'MacroKey', function: 'Macro1', input: 1 },
    ];
    const { container } = render(<KeebKeyboard state={buildState({ keys })} useDefaults />);
    // F1 default should still render at (2, 1); the Macro1 override is suppressed.
    expect(container.querySelector('button[title="F1"]')).not.toBeNull();
    expect(container.querySelector('button[title="Macro1"]')).toBeNull();
  });
});

describe('KeebKeyboard - selection', () => {
  it('fires onSelect with the (x, y) when a key is clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(<KeebKeyboard state={buildState()} onSelect={onSelect} />);
    const a = container.querySelector('button[title="A"]') as HTMLButtonElement;
    fireEvent.click(a);
    // A is on row 5 col 1 in ANSI (CapsLock at col 0).
    expect(onSelect).toHaveBeenCalledWith({ kind: 'key', x: 5, y: 1 });
  });

  it('fires onSelect with the wheel side when a wheel is clicked', () => {
    const onSelect = vi.fn();
    render(<KeebKeyboard state={buildState()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'keeb.keyboard.leftWheel' }));
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'wheel', side: 'left' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.keyboard.rightWheel' }));
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'wheel', side: 'right' });
  });

  it('marks the selected key visually (and only that key)', () => {
    const selected: KeebSelection = { kind: 'key', x: 5, y: 1 };
    const { container } = render(<KeebKeyboard state={buildState()} selected={selected} />);
    const a = container.querySelector('button[title="A"]') as HTMLButtonElement;
    expect(a.className).toMatch(/keySelected/);
    // Other keys should NOT carry the selected class.
    const escape = container.querySelector('button[title="Escape"]') as HTMLButtonElement;
    expect(escape.className).not.toMatch(/keySelected/);
  });

  it('marks the selected wheel visually', () => {
    const { rerender } = render(<KeebKeyboard state={buildState()} selected={{ kind: 'wheel', side: 'left' }} />);
    const left = screen.getByRole('button', { name: 'keeb.keyboard.leftWheel' });
    const right = screen.getByRole('button', { name: 'keeb.keyboard.rightWheel' });
    expect(left.className).toMatch(/wheelSelected/);
    expect(right.className).not.toMatch(/wheelSelected/);

    rerender(<KeebKeyboard state={buildState()} selected={{ kind: 'wheel', side: 'right' }} />);
    expect(right.className).toMatch(/wheelSelected/);
    expect(left.className).not.toMatch(/wheelSelected/);
  });

  it('disables every clickable when `disabled` is set', () => {
    const { container } = render(<KeebKeyboard state={buildState()} disabled />);
    const allButtons = container.querySelectorAll('button');
    for (const btn of allButtons) {
      expect(btn.disabled, btn.title || btn.getAttribute('aria-label') || '?').toBe(true);
    }
  });
});
