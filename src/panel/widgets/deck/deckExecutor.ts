import { fetchService, postService } from '../../../api/service';
import { startAnimate, setGlobalBrightness, setLightingDevicePower } from '../../../api/lighting';
import { applyProfile, setFanSpeed } from '../../../api/cooling';
import { controlMedia } from '../../../hooks/useMedia';
import type { MediaSession } from '../../../hooks/useMedia';
import { requestOpenMonitoring } from './deckMonitoringNav';
import type { DeckAction, DeckMonitoringPress, DeckSequenceStep, DeckSystemAction, DeckNexusAction } from './types';

const DEFAULT_GAP_MS = 60;
const VOLUME_STEP = 0.05;
const BRIGHTNESS_STEP = 10;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
// User-configured sequence pacing - not a race patch (avoid-sleep-as-patch).
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface VolumeState { supported: boolean; volume: number; muted: boolean; }
interface DisplayInfo { id: string; brightness?: number; }

/**
 * Dispatch a single deck action via direct REST. Folder navigation is resolved
 * in the widget, not here. A toggle defaults to its `on` branch; the widget
 * normally unwraps toggles against live state before calling this.
 */
export async function executeDeckAction(action: DeckAction): Promise<void> {
  switch (action.type) {
    case 'launchApp':
      await postService(`/shortcuts/launch?targetId=${encodeURIComponent(action.appId)}`, {});
      return;
    case 'openFile':
    case 'openFolder':
      await postService('/system/open-path', { path: action.path });
      return;
    case 'openUrl':
      await postService('/system/open-url', { url: action.url });
      return;
    case 'system':
      await runSystem(action.action);
      return;
    case 'hotkey': {
      const body = parseHotkey(action.keys);
      if (body) await postService('/system/input/keys', body);
      return;
    }
    case 'text':
      await postService('/system/input/text', { text: action.text });
      return;
    case 'power':
      await postService(`/system/power/${action.action}`, {});
      return;
    case 'audioOutput':
      await postService('/system/audio/default-output', { deviceId: action.deviceId });
      return;
    case 'audioInput':
      await postService('/system/audio/default-input', { deviceId: action.deviceId });
      return;
    case 'playAudio':
      // No route was in the DeckActionConverter wire contract for a
      // touch-widget-triggered playback trigger (only the stored path/volume
      // fields); a physical deck's press plays server-side via
      // DeckActionExecutor, which this touch-widget dispatcher never reaches.
      // POST /system/audio/play mirrors this file's naming convention - the
      // service side must confirm or correct the route/payload shape.
      await postService('/system/audio/play', { path: action.path, volume: action.volume });
      return;
    case 'nexus':
      await runNexus(action.action);
      return;
    case 'monitoring':
      await runMonitoringPress(action.press ?? 'none');
      return;
    case 'sequence':
      await runSequence(action.steps);
      return;
    case 'toggle':
      await executeDeckAction(action.on);
      return;
    case 'page':
    case 'pageIndicator':
      // Page navigation is client-local widget state (DeckWidget.onCell), not a
      // REST call; a physical deck's page nav is service-side. No-op here so a
      // 'page' step buried in a sequence/toggle branch never REST-errors.
      return;
    case 'deckBrightness':
    case 'deckSleep':
      // Physical-deck-only: these control a physical Stream Deck's own screen
      // (brightness / blank-until-next-press). The touch widget has no
      // physical deck to act on; the service applies them when a real device
      // key is pressed.
      return;
    case 'hotkeySwitch': {
      const keys = nextHotkeySwitchKeys(action);
      const body = parseHotkey(keys);
      if (body) await postService('/system/input/keys', body);
      return;
    }
  }
}

// Best-effort widget-side alternation: keyed by the action's own key pair, so
// two slots sharing the exact same keysA/keysB share a latch. The service
// owns the authoritative per-key latch for a physical deck's own presses.
const hotkeySwitchLatch = new Map<string, boolean>();

function nextHotkeySwitchKeys(action: Extract<DeckAction, { type: 'hotkeySwitch' }>): string {
  const latchKey = `${action.keysA} ${action.keysB}`;
  const useB = hotkeySwitchLatch.get(latchKey) ?? false;
  hotkeySwitchLatch.set(latchKey, !useB);
  return useB ? action.keysB : action.keysA;
}

async function runSystem(a: DeckSystemAction): Promise<void> {
  switch (a.op) {
    case 'volumeUp':
    case 'volumeDown': {
      const cur = await fetchService<VolumeState>('/system/volume');
      const base = cur?.volume ?? 0;
      const next = clamp(base + (a.op === 'volumeUp' ? 1 : -1) * (a.step ?? VOLUME_STEP), 0, 1);
      await postService('/system/volume', { volume: next });
      return;
    }
    case 'volumeSet':
      await postService('/system/volume', { volume: clamp(a.value ?? 0, 0, 1) });
      return;
    case 'muteToggle': {
      const cur = await fetchService<VolumeState>('/system/volume');
      await postService('/system/volume/mute', { muted: !(cur?.muted ?? false) });
      return;
    }
    case 'openSettings':
      await postService('/system/open-settings', {});
      return;
    case 'mediaPlayPause':
    case 'mediaNext':
    case 'mediaPrev': {
      const { source, playing } = await resolveMedia(a.source);
      if (!source) return;
      const act = a.op === 'mediaNext' ? 'next' : a.op === 'mediaPrev' ? 'previous' : (playing ? 'pause' : 'play');
      await controlMedia(source, act);
      return;
    }
    case 'brightnessUp':
    case 'brightnessDown':
    case 'brightnessSet': {
      if (!a.displayId) return;
      let brightness = a.value ?? 0;
      if (a.op !== 'brightnessSet') {
        const list = await fetchService<{ displays?: DisplayInfo[] }>('/displays');
        const cur = list?.displays?.find(d => d.id === a.displayId)?.brightness ?? 50;
        brightness = clamp(cur + (a.op === 'brightnessUp' ? 1 : -1) * (a.step ?? BRIGHTNESS_STEP), 0, 100);
      }
      await postService(`/displays/${encodeURIComponent(a.displayId)}/brightness`, { brightness: clamp(brightness, 0, 100) });
      return;
    }
  }
}

async function runNexus(a: DeckNexusAction): Promise<void> {
  switch (a.op) {
    case 'rgbEffect':
      if (a.effect) await startAnimate(a.effect);
      return;
    case 'rgbScene':
      if (a.profileId) await postService(`/profiles/${encodeURIComponent(a.profileId)}/switch`, {});
      return;
    case 'lightingBrightness':
      await setGlobalBrightness(clamp(a.value ?? 1, 0, 1));
      return;
    case 'lightingPower':
      if (a.deviceId) await setLightingDevicePower(a.deviceId, a.on ?? true);
      return;
    case 'fanProfile':
      if (a.profile) await applyProfile(a.profile);
      return;
    case 'fanSpeed':
      if (a.fanId) await setFanSpeed(a.fanId, clamp(a.value ?? 0, 0, 100));
      return;
    case 'y70Power':
      await postService('/y70/toggle', { toggle: !(a.on ?? true) });
      return;
    case 'y70Brightness':
      await postService('/y70/brightness', { brightness: clamp(a.value ?? 0, 0, 100) });
      return;
    case 'y70Rotation':
      if (a.orientation) await postService('/y70/rotation', { orientation: a.orientation });
      return;
  }
}

/**
 * Tapping a monitoring tile is optional (the tile's primary job is display,
 * not control). 'taskManager' opens the OS's process manager via the
 * service (taskmgr.exe / Activity Monitor - see DeckActionExecutor's port
 * of this for a physical key). 'monitoringPage' asks the desktop dashboard's
 * router to navigate there (no-op on a surface with no Monitoring page, e.g.
 * the panel).
 *
 * TODO: /system/open-task-manager has no matching service route yet -
 * SystemActions.OpenTaskManager is only wired to the physical-key press path
 * (DeckActionExecutor), not exposed over HTTP. postService fails closed
 * (returns null, no throw), so this silently no-ops from a touch-widget
 * press until the service adds the route.
 */
async function runMonitoringPress(press: DeckMonitoringPress): Promise<void> {
  switch (press) {
    case 'taskManager':
      await postService('/system/open-task-manager', {});
      return;
    case 'monitoringPage':
      requestOpenMonitoring();
      return;
    case 'none':
      return;
  }
}

export async function runSequence(steps: readonly DeckSequenceStep[]): Promise<void> {
  for (const step of steps) {
    try { await executeDeckAction(step.action); } catch { /* keep the sequence going */ }
    const wait = (step.pressMs ?? 0) + (step.gapAfterMs ?? DEFAULT_GAP_MS);
    if (wait > 0) await delay(wait);
  }
}

async function resolveMedia(source?: string): Promise<{ source: string | null; playing: boolean }> {
  if (source) return { source, playing: false };
  const sessions = await fetchService<Record<string, MediaSession>>('/api/media');
  const entries = Object.entries(sessions ?? {});
  if (entries.length === 0) return { source: null, playing: false };
  const active = entries.find(([, s]) => s.playback?.playing && !s.playback?.stopped) ?? entries[0];
  return { source: active[0], playing: active[1].playback?.playing ?? false };
}

export interface ParsedHotkey {
  key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean;
}

/** Parse "ctrl+shift+m" → a /system/input/keys body. Returns null if no key. */
export function parseHotkey(keys: string): ParsedHotkey | null {
  const tokens = (keys ?? '').split('+').map(t => t.trim().toLowerCase()).filter(Boolean);
  let key = '';
  const mods = { ctrl: false, shift: false, alt: false, meta: false };
  for (const tok of tokens) {
    if (tok === 'ctrl' || tok === 'control') mods.ctrl = true;
    else if (tok === 'shift') mods.shift = true;
    else if (tok === 'alt' || tok === 'option' || tok === 'opt') mods.alt = true;
    else if (tok === 'meta' || tok === 'cmd' || tok === 'command' || tok === 'win' || tok === 'super') mods.meta = true;
    else key = canonicalKey(tok);
  }
  if (!key) return null;
  return { key, ...mods };
}

function canonicalKey(tok: string): string {
  if (tok.length === 1 && tok >= 'a' && tok <= 'z') return 'Key' + tok.toUpperCase();
  if (tok.length === 1 && tok >= '0' && tok <= '9') return 'Digit' + tok;
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(tok)) return 'F' + tok.slice(1);
  const named: Record<string, string> = {
    space: 'Space', enter: 'Enter', return: 'Enter', tab: 'Tab', esc: 'Escape', escape: 'Escape',
    backspace: 'Backspace', delete: 'Delete', del: 'Delete', insert: 'Insert',
    home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    printscreen: 'PrintScreen', '.': 'Period',
  };
  return named[tok] ?? '';
}
