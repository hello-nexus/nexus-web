// Macro view tests - driven through the loadMacro/saveMacro props with vi.fn
// fakes (no module mocks). Verifies the slot picker, the delay-mode pill tabs,
// the chord-correct recorder (keydown = Make, keyup = Break, overlapping
// holds preserved in order), replace-on-record, per-row delete, the live
// duration edit (regression: the input must reflect keystrokes on a slot
// with a saved macro), the write-failure rollback, and the save diagnostics
// (truncated / dropped / offline) surfaced inline.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { KeebMacroView } from './KeebMacroView';
import type { KeebMacro, MacroKey, SetMacroResponse } from '../../../api/keeb';

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
const saveMacro = vi.fn<(index: number, keys: MacroKey[]) => Promise<SetMacroResponse | null>>();

function okResponse(index: number, keys: MacroKey[], over: Partial<SetMacroResponse> = {}): SetMacroResponse {
  return { macro: { index, keys }, truncated: false, droppedKeys: [], wroteDevice: true, ...over };
}

function renderView() {
  return render(<KeebMacroView loadMacro={loadMacro} saveMacro={saveMacro} />);
}

function lastSavedKeys(): MacroKey[] {
  return saveMacro.mock.calls[saveMacro.mock.calls.length - 1][1];
}

beforeEach(() => {
  loadMacro.mockReset();
  loadMacro.mockImplementation(async index => ({ index, keys: [] }));
  saveMacro.mockReset();
  // Echo the saved keys back as the acked macro.
  saveMacro.mockImplementation(async (index, keys) => okResponse(index, keys));
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
    expect(loadMacro).toHaveBeenLastCalledWith(4);
  });

  it('slot buttons are locked while recording', async () => {
    renderView();
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=5' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    expect(screen.getByRole('button', { name: 'keeb.macro.slotAriaN n=5' })).toBeEnabled();
  });
});

describe('KeebMacroView - recorder', () => {
  it('shows the shared empty state until something is recorded', () => {
    renderView();
    expect(screen.getByRole('status')).toHaveTextContent('keeb.macro.emptyTitle');
  });

  it('a keydown appends a Make and its keyup appends the Break', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    const keys = lastSavedKeys();
    expect(keys.map(k => `${k.key}:${k.type}`)).toEqual(['KeyA:Make', 'KeyA:Break']);
    keys.forEach(k => expect(k.duration).toBeGreaterThanOrEqual(10));
  });

  it('records measured gaps as the previous action durations', async () => {
    // A settable clock: React also calls performance.now internally, so the
    // mock must be positional-safe (same value until the test advances it).
    let virtualNow = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => virtualNow);
    try {
      renderView();
      fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
      await tick();
      fireEvent.keyDown(window, { code: 'ControlLeft' });
      virtualNow = 1120;
      fireEvent.keyDown(window, { code: 'KeyC' });
      virtualNow = 1250;
      fireEvent.keyUp(window, { code: 'KeyC' });
      virtualNow = 1400;
      fireEvent.keyUp(window, { code: 'ControlLeft' });
      fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
      await tick();
      await tick();
      // Each action's duration = time to the NEXT action; the tail keeps 10.
      expect(lastSavedKeys().map(k => k.duration)).toEqual([120, 130, 150, 10]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('preserves overlapping holds in order (Ctrl+C chord)', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    fireEvent.keyDown(window, { code: 'ControlLeft' });
    fireEvent.keyDown(window, { code: 'KeyC' });
    fireEvent.keyUp(window, { code: 'KeyC' });
    fireEvent.keyUp(window, { code: 'ControlLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(lastSavedKeys().map(k => `${k.key}:${k.type}`)).toEqual([
      'ControlLeft:Make', 'KeyC:Make', 'KeyC:Break', 'ControlLeft:Break',
    ]);
  });

  it('repeats while a key is held do NOT add new Makes', async () => {
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

    const keys = lastSavedKeys();
    expect(keys.filter(k => k.type === 'Make').length).toBe(1);
    expect(keys.filter(k => k.type === 'Break').length).toBe(1);
  });

  it('recording REPLACES the slot content instead of appending', async () => {
    loadMacro.mockImplementation(async index => ({
      index,
      keys: [
        { key: 'KeyZ', duration: 10, type: 'Make' },
        { key: 'KeyZ', duration: 10, type: 'Break' },
      ],
    }));
    renderView();
    await tick();
    expect(screen.getAllByRole('button', { name: /keeb\.macro\.deleteEntryAria/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(lastSavedKeys().map(k => k.key)).toEqual(['KeyA', 'KeyA']);
  });

  it('keys still held on Stop get a closing Break', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    fireEvent.keyDown(window, { code: 'ShiftLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(lastSavedKeys().map(k => `${k.key}:${k.type}`)).toEqual([
      'ShiftLeft:Make', 'ShiftLeft:Break',
    ]);
  });

  it('captured events are defaultPrevented so shortcuts do not fire', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    await tick();

    const down = new KeyboardEvent('keydown', { code: 'Tab', cancelable: true, bubbles: true });
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('reverts to the last server-acknowledged keys when the write fails', async () => {
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
    // The editor rolls back to the last acked macro (empty slot). Failure
    // toasts are the page's job; the view stays silent.
    expect(screen.getByRole('status')).toHaveTextContent('keeb.macro.emptyTitle');
  });
});

describe('KeebMacroView - custom delay mode', () => {
  it('applies the fixed delay to every recorded action', async () => {
    renderView();
    await tick();
    fireEvent.click(within(screen.getByRole('tablist', { name: 'keeb.macro.delayModeAria' }))
      .getByRole('tab', { name: 'keeb.macro.customDelay' }));
    fireEvent.change(screen.getByLabelText('keeb.macro.customDelayAria'), { target: { value: '80' } });

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    for (const k of lastSavedKeys()) expect(k.duration).toBe(80);
  });
});

describe('KeebMacroView - editing', () => {
  const twoKeyMacro = [
    { key: 'KeyA', duration: 30, type: 'Make' as const },
    { key: 'KeyA', duration: 30, type: 'Break' as const },
  ];

  beforeEach(() => {
    loadMacro.mockImplementation(async index => ({ index, keys: twoKeyMacro }));
  });

  it('the duration input reflects typed values live on a slot with a saved macro', async () => {
    renderView();
    await tick();

    const input = screen.getByLabelText('keeb.macro.durationAria key=A type=Make') as HTMLInputElement;
    expect(input.value).toBe('30');
    fireEvent.change(input, { target: { value: '47' } });
    expect(input.value).toBe('47');
  });

  it('committing a duration edit normalizes the value and saves it', async () => {
    renderView();
    await tick();

    const input = screen.getByLabelText('keeb.macro.durationAria key=A type=Make');
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

  it('blur without a change does not rewrite onboard storage', async () => {
    renderView();
    await tick();

    const input = screen.getByLabelText('keeb.macro.durationAria key=A type=Make');
    fireEvent.blur(input);
    await tick();
    expect(saveMacro).not.toHaveBeenCalled();
  });

  it('a row delete saves the macro without that entry', async () => {
    renderView();
    await tick();

    fireEvent.click(screen.getByLabelText('keeb.macro.deleteEntryAria key=A type=Make'));
    await tick();

    expect(saveMacro).toHaveBeenCalledTimes(1);
    expect(lastSavedKeys()).toEqual([{ key: 'KeyA', duration: 30, type: 'Break' }]);
  });

  it('Clear saves an empty macro', async () => {
    renderView();
    await tick();

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.clear' }));
    await tick();
    expect(lastSavedKeys()).toEqual([]);
  });
});

describe('KeebMacroView - save diagnostics', () => {
  it('surfaces truncation, dropped keys, and offline saves inline', async () => {
    loadMacro.mockImplementation(async index => ({ index, keys: [] }));
    saveMacro.mockImplementation(async (index, keys) => okResponse(index, keys, {
      truncated: true,
      droppedKeys: ['MediaPlay'],
      wroteDevice: false,
    }));
    renderView();
    await tick();

    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.start' }));
    fireEvent.keyDown(window, { code: 'KeyA' });
    fireEvent.keyUp(window, { code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: 'keeb.macro.stop' }));
    await tick();
    await tick();

    expect(screen.getByText('keeb.macro.truncatedWarn')).toBeInTheDocument();
    expect(screen.getByText('keeb.macro.droppedWarn keys=MediaPlay')).toBeInTheDocument();
    expect(screen.getByText('keeb.macro.savedOffline')).toBeInTheDocument();
  });

  it('shows the byte budget for the current entries', async () => {
    loadMacro.mockImplementation(async index => ({
      index,
      keys: [
        { key: 'KeyA', duration: 10, type: 'Make' },
        { key: 'KeyA', duration: 5000, type: 'Break' }, // extended entry = 4 bytes
      ],
    }));
    renderView();
    await tick();

    expect(screen.getByText('keeb.macro.budget used=6 max=248')).toBeInTheDocument();
  });
});
