import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeckKeyInspector, canBindGlobalHotkey } from './DeckKeyInspector';
import * as hotkeysApi from '../../../api/hotkeys';
import { makePresetDeckTarget } from './deckTarget';
import type { DeckPresetFull } from '../../../api/deck';
import type { DeckConfig } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));
vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
  isRemoteOrigin: false,
  isRemotePaired: false,
  isDirectActive: () => false,
  isRelayActive: () => false,
  pickSystemPath: vi.fn(),
}));
vi.mock('../../../api/hotkeys', async importActual => ({
  ...(await importActual<typeof import('../../../api/hotkeys')>()),
  deleteHotkey: vi.fn().mockResolvedValue({ ok: true, state: { supported: true, platform: 'macos', suspended: false, bindings: [] } }),
  putHotkey: vi.fn().mockResolvedValue({ ok: true, state: { supported: true, platform: 'macos', suspended: false, bindings: [] } }),
  setHotkeysSuspended: vi.fn().mockResolvedValue({ ok: false, msg: '' }),
  useHotkeys: () => ({
    state: { supported: true, platform: 'macos', suspended: false, bindings: [] },
    loaded: true,
    apply: vi.fn(),
  }),
}));

const deck: DeckConfig = { pages: [{ slots: [{ action: { type: 'hotkey', keys: 'ctrl+c' } }, {}] }] };
const preset: DeckPresetFull = { id: 'p1', name: 'P', cols: 2, rows: 1, pageCount: 1, deck };

function mount(kind: 'physical' | 'widget', desktopEditor: boolean, selectedSlot = 0, save = vi.fn()) {
  const target = makePresetDeckTarget(preset, { cols: 2, rows: 1 }, kind, save);
  return render(
    <DeckKeyInspector
      target={target}
      page={0}
      folderPath={[]}
      onFolderPathChange={vi.fn()}
      selectedSlot={selectedSlot}
      desktopEditor={desktopEditor}
      part="editor"
    />,
  );
}

describe('DeckKeyInspector global hotkey field', () => {
  it('offers the field on a bound key of a physical deck and of a Deck widget', () => {
    const { unmount } = mount('physical', true);
    expect(screen.getByText('hotkeys.field.title')).toBeInTheDocument();
    unmount();
    mount('widget', true);
    expect(screen.getByText('hotkeys.field.title')).toBeInTheDocument();
  });

  it('is absent on an unbound key', () => {
    mount('physical', true, 1);
    expect(screen.queryByText('hotkeys.field.title')).toBeNull();
  });
});

describe('canBindGlobalHotkey', () => {
  it('is true on the desktop dashboard and the native app shell', () => {
    expect(canBindGlobalHotkey(undefined, false)).toBe(true);
    expect(canBindGlobalHotkey('desktop', false)).toBe(true);
    expect(canBindGlobalHotkey('phone', true)).toBe(true);
  });

  it('is false on a phone session and on a keyboard-less kiosk', () => {
    expect(canBindGlobalHotkey('phone', false)).toBe(false);
    expect(canBindGlobalHotkey('y70', false)).toBe(false);
    expect(canBindGlobalHotkey('q60', false)).toBe(false);
  });
});

describe('DeckKeyInspector global hotkey field on a panel', () => {
  it('does not render on a phone or kiosk editor', () => {
    const target = makePresetDeckTarget(preset, { cols: 2, rows: 1 }, 'widget', vi.fn());
    const view = (surface: 'phone' | 'y70') => render(
      <DeckKeyInspector target={target} page={0} folderPath={[]} onFolderPathChange={vi.fn()} selectedSlot={0} surface={surface} part="editor" />,
    );
    const phone = view('phone');
    expect(screen.queryByText('hotkeys.field.title')).toBeNull();
    phone.unmount();
    view('y70');
    expect(screen.queryByText('hotkeys.field.title')).toBeNull();
  });
});

describe('DeckKeyInspector global hotkey field (recording)', () => {
  it('records a combo by tagging the slot through the normal deck save', async () => {
    const save = vi.fn();
    mount('physical', true, 0, save);
    const field = screen.getByText('panel.settings.deck.hotkeySet');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyK', ctrlKey: true });
    await waitFor(() => expect(save).toHaveBeenCalled());
    const saved = save.mock.calls[0][0] as DeckConfig;
    expect(saved.pages[0].slots[0].hotkeyTag).toMatch(/^custom:/);
    expect(saved.pages[0].slots[0].action).toEqual({ type: 'hotkey', keys: 'ctrl+c' });
  });

  it('deleting a tagged key also deletes its binding', () => {
    const tagged: DeckPresetFull = { ...preset, deck: { pages: [{ slots: [{ hotkeyTag: 'custom:t1', action: { type: 'hotkey', keys: 'ctrl+c' } }, {}] }] } };
    const target = makePresetDeckTarget(tagged, { cols: 2, rows: 1 }, 'physical', vi.fn());
    const onDeleteSlot = vi.fn();
    render(
      <DeckKeyInspector target={target} page={0} folderPath={[]} onFolderPathChange={vi.fn()} selectedSlot={0} desktopEditor part="editor" onDeleteSlot={onDeleteSlot} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.deleteKey' }));
    expect(onDeleteSlot).toHaveBeenCalled();
    expect(vi.mocked(hotkeysApi.deleteHotkey)).toHaveBeenCalledWith('custom:t1');
  });
});
