import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckHotkeyField } from './DeckHotkeyField';
import * as api from '../../../api/hotkeys';
import type { HotkeyBinding, HotkeysState } from '../../../api/hotkeys';


let current: HotkeysState;
let tag: string | undefined;
const onTagChange = vi.fn();
const apply = vi.fn();

vi.mock('./useHotkeyDeckInfo', () => ({
  useHotkeyDeckInfo: () => ({ presetNames: { p1: 'Streaming' }, configs: {}, serialByPreset: {} }),
}));

vi.mock('../../../api/hotkeys', async importActual => ({
  ...(await importActual<typeof import('../../../api/hotkeys')>()),
  useHotkeys: () => ({ state: current, loaded: true, apply }),
  putHotkey: vi.fn(),
  deleteHotkey: vi.fn(),
  setHotkeysSuspended: vi.fn().mockResolvedValue({ ok: false, msg: '' }),
}));

function state(bindings: HotkeyBinding[], supported = true): HotkeysState {
  return { supported, platform: 'macos', suspended: false, bindings };
}

const deckBinding: HotkeyBinding = {
  id: 'custom:abc', combo: 'Meta+Alt+k', enabled: true, status: 'active',
  target: { kind: 'deck', presetId: 'p1', tag: 'custom:abc' },
};

function record(keys: { code: string } & Record<string, boolean>) {
  const field = screen.getByRole('button', { name: /panel\.settings\.deck\.hotkeySet|⌥⌘K/ });
  fireEvent.click(field);
  fireEvent.keyDown(field, keys);
}

beforeEach(() => {
  vi.clearAllMocks();
  current = state([]);
  tag = undefined;
});

describe('DeckHotkeyField', () => {
  it('creates a deck binding for the slot when a combo is recorded', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: state([deckBinding]) });
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    record({ code: 'KeyK', metaKey: true, altKey: true });
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.putHotkey).mock.calls[0][0];
    expect(sent.id).toMatch(/^custom:[A-Za-z0-9]+$/);
    expect(sent).toMatchObject({ combo: 'alt+meta+k', enabled: true, target: { kind: 'deck', presetId: 'p1', tag: sent.id } });
    // The slot is tagged with the same id the binding carries.
    expect(onTagChange).toHaveBeenCalledWith(sent.id);
    expect(apply).toHaveBeenCalled();
  });

  it('takes the tag back off the slot when the service refuses the new binding', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: false, msg: 'invalid combo' });
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    record({ code: 'KeyK', metaKey: true });
    await waitFor(() => expect(onTagChange).toHaveBeenLastCalledWith(undefined));
  });

  it('updates the existing binding in place instead of adding another', async () => {
    tag = 'custom:abc';
    current = state([deckBinding]);
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: true, state: current });
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    expect(screen.getByText('⌥⌘K')).toBeInTheDocument();
    record({ code: 'KeyJ', metaKey: true, altKey: true });
    await waitFor(() => expect(api.putHotkey).toHaveBeenCalled());
    expect(vi.mocked(api.putHotkey).mock.calls[0][0]).toMatchObject({ id: 'custom:abc', combo: 'alt+meta+j', enabled: true });
  });

  it('clears the slot by deleting its binding and its tag', async () => {
    tag = 'custom:abc';
    current = state([deckBinding]);
    vi.mocked(api.deleteHotkey).mockResolvedValue({ ok: true, state: state([]) });
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    fireEvent.click(screen.getByRole('button', { name: 'hotkeys.clear' }));
    await waitFor(() => expect(api.deleteHotkey).toHaveBeenCalledWith('custom:abc'));
    expect(onTagChange).toHaveBeenCalledWith(undefined);
  });

  it('refuses a combo another enabled hotkey already holds', async () => {
    current = state([
      { id: 'builtin:toggle-window', combo: 'Meta+Alt+n', enabled: true, status: 'active', target: { kind: 'action', action: { type: 'nexus', action: { op: 'toggleWindow' } } } },
    ]);
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    record({ code: 'KeyN', metaKey: true, altKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.duplicate');
    expect(api.putHotkey).not.toHaveBeenCalled();
  });

  it('shows a translated reason when the service refuses, never its raw text', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: false, msg: 'invalid combo' });
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    record({ code: 'KeyK', metaKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.error.invalidCombo');
    expect(screen.queryByText('invalid combo')).toBeNull();
  });

  it('falls back to the generic message for an unknown refusal', async () => {
    vi.mocked(api.putHotkey).mockResolvedValue({ ok: false, msg: 'something odd' });
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    record({ code: 'KeyK', metaKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.error.save');
  });

  it('refuses a combo with no Ctrl, Alt or Meta before sending it', async () => {
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    record({ code: 'KeyK', shiftKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('hotkeys.error.needsModifier');
    expect(api.putHotkey).not.toHaveBeenCalled();
  });

  it('shows no title while the hotkey state has not arrived', () => {
    current = null as unknown as HotkeysState;
    const { container } = render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('flags a binding another app holds', () => {
    tag = 'custom:abc';
    current = state([{ ...deckBinding, status: 'conflict' }]);
    render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    expect(screen.getByRole('alert')).toHaveTextContent('hotkeys.status.conflict');
  });

  it('renders nothing on a platform without global hotkeys', () => {
    current = state([], false);
    const { container } = render(<DeckHotkeyField presetId="p1" tag={tag} onTagChange={onTagChange} layout="section" />);
    expect(container).toBeEmptyDOMElement();
  });
});
