import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HotkeysTab } from './HotkeysTab';
import * as api from '../../../api/hotkeys';
import type { HotkeyBinding, HotkeysState } from '../../../api/hotkeys';

let current: HotkeysState | null;
let loaded = true;
const apply = vi.fn();

vi.mock('../../../api/hotkeys', async importActual => ({
  ...(await importActual<typeof import('../../../api/hotkeys')>()),
  useHotkeys: () => ({ state: current, loaded, apply }),
  putHotkey: vi.fn(),
  deleteHotkey: vi.fn(),
  resetHotkeyDefaults: vi.fn(),
  setHotkeysSuspended: vi.fn().mockResolvedValue({ ok: false, msg: '' }),
}));

vi.mock('../../../api/deck', () => ({
  getDeckPreset: vi.fn().mockResolvedValue({
    id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1,
    deck: { pages: [{ slots: Array.from({ length: 6 }, (_, i) => (i === 3 ? { label: '3', hotkeyTag: 'custom:d1' } : { label: String(i) })) }] },
  }),
  getDeckPresets: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Streaming', cols: 3, rows: 2, pageCount: 1 }]),
  getDeckInstances: vi.fn().mockResolvedValue({
    'streamdeck:SD1': { mode: 'custom', activePresetId: 'p1' },
    'widget:w1': { mode: 'custom', activePresetId: 'p1' },
  }),
}));

vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => ({ decks: [{ serial: 'SD1', name: 'Desk XL', cols: 3, rows: 2 }] }),
}));

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
  isRemoteOrigin: false,
  isRemotePaired: false,
}));

const win = (over: Partial<HotkeyBinding> = {}): HotkeyBinding => ({
  id: 'builtin:toggle-window', combo: 'Meta+Alt+n', enabled: true, status: 'active',
  target: { kind: 'action', action: { type: 'nexus', action: { op: 'toggleWindow' } } },
  ...over,
});
const brightness: HotkeyBinding = {
  id: 'builtin:lighting-brightness-up', combo: 'Meta+Alt+=', enabled: true, status: 'active',
  target: { kind: 'action', action: { type: 'nexus', action: { op: 'lightingBrightnessStep', value: 0.1 } } },
};
const deckKey: HotkeyBinding = {
  id: 'custom:d1', combo: 'Meta+Alt+k', enabled: true, status: 'orphaned',
  target: { kind: 'deck', presetId: 'p1', tag: 'custom:d1' },
};

const state = (bindings: HotkeyBinding[], over: Partial<HotkeysState> = {}): HotkeysState => ({
  supported: true, platform: 'macos', suspended: false, bindings, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  loaded = true;
  current = state([win(), brightness, deckKey]);
});

describe('HotkeysTab', () => {
  it('groups bindings into Nexus actions and Deck keys with glyph combos', async () => {
    render(<HotkeysTab serviceOnline />);
    expect(screen.getByText('hotkeys.group.nexus')).toBeInTheDocument();
    expect(screen.getByText('hotkeys.group.deck')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.nexus.toggleWindow')).toBeInTheDocument();
    expect(screen.getByText('hotkeys.action.brightnessUp')).toBeInTheDocument();
    expect(screen.getByText('⌥⌘N')).toBeInTheDocument();
    expect(await screen.findByText('Streaming')).toBeInTheDocument();
    expect(screen.getByText('hotkeys.deck.key')).toBeInTheDocument();
  });

  it('flags an orphaned or conflicting binding with a warning chip', () => {
    current = state([win({ status: 'conflict' }), deckKey]);
    render(<HotkeysTab serviceOnline />);
    expect(screen.getByText('hotkeys.status.conflict')).toBeInTheDocument();
    expect(screen.getByText('hotkeys.status.orphaned')).toBeInTheDocument();
  });

  it('shows one notice and no controls when the platform has no global hotkeys', () => {
    current = state([win()], { supported: false, platform: 'linux' });
    render(<HotkeysTab serviceOnline />);
    expect(screen.getByText('hotkeys.unsupported')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('rebinding sends the binding as enabled, without a status field', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current! });
    render(<HotkeysTab serviceOnline />);
    const field = screen.getByText('⌥⌘N');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyJ', ctrlKey: true, altKey: true });
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.putHotkey).mock.calls[0][0];
    expect(sent).toMatchObject({ id: 'builtin:toggle-window', enabled: true });
    expect(sent).not.toHaveProperty('status');
  });

  it('shows the clear x inside the field only for a bound row, and the delete is last in the row', () => {
    current = state([win(), brightness, win({ id: 'custom:u', combo: null, status: 'unbound', label: 'Unbound' })]);
    render(<HotkeysTab serviceOnline />);
    const clears = screen.getAllByRole('button', { name: 'hotkeys.clear' });
    expect(clears).toHaveLength(2);
    for (const c of clears) expect(c.parentElement?.querySelector('[class*="field"]')).not.toBeNull();
    const row = screen.getAllByRole('button', { name: 'hotkeys.delete' })[0].parentElement!;
    expect(row.lastElementChild).toBe(screen.getAllByRole('button', { name: 'hotkeys.delete' })[0]);
  });

  it('clears the combo of a bound binding stored disabled, once, and keeps it enabled', async () => {
    current = state([win({ enabled: false, status: 'disabled' })]);
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current });
    const { rerender } = render(<HotkeysTab serviceOnline />);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putHotkey).mock.calls[0][0]).toMatchObject({ id: 'builtin:toggle-window', combo: null, enabled: true });
    rerender(<HotkeysTab serviceOnline />);
    expect(api.putHotkey).toHaveBeenCalledTimes(1);
  });

  it('leaves a disabled binding alone once the user has re-recorded it', async () => {
    current = state([win({ id: 'custom:off', enabled: false, status: 'disabled' })]);
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current });
    const { rerender } = render(<HotkeysTab serviceOnline />);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalledTimes(1));
    vi.mocked(api.putHotkey).mockClear();
    current = state([win({ id: 'custom:off', enabled: false, status: 'disabled' })]);
    rerender(<HotkeysTab serviceOnline />);
    const field = screen.getByText('⌥⌘N');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyJ', ctrlKey: true, altKey: true });
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putHotkey).mock.calls[0][0]).toMatchObject({ combo: 'ctrl+alt+j', enabled: true });
  });

  it('a successful heal does not wipe another row\'s error', async () => {
    current = state([win({ id: 'custom:off', combo: 'Meta+Alt+q', enabled: false, status: 'disabled' }), brightness]);
    let finish: (v: api.HotkeysResult) => void = () => {};
    vi.mocked(api.putHotkey).mockReturnValue(new Promise(r => { finish = r; }));
    render(<HotkeysTab serviceOnline />);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalledTimes(1));
    const field = screen.getByText('⌥⌘=');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyA' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await act(async () => { finish({ ok: true, state: current! }); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows a rejected clear of a disabled binding', async () => {
    current = state([win({ enabled: false, status: 'disabled' })]);
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: false, msg: 'nope' });
    render(<HotkeysTab serviceOnline />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('sends no request for a disabled binding when the platform is unsupported', () => {
    current = state([win({ enabled: false, status: 'disabled' })], { supported: false });
    render(<HotkeysTab serviceOnline />);
    expect(api.putHotkey).not.toHaveBeenCalled();
  });

  it('rebinds through the recorder, suspending OS hotkeys while it records', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current! });
    render(<HotkeysTab serviceOnline />);
    const field = screen.getByText('⌥⌘N');
    fireEvent.click(field);
    expect(api.setHotkeysSuspended).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(field, { code: 'KeyJ', ctrlKey: true, altKey: true });
    expect(api.setHotkeysSuspended).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalled());
    expect(vi.mocked(api.putHotkey).mock.calls[0][0]).toMatchObject({ id: 'builtin:toggle-window', combo: 'ctrl+alt+j' });
  });

  it('refuses a rebind onto a combo another enabled hotkey holds, with an inline message', async () => {
    render(<HotkeysTab serviceOnline />);
    const field = screen.getByText('⌥⌘N');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'Equal', metaKey: true, altKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.duplicate');
    expect(api.putHotkey).not.toHaveBeenCalled();
  });

  it('clears a combo by saving it as unbound', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current! });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getAllByRole('button', { name: 'hotkeys.clear' })[0]);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalled());
    expect(vi.mocked(api.putHotkey).mock.calls[0][0]).toMatchObject({ id: 'builtin:toggle-window', combo: null });
  });

  it('deletes only after confirming', async () => {
    vi.mocked(api.deleteHotkey).mockResolvedValue({ ok: true, state: state([]) });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getAllByRole('button', { name: 'hotkeys.delete' })[0]);
    expect(api.deleteHotkey).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(api.deleteHotkey).toHaveBeenCalledWith('builtin:toggle-window'));
  });

  it('resets defaults after confirming', async () => {
    vi.mocked(api.resetHotkeyDefaults).mockResolvedValue({ ok: true, state: current! });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.reset' }));
    fireEvent.click(await screen.findByRole('button', { name: 'hotkeys.reset.confirm' }));
    await waitFor(() => expect(api.resetHotkeyDefaults).toHaveBeenCalled());
  });

  it('jumps from a deck row to that deck\'s editor on the fitted key', async () => {
    const onOpenDeckEditor = vi.fn();
    render(<HotkeysTab serviceOnline onOpenDeckEditor={onOpenDeckEditor} />);
    fireEvent.click(await screen.findByRole('button', { name: 'hotkeys.deck.open' }));
    await waitFor(() => expect(onOpenDeckEditor).toHaveBeenCalledWith({ serial: 'SD1', page: 0, folderPath: [], keyIndex: 3 }));
  });

  it('names the decks showing the preset: the device and a deck widget', async () => {
    render(<HotkeysTab serviceOnline />);
    expect(await screen.findByText('hotkeys.deck.holder')).toBeInTheDocument();
  });

  it('refuses a combo without Ctrl, Alt or Meta in the row', async () => {
    render(<HotkeysTab serviceOnline />);
    const field = screen.getByText('⌥⌘N');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyJ', shiftKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.error.needsModifier');
    expect(api.putHotkey).not.toHaveBeenCalled();
  });

  it('shows a rejected reset, and a rejected add, instead of failing silently', async () => {
    vi.mocked(api.resetHotkeyDefaults).mockResolvedValue({ ok: false, msg: 'too many hotkeys' });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.reset' }));
    fireEvent.click(await screen.findByRole('button', { name: 'hotkeys.reset.confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.error.tooMany');
  });

  it('shows a rejected add inside the form', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: false, msg: 'invalid hotkey id' });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.addButton' }));
    const fields = screen.getAllByText('panel.settings.deck.hotkeySet');
    const field = fields[fields.length - 1];
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyW', ctrlKey: true, shiftKey: true });
    const adds = screen.getAllByRole('button', { name: 'hotkeys.addButton' });
    await waitFor(() => expect(adds[adds.length - 1]).toBeEnabled());
    fireEvent.click(adds[adds.length - 1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.error.invalidId');
  });

  it('lists an orphaned deck binding with a way to delete it', async () => {
    current = state([{ ...deckKey, target: { kind: 'deck', presetId: 'p1', tag: 'custom:gone' } }]);
    render(<HotkeysTab serviceOnline />);
    expect(screen.getByText('hotkeys.status.orphaned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hotkeys.delete' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'hotkeys.deck.open' })).toBeNull();
  });

  it('clears a rejected add when the form is cancelled', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: false, msg: 'invalid hotkey id' });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.addButton' }));
    const fields = screen.getAllByText('panel.settings.deck.hotkeySet');
    fireEvent.click(fields[fields.length - 1]);
    fireEvent.keyDown(fields[fields.length - 1], { code: 'KeyW', ctrlKey: true, shiftKey: true });
    const adds = screen.getAllByRole('button', { name: 'hotkeys.addButton' });
    await waitFor(() => expect(adds[adds.length - 1]).toBeEnabled());
    fireEvent.click(adds[adds.length - 1]);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.addButton' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so inline when the deck editor cannot be opened for a row', async () => {
    current = state([{ ...deckKey, target: { kind: 'deck', presetId: 'p1', tag: 'custom:d1' } }]);
    const getDeckPreset = vi.mocked((await import('../../../api/deck')).getDeckPreset);
    const original = getDeckPreset.getMockImplementation()!;
    getDeckPreset.mockResolvedValue(null as never);
    try {
      render(<HotkeysTab serviceOnline onOpenDeckEditor={vi.fn()} />);
      fireEvent.click(await screen.findByRole('button', { name: 'hotkeys.deck.open' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.deck.openFailed');
    } finally {
      getDeckPreset.mockImplementation(original);
    }
  });

  it('shows the shared empty state when there are no deck hotkeys', () => {
    current = state([win()]);
    render(<HotkeysTab serviceOnline />);
    expect(screen.getByText('hotkeys.empty.deck')).toBeInTheDocument();
  });

  it('adds a custom action hotkey: pick an action, record a combo, save', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current! });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.addButton' }));
    const form = screen.getByText('hotkeys.new.title').closest('section') ?? document.body;
    const save = within(form as HTMLElement).getAllByRole('button', { name: 'hotkeys.addButton' }).pop()!;
    expect(save).toBeDisabled();
    const fields = screen.getAllByText('panel.settings.deck.hotkeySet');
    const field = fields[fields.length - 1];
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyW', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalled());
    const sent = vi.mocked(api.putHotkey).mock.calls[0][0];
    expect(sent).toMatchObject({
      combo: 'ctrl+shift+w', enabled: true,
      target: { kind: 'action', action: { type: 'nexus', action: { op: 'toggleWindow' } } },
    });
    expect(sent.id).toMatch(/^custom:/);
  });

  it('blocks adding a duplicate combo with an inline message', async () => {
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.addButton' }));
    const fields = screen.getAllByText('panel.settings.deck.hotkeySet');
    const field = fields[fields.length - 1];
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyN', metaKey: true, altKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.duplicate');
    expect(screen.getAllByRole('button', { name: 'hotkeys.addButton' }).pop()).toBeDisabled();
  });
});
