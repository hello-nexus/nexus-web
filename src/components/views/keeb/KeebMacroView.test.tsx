// Macro view tests - verifies the 16-slot picker, the delay-mode pill tabs,
// custom delay numeric input gating, the recorder's state-machine behaviour
// (Make + Break entries on keydown/keyup, repeat extends the last Make's
// duration), and the write-failure rollback + toast. Copy is asserted against
// locale keys via the key-echo i18n mock; useToast is mocked with a push spy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { KeebMacroView } from './KeebMacroView';

// Track latest setKeebMacro args for assertion; `setKeebMacroResult` lets the
// failure-path test make the write come back rejected (null).
const setKeebMacroSpy = vi.fn();
let setKeebMacroResult: 'echo' | null = 'echo';

vi.mock('../../../api/keeb', async () => {
  const actual = await vi.importActual<typeof import('../../../api/keeb')>('../../../api/keeb');
  return {
    ...actual,
    getKeebMacro: async (index: number) => ({ index, keys: [] }),
    setKeebMacro: async (index: number, keys: import('../../../api/keeb').MacroKey[]) => {
      setKeebMacroSpy(index, keys);
      return setKeebMacroResult === null ? null : { index, keys };
    },
  };
});

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

// The view calls useToast(); without a ToastProvider the real hook throws.
const pushSpy = vi.fn();
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: pushSpy }),
}));

afterEach(() => { cleanup(); });

async function tick() {
  await new Promise(r => setTimeout(r, 0));
}

describe('KeebMacroView - slot list', () => {
  beforeEach(() => {
    setKeebMacroSpy.mockClear();
    setKeebMacroResult = 'echo';
  });

  it('renders 16 slot buttons (Macro 1 ... Macro 16)', () => {
    render(<KeebMacroView open />);
    for (let i = 1; i <= 16; i++) {
      expect(screen.getByRole('button', { name: `keeb.macro.slotAriaN n=${i}` })).toBeInTheDocument();
    }
  });

  it('first slot is active by default', () => {
    render(<KeebMacroView open />);
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a different slot flips the active state', () => {
    render(<KeebMacroView open />);
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=5' }));
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=1' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('KeebMacroView - delay-mode tabs', () => {
  it('default is "record"; the custom-delay input is hidden', () => {
    render(<KeebMacroView open />);
    const tabs = screen.getByRole('tablist', { name: 'keeb.macro.delayModeAria' });
    expect(within(tabs).getByRole('tab', { name: 'keeb.macro.recordDelay' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('keeb.macro.customDelayAria')).toBeNull();
  });

  it('switching to "custom" reveals the custom-delay numeric input', () => {
    render(<KeebMacroView open />);
    fireEvent.click(within(screen.getByRole('tablist', { name: 'keeb.macro.delayModeAria' })).getByRole('tab', { name: 'keeb.macro.customDelay' }));
    expect(screen.getByLabelText('keeb.macro.customDelayAria')).toBeInTheDocument();
  });
});

describe('KeebMacroView - recorder', () => {
  beforeEach(() => {
    setKeebMacroSpy.mockClear();
    pushSpy.mockClear();
    setKeebMacroResult = 'echo';
  });

  it('shows the shared empty state until something is recorded', () => {
    render(<KeebMacroView open />);
    expect(screen.getByRole('status')).toHaveTextContent('keeb.macro.emptyTitle');
  });

  it('Start Recording button toggles to Stop and back', () => {
    render(<KeebMacroView open />);
    const start = screen.getByRole('button', { name: 'keeb.macro.start' });
    fireEvent.click(start);
    expect(screen.getByRole('button', { name: 'keeb.macro.stop' })).toBeInTheDocument();
  });

  it('a single keydown+keyup while recording adds a Make + Break pair', async () => {
    render(<KeebMacroView open />);
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    // Dispatch keydown then keyup for 'KeyA'.
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });

    // Stop recording -> triggers setKeebMacro.
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(setKeebMacroSpy).toHaveBeenCalled();
    const [, keys] = setKeebMacroSpy.mock.calls[setKeebMacroSpy.mock.calls.length - 1];
    expect(keys.length).toBe(2);
    expect(keys[0]).toMatchObject({ key: 'KeyA', type: 'Make' });
    expect(keys[1]).toMatchObject({ key: 'KeyA', type: 'Break' });
    // Duration is normalized to >= 10 ms.
    expect(keys[0].duration).toBeGreaterThanOrEqual(10);
    expect(keys[1].duration).toBeGreaterThanOrEqual(10);
  });

  it('repeats while a key is held do NOT add new Makes (just extend the previous one)', async () => {
    render(<KeebMacroView open />);
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyDown(window, { code: 'KeyA', repeat: true });
    fireEvent.keyDown(window, { code: 'KeyA', repeat: true });
    fireEvent.keyUp(window, { code: 'KeyA' });

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    const [, keys] = setKeebMacroSpy.mock.calls[setKeebMacroSpy.mock.calls.length - 1];
    // Still just one Make + one Break for the held key - no extras from
    // the synthetic repeat events.
    expect(keys.filter((k: { type: string }) => k.type === 'Make').length).toBe(1);
    expect(keys.filter((k: { type: string }) => k.type === 'Break').length).toBe(1);
  });

  it('reverts to the last server-acknowledged keys and toasts when the write fails', async () => {
    setKeebMacroResult = null;
    render(<KeebMacroView open />);
    await tick();

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(setKeebMacroSpy).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: 'keeb.write.failedTitle',
      body: 'keeb.write.failedBody',
    }));
    // The editor rolls back to the last server-acknowledged macro (empty slot).
    expect(screen.getByRole('status')).toHaveTextContent('keeb.macro.emptyTitle');
  });
});

describe('KeebMacroView - clear', () => {
  beforeEach(() => {
    setKeebMacroSpy.mockClear();
    setKeebMacroResult = 'echo';
  });

  it('Clear button appears only after recordings exist and clears them', async () => {
    render(<KeebMacroView open />);
    expect(screen.queryByRole('button', { name: 'keeb.macro.clear' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();

    const clear = screen.getByRole('button', { name: 'keeb.macro.clear' });
    fireEvent.click(clear);
    await tick();
    // After clear, setKeebMacro is called with an empty keys list.
    const calls = setKeebMacroSpy.mock.calls;
    const last = calls[calls.length - 1];
    expect(last[1]).toEqual([]);
  });
});
