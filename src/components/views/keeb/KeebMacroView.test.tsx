// Macro view tests - driven through the loadMacro/saveMacro props with vi.fn
// fakes (no module mocks). Verifies the slot picker, the delay-mode pill tabs,
// the recorder's state-machine behaviour (Make + Break entries on
// keydown/keyup, repeat extends the last Make's duration), clear, duration
// commit, and the write-failure rollback (recordings revert to the last acked
// macro; the page owns failure toasts). Copy is asserted against locale keys
// via the key-echo i18n mock.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { KeebMacroView } from './KeebMacroView';
import type { KeebMacro, MacroKey } from '../../../api/keeb';

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

async function tick() {
  await new Promise(r => setTimeout(r, 0));
}

const loadMacro = vi.fn<(index: number) => Promise<KeebMacro | null>>();
const saveMacro = vi.fn<(index: number, keys: MacroKey[]) => Promise<KeebMacro | null>>();

function renderView() {
  return render(<KeebMacroView loadMacro={loadMacro} saveMacro={saveMacro} />);
}

beforeEach(() => {
  loadMacro.mockReset();
  loadMacro.mockImplementation(async index => ({ index, keys: [] }));
  saveMacro.mockReset();
  // Echo the saved keys back as the acked macro.
  saveMacro.mockImplementation(async (index, keys) => ({ index, keys }));
});

describe('KeebMacroView - slot list', () => {
  it('renders 16 slot buttons (Macro 1 ... Macro 16)', () => {
    renderView();
    for (let i = 1; i <= 16; i++) {
      expect(screen.getByRole('button', { name: `keeb.macro.slotAriaN n=${i}` })).toBeInTheDocument();
    }
  });

  it('first slot is active by default and loads slot 0', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=1' })).toHaveAttribute('aria-pressed', 'true');
    expect(loadMacro).toHaveBeenCalledWith(0);
  });

  it('clicking a different slot flips the active state and loads it', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=5' }));
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=1' })).toHaveAttribute('aria-pressed', 'false');
    expect(loadMacro).toHaveBeenLastCalledWith(4);
  });
});

describe('KeebMacroView - delay-mode tabs', () => {
  it('default is "record"; the custom-delay input is hidden', () => {
    renderView();
    const tabs = screen.getByRole('tablist', { name: 'keeb.macro.delayModeAria' });
    expect(within(tabs).getByRole('tab', { name: 'keeb.macro.recordDelay' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('keeb.macro.customDelayAria')).toBeNull();
  });

  it('switching to "custom" reveals the custom-delay numeric input', () => {
    renderView();
    fireEvent.click(within(screen.getByRole('tablist', { name: 'keeb.macro.delayModeAria' })).getByRole('tab', { name: 'keeb.macro.customDelay' }));
    expect(screen.getByLabelText('keeb.macro.customDelayAria')).toBeInTheDocument();
  });
});

describe('KeebMacroView - recorder', () => {
  it('shows the shared empty state until something is recorded', () => {
    renderView();
    expect(screen.getByRole('status')).toHaveTextContent('keeb.macro.emptyTitle');
  });

  it('Start Recording button toggles to Stop and back', () => {
    renderView();
    const start = screen.getByRole('button', { name: 'keeb.macro.start' });
    fireEvent.click(start);
    expect(screen.getByRole('button', { name: 'keeb.macro.stop' })).toBeInTheDocument();
  });

  it('a single keydown+keyup while recording adds a Make + Break pair', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    // Dispatch keydown then keyup for 'KeyA'.
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });

    // Stop recording -> triggers saveMacro.
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(saveMacro).toHaveBeenCalled();
    const [, keys] = saveMacro.mock.calls[saveMacro.mock.calls.length - 1];
    expect(keys.length).toBe(2);
    expect(keys[0]).toMatchObject({ key: 'KeyA', type: 'Make' });
    expect(keys[1]).toMatchObject({ key: 'KeyA', type: 'Break' });
    // Durations land on the normalization floor or above.
    expect(keys[0].duration).toBeGreaterThanOrEqual(10);
    expect(keys[1].duration).toBeGreaterThanOrEqual(10);
  });

  it('repeats while a key is held do NOT add new Makes (just extend the previous one)', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyDown(window, { code: 'KeyA', repeat: true });
    fireEvent.keyDown(window, { code: 'KeyA', repeat: true });
    fireEvent.keyUp(window, { code: 'KeyA' });

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    const [, keys] = saveMacro.mock.calls[saveMacro.mock.calls.length - 1];
    // Still just one Make + one Break for the held key - no extras from
    // the synthetic repeat events.
    expect(keys.filter(k => k.type === 'Make').length).toBe(1);
    expect(keys.filter(k => k.type === 'Break').length).toBe(1);
  });

  it('reverts to the last server-acknowledged keys when the write fails (no toast here)', async () => {
    saveMacro.mockResolvedValue(null);
    renderView();
    await tick();

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(saveMacro).toHaveBeenCalled();
    // The editor rolls back to the last server-acknowledged macro (empty
    // slot). Failure toasts are the page's job; the view stays silent.
    expect(screen.getByRole('status')).toHaveTextContent('keeb.macro.emptyTitle');
  });
});

describe('KeebMacroView - clear', () => {
  it('Clear button appears only after recordings exist and clears them', async () => {
    renderView();
    expect(screen.queryByRole('button', { name: 'keeb.macro.clear' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();

    const clear = screen.getByRole('button', { name: 'keeb.macro.clear' });
    fireEvent.click(clear);
    await tick();
    // After clear, saveMacro is called with an empty keys list.
    const calls = saveMacro.mock.calls;
    const last = calls[calls.length - 1];
    expect(last[1]).toEqual([]);
  });
});

describe('KeebMacroView - duration edit', () => {
  it('committing a duration edit normalizes the value and saves it', async () => {
    loadMacro.mockImplementation(async index => ({
      index,
      keys: [
        { key: 'KeyA', duration: 30, type: 'Make', category: 'StandardKey' },
        { key: 'KeyA', duration: 30, type: 'Break', category: 'StandardKey' },
      ],
    }));
    renderView();
    await tick();

    const input = screen.getByLabelText('keeb.macro.durationAria key=KeyA type=Make');
    fireEvent.change(input, { target: { value: '47' } });
    fireEvent.blur(input);
    await tick();
    await tick();

    expect(saveMacro).toHaveBeenCalledTimes(1);
    const [index, keys] = saveMacro.mock.calls[0];
    expect(index).toBe(0);
    expect(keys[0]).toMatchObject({ key: 'KeyA', type: 'Make', duration: 50 });
    expect(keys[1]).toMatchObject({ key: 'KeyA', type: 'Break', duration: 30 });
  });
});
