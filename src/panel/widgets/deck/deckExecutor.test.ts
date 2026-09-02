import { describe, it, expect, vi, beforeEach } from 'vitest';

const postService = vi.fn().mockResolvedValue(null);
const fetchService = vi.fn().mockResolvedValue(null);
vi.mock('../../../api/service', () => ({
  postService: (...a: unknown[]) => postService(...a),
  fetchService: (...a: unknown[]) => fetchService(...a),
}));

import { executeDeckAction, isPrivilegedDeckAction, parseHotkey, type DeckDispatchLocation } from './deckExecutor';
import { onDeckOpenMonitoring } from './deckMonitoringNav';
import type { DeckAction } from './types';

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
  it('maps the preset punctuation keys the touch presets emit', () => {
    // Emoji Picker + the screenshot presets - dead on touch panels before these.
    expect(parseHotkey('meta+.')).toEqual({ key: 'Period', ctrl: false, shift: false, alt: false, meta: true });
    expect(parseHotkey('printscreen')?.key).toBe('PrintScreen');
    expect(parseHotkey('meta+printscreen')?.key).toBe('PrintScreen');
    expect(parseHotkey('alt+printscreen')).toEqual({ key: 'PrintScreen', ctrl: false, shift: false, alt: true, meta: false });
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
  it('text → /system/input/text with no paste field', async () => {
    await executeDeckAction({ type: 'text', text: 'hi' });
    expect(postService).toHaveBeenCalledWith('/system/input/text', { text: 'hi' });
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
  it('nexus lighting effect, Animation mode, starts the named effect', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'rgbEffect', mode: 'animate', effect: 'rainbow' } });
    expect(postService).toHaveBeenCalledWith('/lighting/animate/headless-start', expect.objectContaining({ effect: 'rainbow' }));
  });
  it('nexus lighting effect with no mode still means Animation', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'rgbEffect', effect: 'rainbow' } });
    expect(postService).toHaveBeenCalledWith('/lighting/animate/headless-start', expect.objectContaining({ effect: 'rainbow' }));
  });
  it('nexus lighting effect, Mirror mode, starts screen mirror', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'rgbEffect', mode: 'screen' } });
    expect(postService).toHaveBeenCalledWith('/lighting/screen/headless-start', expect.objectContaining({ effect: 'average' }));
  });
  it('nexus lighting effect, Media mode, plays the last media', async () => {
    fetchService.mockResolvedValueOnce({ mediaId: 'm1', item: { id: 'm1' } });
    postService.mockResolvedValueOnce({});
    await executeDeckAction({ type: 'nexus', action: { op: 'rgbEffect', mode: 'gif' } });
    expect(postService).toHaveBeenCalledWith('/media/m1/play', {});
    expect(postService).not.toHaveBeenCalledWith('/media/idle', {});
  });
  it('nexus lighting effect, Media mode with an empty library, idles instead of falling to Off', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'rgbEffect', mode: 'gif' } });
    expect(postService).toHaveBeenCalledWith('/media/idle', {});
  });
  it('nexus lighting preset activates the layout preset', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'lightingPreset', presetId: 'p 1' } });
    expect(postService).toHaveBeenCalledWith('/devices/lighting-devices/layout-presets/p%201/activate', {});
  });
  it('nexus cooling mode applies the built-in profile', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'fanProfile', profile: 'turbo' } });
    expect(postService).toHaveBeenCalledWith('/cooling/profile/turbo', {});
  });
  it('nexus cooling preset activates the saved preset', async () => {
    await executeDeckAction({ type: 'nexus', action: { op: 'coolingPreset', presetId: 'c1' } });
    expect(postService).toHaveBeenCalledWith('/cooling/presets/c1/activate', {});
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

describe('executeDeckAction → monitoring press', () => {
  beforeEach(() => { postService.mockClear(); fetchService.mockClear(); });

  const monitoringAction = (press: 'none' | 'taskManager' | 'monitoringPage' | undefined) => ({
    type: 'monitoring' as const, category: 'cpu' as const, sensor: 'x', style: 'line' as const, press,
  });

  it('taskManager opens the OS task manager via the service', async () => {
    await executeDeckAction(monitoringAction('taskManager'));
    expect(postService).toHaveBeenCalledWith('/system/open-task-manager', {});
  });

  it('monitoringPage fires the deck-open-monitoring bridge event', async () => {
    const handler = vi.fn();
    const off = onDeckOpenMonitoring(handler);
    await executeDeckAction(monitoringAction('monitoringPage'));
    off();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(postService).not.toHaveBeenCalled();
  });

  it('monitoringPage is a no-op REST-wise with no listener registered (panel surfaces)', async () => {
    await executeDeckAction(monitoringAction('monitoringPage'));
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });

  it('none/absent press does nothing', async () => {
    await executeDeckAction(monitoringAction('none'));
    await executeDeckAction(monitoringAction(undefined));
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });
});

describe('executeDeckAction → weather', () => {
  beforeEach(() => { postService.mockClear(); fetchService.mockClear(); });

  it('is a no-op on press - display-only, no press field in the wire contract', async () => {
    await executeDeckAction({ type: 'weather', units: 'auto' });
    expect(postService).not.toHaveBeenCalled();
    expect(fetchService).not.toHaveBeenCalled();
  });
});

describe('executeDeckAction → playAudio', () => {
  beforeEach(() => { postService.mockClear(); fetchService.mockClear(); });

  it('posts the stored path and volume to the audio-play route', async () => {
    await executeDeckAction({ type: 'playAudio', path: 'C:\\sounds\\boop.wav', volume: 80 });
    expect(postService).toHaveBeenCalledWith('/system/audio/play', { path: 'C:\\sounds\\boop.wav', volume: 80 });
  });

  it('passes an undefined volume through unchanged (server-side default)', async () => {
    await executeDeckAction({ type: 'playAudio', path: '/tmp/boop.wav' });
    expect(postService).toHaveBeenCalledWith('/system/audio/play', { path: '/tmp/boop.wav', volume: undefined });
  });
});

describe('isPrivilegedDeckAction', () => {
  it('is true for each desktop-token-only action type', () => {
    expect(isPrivilegedDeckAction({ type: 'openFile', path: '' })).toBe(true);
    expect(isPrivilegedDeckAction({ type: 'openFolder', path: '' })).toBe(true);
    expect(isPrivilegedDeckAction({ type: 'hotkey', keys: 'ctrl+c' })).toBe(true);
    expect(isPrivilegedDeckAction({ type: 'hotkeySwitch', keysA: 'a', keysB: 'b' })).toBe(true);
    expect(isPrivilegedDeckAction({ type: 'text', text: 'hi' })).toBe(true);
    expect(isPrivilegedDeckAction({ type: 'playAudio', path: '' })).toBe(true);
  });

  it('is false for an ordinary action', () => {
    expect(isPrivilegedDeckAction({ type: 'openUrl', url: 'https://x.com' })).toBe(false);
    expect(isPrivilegedDeckAction({ type: 'power', action: 'lock' })).toBe(false);
  });

  it('is true for a sequence carrying a privileged step anywhere in it', () => {
    const action: DeckAction = {
      type: 'sequence',
      steps: [
        { action: { type: 'openUrl', url: 'https://x.com' } },
        { action: { type: 'hotkey', keys: 'ctrl+c' } },
      ],
    };
    expect(isPrivilegedDeckAction(action)).toBe(true);
  });

  it('is false for a sequence with no privileged step', () => {
    const action: DeckAction = {
      type: 'sequence',
      steps: [{ action: { type: 'openUrl', url: 'https://x.com' } }],
    };
    expect(isPrivilegedDeckAction(action)).toBe(false);
  });

  it('checks both branches of a toggle', () => {
    const onPrivileged: DeckAction = { type: 'toggle', on: { type: 'text', text: 'hi' }, off: { type: 'power', action: 'lock' } };
    const offPrivileged: DeckAction = { type: 'toggle', on: { type: 'power', action: 'lock' }, off: { type: 'text', text: 'hi' } };
    const neitherPrivileged: DeckAction = { type: 'toggle', on: { type: 'power', action: 'lock' }, off: { type: 'openUrl', url: 'x' } };
    expect(isPrivilegedDeckAction(onPrivileged)).toBe(true);
    expect(isPrivilegedDeckAction(offPrivileged)).toBe(true);
    expect(isPrivilegedDeckAction(neitherPrivileged)).toBe(false);
  });
});

describe('executeDeckAction → /panel/deck/dispatch', () => {
  beforeEach(() => { postService.mockClear(); fetchService.mockClear(); });

  const location: DeckDispatchLocation = { deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [2], slot: 3 };

  it('a privileged action dispatches server-side instead of hitting its own route', async () => {
    await executeDeckAction({ type: 'hotkey', keys: 'ctrl+c' }, location);
    expect(postService).toHaveBeenCalledTimes(1);
    expect(postService).toHaveBeenCalledWith('/panel/deck/dispatch', {
      deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [2], slot: 3,
    });
  });

  it('carries the resolved toggle branch on the dispatch body', async () => {
    await executeDeckAction({ type: 'text', text: 'hi' }, location, 'off');
    expect(postService).toHaveBeenCalledWith('/panel/deck/dispatch', {
      deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [2], slot: 3, branch: 'off',
    });
  });

  it('a sequence containing a privileged step dispatches once as a whole, never running any step locally', async () => {
    const action: DeckAction = {
      type: 'sequence',
      steps: [
        { action: { type: 'openUrl', url: 'https://x.com' } },
        { action: { type: 'hotkey', keys: 'ctrl+c' } },
      ],
    };
    await executeDeckAction(action, location);
    expect(postService).toHaveBeenCalledTimes(1);
    expect(postService).toHaveBeenCalledWith('/panel/deck/dispatch', {
      deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [2], slot: 3,
    });
  });

  it('a non-privileged action ignores the location and takes its usual direct route', async () => {
    await executeDeckAction({ type: 'openUrl', url: 'https://x.com' }, location);
    expect(postService).toHaveBeenCalledWith('/system/open-url', { url: 'https://x.com' });
    expect(postService).not.toHaveBeenCalledWith('/panel/deck/dispatch', expect.anything());
  });

  it('a privileged action with no location falls back to its own direct route', async () => {
    await executeDeckAction({ type: 'hotkey', keys: 'ctrl+c' });
    expect(postService).toHaveBeenCalledWith('/system/input/keys', { key: 'KeyC', ctrl: true, shift: false, alt: false, meta: false });
    expect(postService).not.toHaveBeenCalledWith('/panel/deck/dispatch', expect.anything());
  });
});
