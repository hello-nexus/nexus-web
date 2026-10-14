import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ShaderStudio } from './ShaderStudio';
import type { MarketLink } from './studioLibrary';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ language: 'en', t: (key: string) => key }),
}));

const startLive = vi.fn();
const stopLive = vi.fn();
vi.mock('../../../../api/lighting', () => ({
  primeShaderSource: () => {},
  forgetShaderSource: () => {},
  invalidateShaderSource: () => {},
  startStudioLive: (...a: unknown[]) => startLive(...a),
  stopStudioLive: (...a: unknown[]) => stopLive(...a),
}));

let livePref = false;
const saveLivePref = vi.fn();
vi.mock('../../../../hooks/useUiSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../hooks/useUiSettings')>()),
  useStudioLivePref: () => [livePref, saveLivePref],
}));

vi.mock('../../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('./StudioPreview', () => ({ StudioPreview: () => null }));
let deleteNeighbor: string | null = null;
vi.mock('./CustomEffectsGrid', () => ({
  CustomEffectsGrid: ({ effect, onCreate, onDeleted }: { effect: string | null; onCreate: () => void; onDeleted: (id: string, next: string | null) => void }) => (
    <>
      <button type="button" onClick={onCreate}>create-tile</button>
      <button type="button" onClick={() => onDeleted((effect ?? '').slice('custom:'.length), deleteNeighbor)}>delete-open</button>
    </>
  ),
}));

const put = vi.fn();
let savedEntries: unknown[] = [];
let entriesLoaded = true;
vi.mock('../../../../api/customEffects', () => ({
  customEffectsLoaded: () => entriesLoaded,
  STUDIO_UID_RE: /^[a-z0-9]{1,24}$/,
  customEffectKey: (id: string) => `custom:${id}`,
  customEffectId: (key: string) => key.slice('custom:'.length),
  getCustomEffects: () => savedEntries,
  useCustomEffects: () => savedEntries,
  refreshCustomEffects: async () => {},
  putCustomEffect: (...a: unknown[]) => put(...a),
  deleteCustomEffect: async () => true,
}));

type Save = (name: string, link?: MarketLink) => Promise<string | null>;
let save: Save | null = null;
vi.mock('./PublishEffectModal', () => ({
  // Keeps the first `save`, as the dialog's submit closure does for both of its calls.
  PublishEffectModal: (props: { open: boolean; save: Save }) => {
    if (props.open) save ??= props.save;
    return null;
  },
}));

describe('ShaderStudio publishing', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ entry: {} });
    save = null;
  });

  it('saves an unsaved effect and its listing link under one id', async () => {
    // Effect ids come from the clock; a ticking clock makes a second fresh id certain.
    let now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now++);
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.publish.button' }));
    // The dialog loads on demand.
    await waitFor(() => expect(save).not.toBeNull());
    await act(async () => { await save!('Spin'); });
    await act(async () => { await save!('Spin', { marketId: 'L1', marketAuthor: 'alice' }); });
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][0]).toBe(put.mock.calls[0][0]);
    expect(put.mock.calls[1][1]).toMatchObject({ name: 'Spin', marketId: 'L1', marketAuthor: 'alice' });
    clock.mockRestore();
  });
});

describe('ShaderStudio history keys', () => {
  // Both modifiers, so the shortcut matches whichever platform the test UA reports.
  const press = (shiftKey = false, target: EventTarget = window) =>
    fireEvent.keyDown(target, { code: 'KeyZ', key: 'z', metaKey: true, ctrlKey: true, shiftKey });

  it('undoes and redoes with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z, from a slider but not a text field', () => {
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const undo = screen.getByRole('button', { name: 'lighting.studio.undo' });
    const redo = screen.getByRole('button', { name: 'lighting.studio.redo' });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.surprise' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.surprise' }));
    expect(undo).toBeEnabled();

    const field = document.body.appendChild(document.createElement('input'));
    press(false, field);
    expect(redo).toBeDisabled();
    field.remove();

    const slider = document.body.appendChild(Object.assign(document.createElement('input'), { type: 'range' }));
    press(false, slider);
    expect(redo).toBeEnabled();
    slider.remove();
    press();
    expect(undo).toBeDisabled();
    expect(redo).toBeEnabled();
    press(true);
    expect(undo).toBeEnabled();
  });
});

describe('ShaderStudio simulated music', () => {
  it('offers the toggle only while the effect reads the music', () => {
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const pick = (id: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.starters' }));
      fireEvent.click(screen.getByRole('option', { name: `lighting.studio.starter.${id}` }));
    };
    pick('larsonScanner');
    expect(screen.queryByText('lighting.studio.simulateMusic')).toBeNull();
    pick('spectrumBars');
    expect(screen.getByText('lighting.studio.simulateMusic')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'lighting.studio.simulateMusic' })).toBeInTheDocument();
  });
});

describe('ShaderStudio variations', () => {
  it('leaves only Done available until a variation is decided', () => {
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.variations' }));
    for (const name of ['lighting.studio.surprise', 'lighting.studio.publish.button', 'lighting.studio.save', 'lighting.studio.undo']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.done' }));
    expect(screen.getByRole('button', { name: 'lighting.studio.surprise' })).toBeEnabled();
  });
});

describe('ShaderStudio live on devices', () => {
  beforeEach(() => {
    livePref = false;
    saveLivePref.mockReset();
    startLive.mockReset().mockResolvedValue({ active: true, leaseMs: 15000, sessionId: 's0' });
    stopLive.mockReset().mockResolvedValue({});
  });

  it('is off on open, sends the effect when switched on, and ends the session on switch-off and close', async () => {
    const { unmount } = render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'lighting.studio.live' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(startLive).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    expect(startLive.mock.calls[0][0]).toContain('void main');
    fireEvent.click(toggle);
    await waitFor(() => expect(stopLive).toHaveBeenCalledTimes(1));

    fireEvent.click(toggle);
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(2));
    unmount();
    await waitFor(() => expect(stopLive).toHaveBeenCalledTimes(2));
  });

  it('sits in the Preview header and keeps its state while the variations view replaces Preview', async () => {
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'lighting.studio.live' });
    expect(toggle.closest('section')).toHaveTextContent('lighting.studio.preview');
    fireEvent.click(toggle);
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.variations' }));
    expect(screen.queryByRole('button', { name: 'lighting.studio.live' })).not.toBeInTheDocument();
    expect(stopLive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.done' }));
    expect(screen.getByRole('button', { name: 'lighting.studio.live' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves each press as the stored preference', async () => {
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'lighting.studio.live' });
    fireEvent.click(toggle);
    expect(saveLivePref).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    fireEvent.click(toggle);
    expect(saveLivePref).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(stopLive).toHaveBeenCalled());
  });

  it('restores an on preference by showing on all devices from open', async () => {
    livePref = true;
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'lighting.studio.live' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    expect(saveLivePref).not.toHaveBeenCalled();
  });

  it('holds a restored on until the effects list has loaded, so the placeholder recipe never goes live', async () => {
    livePref = true;
    entriesLoaded = false;
    onTestFinished(() => { entriesLoaded = true; });
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'lighting.studio.live' })).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {});
    expect(startLive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.surprise' }));
    await waitFor(() => expect(startLive).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'lighting.studio.live' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the stored preference when the service refuses the session', async () => {
    livePref = true;
    startLive.mockResolvedValue({ active: false });
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    expect(await screen.findByText('lighting.studio.liveFailed')).toBeInTheDocument();
    expect(saveLivePref).not.toHaveBeenCalled();
  });

  it('renews and stops the session under the id the service gave it', async () => {
    startLive.mockResolvedValue({ active: true, leaseMs: 15000, sessionId: 's1' });
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'lighting.studio.live' });
    fireEvent.click(toggle);
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    expect(startLive.mock.calls[0][2]).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.surprise' }));
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(2));
    expect(startLive.mock.calls[1][2]).toBe('s1');
    fireEvent.click(toggle);
    await waitFor(() => expect(stopLive).toHaveBeenCalledWith('s1'));
  });

  it('switches live off on a refusal and keeps the message until switched on again', async () => {
    startLive.mockResolvedValueOnce(null);
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'lighting.studio.live' });
    fireEvent.click(toggle);
    expect(await screen.findByText('lighting.studio.liveFailed')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // Refused before any session was ours: no id-less stop that could end another tab's session.
    await act(async () => {});
    expect(stopLive).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(screen.queryByText('lighting.studio.liveFailed')).not.toBeInTheDocument();
  });

  it('says lighting is off while the service reports no running mode, and clears it once one runs', async () => {
    startLive.mockResolvedValue({ active: true, leaseMs: 15000, sessionId: 's2', lightingOff: true });
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'lighting.studio.live' });
    fireEvent.click(toggle);
    expect(await screen.findByText('lighting.studio.liveOff')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    startLive.mockResolvedValue({ active: true, leaseMs: 15000, sessionId: 's2', lightingOff: false });
    // An edit sends the next renewal.
    fireEvent.click(screen.getByRole('button', { name: /lighting\.studio\.surprise/ }));
    await waitFor(() => expect(screen.queryByText('lighting.studio.liveOff')).not.toBeInTheDocument());
    // Off again, then a new session that the service answers with lighting on: no stale notice.
    startLive.mockResolvedValue({ active: true, leaseMs: 15000, sessionId: 's3', lightingOff: true });
    fireEvent.click(screen.getByRole('button', { name: /lighting\.studio\.surprise/ }));
    expect(await screen.findByText('lighting.studio.liveOff')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText('lighting.studio.liveOff')).not.toBeInTheDocument();
    startLive.mockResolvedValue({ active: true, leaseMs: 15000, sessionId: 's4', lightingOff: false });
    fireEvent.click(toggle);
    await waitFor(() => expect(startLive.mock.calls.at(-1)?.[2]).toBeNull());
    await act(async () => {});
    expect(screen.queryByText('lighting.studio.liveOff')).not.toBeInTheDocument();
    fireEvent.click(toggle);
  });

  it('stops only after a send still in flight, and ignores its late refusal', async () => {
    let finish!: (v: unknown) => void;
    startLive.mockReturnValueOnce(new Promise(r => { finish = r; }));
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'lighting.studio.live' });
    fireEvent.click(toggle);
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    fireEvent.click(toggle);
    await act(async () => {});
    expect(stopLive).not.toHaveBeenCalled();
    await act(async () => { finish({ active: true, leaseMs: 15000, sessionId: 's9' }); });
    await waitFor(() => expect(stopLive).toHaveBeenCalledWith('s9'));
    expect(screen.queryByText('lighting.studio.liveFailed')).not.toBeInTheDocument();
  });
});

describe('ShaderStudio opening', () => {
  afterEach(() => {
    savedEntries = [];
    entriesLoaded = true;
    deleteNeighbor = null;
  });
  const recipe = (speed: number) => JSON.stringify({ v: 1, blocks: [{ uid: 'a1', type: 'rings', params: {} }, { uid: 'b2', type: 'palette', params: {} }], speed, hue: 0, saturation: 1, contrast: 1 });

  it('opens the most recently created effect, not a new one, when none is named', () => {
    // fx + base36 ms: 'fxzz' is newer than 'fx10' whatever their update order.
    savedEntries = [
      { id: 'fxzz', name: 'Newest', recipe: recipe(10), updatedAt: 1, audio: false },
      { id: 'fx10', name: 'Older', recipe: recipe(20), updatedAt: 9, audio: false },
    ];
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('Newest');
    savedEntries = [];
  });

  it('prefers the newest of your own effects over a newer Marketplace download', () => {
    savedEntries = [
      { id: 'fx10', name: 'Mine', recipe: recipe(10), updatedAt: 1, audio: false },
      { id: 'fxzz', name: 'Theirs', recipe: recipe(20), updatedAt: 2, audio: false, marketId: 'L1', marketAuthor: 'bob', downloaded: true },
    ];
    render(<ShaderStudio open effectId={null} username="me" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('Mine');
    savedEntries = [];
  });

  it('starts a new effect, not another one, when the named effect is gone', () => {
    savedEntries = [{ id: 'fx10', name: 'Mine', recipe: recipe(10), updatedAt: 1, audio: false }];
    render(<ShaderStudio open effectId="fxgone" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('');
    savedEntries = [];
  });

  it('keeps a new effect the user created before the list arrived', () => {
    entriesLoaded = false;
    const { rerender } = render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'create-tile' }));
    savedEntries = [{ id: 'fx10', name: 'Mine', recipe: recipe(10), updatedAt: 1, audio: false }];
    entriesLoaded = true;
    rerender(<ShaderStudio open effectId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('');
  });

  it('makes the default pick once the list arrives when opened before it loaded', () => {
    savedEntries = [];
    entriesLoaded = false;
    const { rerender } = render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    savedEntries = [{ id: 'fx10', name: 'Mine', recipe: recipe(10), updatedAt: 1, audio: false }];
    entriesLoaded = true;
    rerender(<ShaderStudio open effectId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('Mine');
    savedEntries = [];
  });

  it('opens the neighbor after the open effect is deleted, a new effect when none is left', () => {
    savedEntries = [
      { id: 'fx10', name: 'First', recipe: recipe(10), updatedAt: 1, audio: false },
      { id: 'fx20', name: 'Second', recipe: recipe(20), updatedAt: 2, audio: false },
    ];
    const { unmount } = render(<ShaderStudio open effectId="fx10" onClose={() => {}} />);
    savedEntries = [savedEntries[1]];
    deleteNeighbor = 'fx20';
    fireEvent.click(screen.getByRole('button', { name: 'delete-open' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('Second');
    unmount();

    savedEntries = [{ id: 'fx20', name: 'Second', recipe: recipe(20), updatedAt: 2, audio: false }];
    render(<ShaderStudio open effectId="fx20" onClose={() => {}} />);
    savedEntries = [];
    deleteNeighbor = null;
    fireEvent.click(screen.getByRole('button', { name: 'delete-open' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('');
  });

  it('copies the store link of an effect you published', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    onTestFinished(() => {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    });
    savedEntries = [{ id: 'fx10', name: 'Mine', recipe: recipe(10), updatedAt: 1, audio: false, marketId: 'L1', marketAuthor: 'me', downloaded: false }];
    render(<ShaderStudio open effectId="fx10" username="me" onClose={() => {}} />);
    expect(screen.getByText('lighting.studio.published')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.copyLink' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://my.hellonexus.com/store/effects/L1'));
    expect(await screen.findByRole('button', { name: 'lighting.studio.linkCopied' })).toBeInTheDocument();
  });

  it('offers no store link for a download', () => {
    savedEntries = [{ id: 'fx10', name: 'Theirs', recipe: recipe(10), updatedAt: 1, audio: false, marketId: 'L1', marketAuthor: 'bob', downloaded: true }];
    render(<ShaderStudio open effectId="fx10" username="me" onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'lighting.studio.copyLink' })).toBeNull();
  });

  it('starts a new effect when there is none', () => {
    savedEntries = [];
    render(<ShaderStudio open effectId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    expect(screen.getByPlaceholderText('lighting.studio.namePlaceholder')).toHaveValue('');
  });
});

describe('ShaderStudio save prompt', () => {
  const body = JSON.stringify({ v: 1, blocks: [{ uid: 'a1', type: 'rings', params: {} }, { uid: 'b2', type: 'palette', params: {} }], speed: 50, hue: 0, saturation: 1, contrast: 1 });
  const entry = (id: string, name: string) => ({ id, name, recipe: body, updatedAt: 1, audio: false });
  const openPrompt = (effectId: string | null) => {
    render(<ShaderStudio open effectId={effectId} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.studio.save' }));
    return screen.getByPlaceholderText('lighting.studio.namePlaceholder');
  };
  const dialogButton = (name: string) => screen.getAllByRole('button', { name }).at(-1)!;

  beforeEach(() => {
    put.mockReset().mockResolvedValue({ entry: {} });
    savedEntries = [entry('fx1', 'Glow'), entry('fx2', 'Pulse')];
  });
  afterEach(() => { savedEntries = []; });

  it('Save renames the open effect in place', async () => {
    const field = openPrompt('fx1');
    fireEvent.change(field, { target: { value: ' Glow 2 ' } });
    fireEvent.click(dialogButton('lighting.studio.save'));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe('fx1');
    expect(put.mock.calls[0][1]).toMatchObject({ name: 'Glow 2' });
  });

  it('Enter saves over the open effect, never as new', async () => {
    const field = openPrompt('fx1');
    fireEvent.change(field, { target: { value: 'Glow 2' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe('fx1');
  });

  it('Save as new creates another id and leaves the open effect alone', async () => {
    const field = openPrompt('fx1');
    fireEvent.change(field, { target: { value: 'Glow copy' } });
    fireEvent.click(dialogButton('lighting.studio.saveAsNew'));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).not.toBe('fx1');
    expect(put.mock.calls[0][0]).not.toBe('fx2');
    expect(put.mock.calls[0][1]).toMatchObject({ name: 'Glow copy' });
  });

  it('disables Save as new for the open or any saved effect name, ignoring case', () => {
    const field = openPrompt('fx1');
    expect(dialogButton('lighting.studio.saveAsNew')).toBeDisabled();
    fireEvent.change(field, { target: { value: 'glow' } });
    expect(dialogButton('lighting.studio.saveAsNew')).toBeDisabled();
    fireEvent.change(field, { target: { value: 'Fresh' } });
    expect(dialogButton('lighting.studio.saveAsNew')).toBeEnabled();
  });

  it('blocks both buttons when a different effect owns the name', () => {
    const field = openPrompt('fx1');
    fireEvent.change(field, { target: { value: ' pulse ' } });
    expect(screen.getByText('lighting.studio.nameTaken')).toBeInTheDocument();
    expect(dialogButton('lighting.studio.save')).toBeDisabled();
    expect(dialogButton('lighting.studio.saveAsNew')).toBeDisabled();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps Save available on the open effect name even when another effect shares it', async () => {
    savedEntries = [entry('fx1', 'Glow'), entry('fx2', 'glow')];
    openPrompt('fx1');
    expect(screen.queryByText('lighting.studio.nameTaken')).toBeNull();
    fireEvent.click(dialogButton('lighting.studio.save'));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe('fx1');
  });

  it('offers only Cancel and Save for a never-saved draft', async () => {
    savedEntries = [];
    const field = openPrompt(null);
    expect(screen.queryByRole('button', { name: 'lighting.studio.saveAsNew' })).toBeNull();
    fireEvent.change(field, { target: { value: 'Fresh' } });
    fireEvent.click(dialogButton('lighting.studio.save'));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).not.toBe('fx1');
  });
});
