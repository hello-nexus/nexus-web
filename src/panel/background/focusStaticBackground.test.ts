import { describe, expect, it } from 'vitest';
import type { FocusMode, FocusStatus } from '../../api/focus';
import type { PanelThemeState } from '../theme/panelTheme';
import { focusStaticBackgroundMode, withStaticBackground } from './focusStaticBackground';

function status(activeModeId: string | null, staticPanelBackgrounds: boolean): FocusStatus {
  const mode: FocusMode = {
    id: 'game', name: 'Game Mode', icon: 'gamepad', builtIn: true, trigger: 'game',
    holdNotifications: true, holdBackgroundTraffic: true, turnPanelDisplaysOff: false,
    staticPanelBackgrounds, exitGraceSeconds: 3,
  };
  return { activeModeId, reason: activeModeId ? 'auto' : '', activatedUtcMs: 0, games: [], modes: [mode], availableTriggers: ['manual', 'game'] };
}

describe('focusStaticBackgroundMode', () => {
  it('forces the solid background on host-rendered panels while the mode is active', () => {
    expect(focusStaticBackgroundMode(status('game', true), 'y70')).toBe('Game Mode');
    expect(focusStaticBackgroundMode(status('game', true), 'lcd-wide')).toBe('Game Mode');
  });

  it('leaves panels that render themselves alone', () => {
    expect(focusStaticBackgroundMode(status('game', true), 'q60')).toBeNull();
    expect(focusStaticBackgroundMode(status('game', true), 'phone')).toBeNull();
  });

  it('does nothing when the mode is inactive or the toggle is off', () => {
    expect(focusStaticBackgroundMode(status(null, true), 'y70')).toBeNull();
    expect(focusStaticBackgroundMode(status('game', false), 'y70')).toBeNull();
    expect(focusStaticBackgroundMode(null, 'y70')).toBeNull();
  });
});

describe('withStaticBackground', () => {
  const base = { backgroundColor: '#ff0000', backgroundColorLight: '#ffaaaa', backgroundMediaType: null, backgroundSlideshow: false } as unknown as PanelThemeState;

  it('swaps a shader for the default solid, dropping the saved color', () => {
    const out = withStaticBackground({ ...base, backgroundMode: 'shader' });
    expect(out.backgroundMode).toBe('solid');
    expect(out.backgroundColor).toBe('');
    expect(out.backgroundColorLight).toBe('');
  });

  it('swaps animated media or a slideshow', () => {
    expect(withStaticBackground({ ...base, backgroundMode: 'media', backgroundMediaType: 'animated' } as PanelThemeState).backgroundMode).toBe('solid');
    expect(withStaticBackground({ ...base, backgroundMode: 'media', backgroundSlideshow: true }).backgroundMode).toBe('solid');
  });

  it('keeps a still image and a solid background as they are', () => {
    const still = { ...base, backgroundMode: 'media', backgroundMediaType: 'static' } as PanelThemeState;
    expect(withStaticBackground(still)).toBe(still);
    const solid = { ...base, backgroundMode: 'solid' } as PanelThemeState;
    expect(withStaticBackground(solid)).toBe(solid);
  });
});
