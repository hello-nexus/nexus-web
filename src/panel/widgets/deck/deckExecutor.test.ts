import { describe, it, expect, vi, beforeEach } from 'vitest';

const postService = vi.fn().mockResolvedValue(null);
const fetchService = vi.fn().mockResolvedValue(null);
vi.mock('../../../api/service', () => ({
  postService: (...a: unknown[]) => postService(...a),
  fetchService: (...a: unknown[]) => fetchService(...a),
}));

import { executeDeckAction, parseHotkey } from './deckExecutor';

describe('parseHotkey', () => {
  it('parses modifiers + a letter', () => {
    expect(parseHotkey('ctrl+shift+m')).toEqual({ key: 'KeyM', ctrl: true, shift: true, alt: false, meta: false });
  });
  it('maps cmd/command/win to meta', () => {
    expect(parseHotkey('cmd+c')?.meta).toBe(true);
    expect(parseHotkey('win+e')?.meta).toBe(true);
  });
  it('handles function, digit, and named keys', () => {
    expect(parseHotkey('f5')?.key).toBe('F5');
    expect(parseHotkey('ctrl+1')?.key).toBe('Digit1');
    expect(parseHotkey('alt+space')?.key).toBe('Space');
    expect(parseHotkey('up')?.key).toBe('ArrowUp');
  });
  it('returns null when there is no non-modifier key', () => {
    expect(parseHotkey('')).toBeNull();
    expect(parseHotkey('ctrl+shift')).toBeNull();
  });
});

describe('executeDeckAction → REST', () => {
  beforeEach(() => { postService.mockClear(); fetchService.mockClear(); });

  it('open URL', async () => {
    await executeDeckAction({ type: 'openUrl', url: 'https://x.com' });
    expect(postService).toHaveBeenCalledWith('/system/open-url', { url: 'https://x.com' });
  });
  it('open file/folder → open-path', async () => {
    await executeDeckAction({ type: 'openFolder', path: '/tmp' });
    expect(postService).toHaveBeenCalledWith('/system/open-path', { path: '/tmp' });
  });
  it('launch app', async () => {
    await executeDeckAction({ type: 'launchApp', appId: 'a b' });
    expect(postService).toHaveBeenCalledWith('/shortcuts/launch?targetId=a%20b', {});
  });
  it('power → /system/power/{action}', async () => {
    await executeDeckAction({ type: 'power', action: 'lock' });
    expect(postService).toHaveBeenCalledWith('/system/power/lock', {});
  });
  it('hotkey → /system/input/keys with parsed chord', async () => {
    await executeDeckAction({ type: 'hotkey', keys: 'ctrl+c' });
    expect(postService).toHaveBeenCalledWith('/system/input/keys', { key: 'KeyC', ctrl: true, shift: false, alt: false, meta: false });
  });
  it('text → /system/input/text', async () => {
    await executeDeckAction({ type: 'text', text: 'hi', paste: true });
    expect(postService).toHaveBeenCalledWith('/system/input/text', { text: 'hi', paste: true });
  });
  it('audio output device', async () => {
    await executeDeckAction({ type: 'audioOutput', deviceId: 'spk' });
    expect(postService).toHaveBeenCalledWith('/system/audio/default-output', { deviceId: 'spk' });
  });
  it('system volumeSet', async () => {
    await executeDeckAction({ type: 'system', action: { op: 'volumeSet', value: 0.5 } });
    expect(postService).toHaveBeenCalledWith('/system/volume', { volume: 0.5 });
  });
  it('nexus lighting brightness reuses the global-brightness endpoint', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'lightingBrightness', value: 0.4 } });
    expect(postService).toHaveBeenCalledWith('/lighting/global-brightness', { value: 0.4 });
  });
  it('nexus y70 power maps on→toggle:false', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'y70Power', on: true } });
    expect(postService).toHaveBeenCalledWith('/y70/toggle', { toggle: false });
  });
  it('page navigation is a no-op (handled client-side by the widget, not via REST)', async () => {
    await executeDeckAction({ type: 'page', op: 'next' });
    await executeDeckAction({ type: 'page', op: 'goto', target: 2 });
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });
  it('pageIndicator is a no-op (display-only)', async () => {
    await executeDeckAction({ type: 'pageIndicator' });
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });
  it('deckBrightness is a no-op on the widget (physical-deck-only)', async () => {
    await executeDeckAction({ type: 'deckBrightness', op: 'set', value: 50 });
    await executeDeckAction({ type: 'deckBrightness', op: 'up', step: 10 });
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });
  it('deckSleep is a no-op on the widget (physical-deck-only)', async () => {
    await executeDeckAction({ type: 'deckSleep' });
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });
  it('hotkeySwitch alternates keysA/keysB across successive presses', async () => {
    const action = { type: 'hotkeySwitch' as const, keysA: 'ctrl+1', keysB: 'ctrl+2' };
    await executeDeckAction(action);
    expect(postService).toHaveBeenNthCalledWith(1, '/system/input/keys', { key: 'Digit1', ctrl: true, shift: false, alt: false, meta: false });
    await executeDeckAction(action);
    expect(postService).toHaveBeenNthCalledWith(2, '/system/input/keys', { key: 'Digit2', ctrl: true, shift: false, alt: false, meta: false });
    await executeDeckAction(action);
    expect(postService).toHaveBeenNthCalledWith(3, '/system/input/keys', { key: 'Digit1', ctrl: true, shift: false, alt: false, meta: false });
  });
  it('hotkeySwitch latches independently per keysA/keysB pair', async () => {
    const first = { type: 'hotkeySwitch' as const, keysA: 'alt+a', keysB: 'alt+b' };
    const second = { type: 'hotkeySwitch' as const, keysA: 'alt+c', keysB: 'alt+d' };
    await executeDeckAction(first);
    await executeDeckAction(second);
    expect(postService).toHaveBeenNthCalledWith(1, '/system/input/keys', { key: 'KeyA', ctrl: false, shift: false, alt: true, meta: false });
    expect(postService).toHaveBeenNthCalledWith(2, '/system/input/keys', { key: 'KeyC', ctrl: false, shift: false, alt: true, meta: false });
  });
});
