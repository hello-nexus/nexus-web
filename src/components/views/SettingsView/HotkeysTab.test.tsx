import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('puts the toggled enabled flag without a status field', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current! });
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.putHotkey).mock.calls[0][0];
    expect(sent).toMatchObject({ id: 'builtin:toggle-window', combo: 'Meta+Alt+n', enabled: false });
    expect(sent).not.toHaveProperty('status');
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

  it('keeps a turned-off hotkey fully operable: it can be turned back on, re-recorded and deleted', async () => {
    current = state([win({ enabled: false })]);
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current });
    const { container } = render(<HotkeysTab serviceOnline />);
    const toggle = screen.getByRole('switch');
    // SettingRow's disabled class sets pointer-events: none on the whole row.
    expect(toggle.closest('[class*="disabled"]')).toBeNull();
    expect(container.querySelector('[class*="disabled"]')).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalled());
    expect(vi.mocked(api.putHotkey).mock.calls[0][0]).toMatchObject({ enabled: true });
    expect(screen.getByRole('button', { name: 'hotkeys.delete' })).toBeEnabled();
  });

  it('runs the duplicate check when a hotkey is turned back on', async () => {
    current = state([win(), win({ id: 'custom:2', combo: 'Meta+Alt+n', enabled: false, label: 'Second' })]);
    render(<HotkeysTab serviceOnline />);
    fireEvent.click(screen.getAllByRole('switch')[1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.duplicate');
    expect(api.putHotkey).not.toHaveBeenCalled();
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
