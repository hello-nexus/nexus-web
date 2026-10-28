import { describe, expect, it } from 'vitest';
import { oobeAllowsDeckAction, oobeAllowsWidget } from './oobeRestriction';
import type { DeckAction } from '../widgets/deck/types';

describe('oobeAllowsWidget', () => {
  it('keeps lighting, media and the filtered deck live', () => {
    for (const type of ['lighting', 'media', 'deck']) expect(oobeAllowsWidget(type)).toBe(true);
  });

  it('blocks cooling, web view, mixer and every other widget', () => {
    for (const type of ['cooling', 'web-view', 'mixer', 'clock', 'monitoring', 'camera', 'obs', 'app:com.example.x']) {
      expect(oobeAllowsWidget(type)).toBe(false);
    }
  });
});

describe('oobeAllowsDeckAction', () => {
  const system = (op: string): DeckAction => ({ type: 'system', action: { op } } as DeckAction);
  const nexus = (op: string): DeckAction => ({ type: 'nexus', action: { op } } as DeckAction);

  it('allows volume and media keys', () => {
    for (const op of ['volumeUp', 'volumeDown', 'volumeSet', 'muteToggle', 'mediaPlayPause', 'mediaNext', 'mediaPrev']) {
      expect(oobeAllowsDeckAction(system(op))).toBe(true);
    }
  });

  it('allows lighting keys', () => {
    for (const op of ['rgbEffect', 'lightingBrightness', 'lightingBrightnessStep', 'lightingPowerToggle', 'lightingPreset']) {
      expect(oobeAllowsDeckAction(nexus(op))).toBe(true);
    }
  });

  it('allows page navigation', () => {
    expect(oobeAllowsDeckAction({ type: 'page', op: 'next' })).toBe(true);
    expect(oobeAllowsDeckAction({ type: 'pageIndicator' })).toBe(true);
  });

  it('blocks other system and nexus ops', () => {
    for (const op of ['openSettings', 'screenshot', 'screenRecord', 'taskManager', 'brightnessUp', 'brightnessSet']) {
      expect(oobeAllowsDeckAction(system(op))).toBe(false);
    }
    for (const op of ['fanProfile', 'coolingPreset', 'y70Power', 'y70Brightness', 'y70Rotation', 'toggleWindow']) {
      expect(oobeAllowsDeckAction(nexus(op))).toBe(false);
    }
  });

  it('blocks power, keys, text, urls, paths, apps, audio devices and monitoring presses', () => {
    const blocked: DeckAction[] = [
      { type: 'power', action: 'shutdown' },
      { type: 'hotkey', keys: 'ctrl+c' },
      { type: 'hotkeySwitch', keysA: 'a', keysB: 'b' },
      { type: 'text', text: 'hi' },
      { type: 'openUrl', url: 'https://example.com' },
      { type: 'openFile', path: 'C:\\x.exe' },
      { type: 'openFolder', path: 'C:\\' },
      { type: 'launchApp', appId: 'notepad' },
      { type: 'audioOutput', deviceId: 'd' },
      { type: 'audioInput', deviceId: 'd' },
      { type: 'playAudio', path: 'x.wav' },
      { type: 'monitoring', category: 'cpu', sensor: 'x', style: 'line', press: 'taskManager' } as DeckAction,
    ];
    for (const action of blocked) expect(oobeAllowsDeckAction(action)).toBe(false);
  });

  it('judges a sequence or toggle by every part', () => {
    const vol = system('muteToggle');
    const light = nexus('lightingPowerToggle');
    const power: DeckAction = { type: 'power', action: 'sleep' };
    expect(oobeAllowsDeckAction({ type: 'sequence', steps: [{ action: vol }, { action: light }] })).toBe(true);
    expect(oobeAllowsDeckAction({ type: 'sequence', steps: [{ action: vol }, { action: power }] })).toBe(false);
    expect(oobeAllowsDeckAction({ type: 'toggle', on: vol, off: light })).toBe(true);
    expect(oobeAllowsDeckAction({ type: 'toggle', on: vol, off: power })).toBe(false);
  });
});
