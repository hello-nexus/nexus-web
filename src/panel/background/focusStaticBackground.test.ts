import { describe, expect, it } from 'vitest';
import type { FocusMode, FocusStatus } from '../../api/focus';
import type { PanelThemeState } from '../theme/panelTheme';
import { focusForcesStaticBackground, withStaticBackground } from './focusStaticBackground';

function status(activeModeId: string | null, staticPanelBackgrounds: boolean): FocusStatus {
  const mode: FocusMode = {
    id: 'game', name: 'Game Mode', icon: 'gamepad', builtIn: true, trigger: 'game',
    holdNotifications: true, holdBackgroundTraffic: true, turnPanelDisplaysOff: false,
    staticPanelBackgrounds, exitGraceSeconds: 3,
  };
  return { activeModeId, reason: activeModeId ? 'auto' : '', activatedUtcMs: 0, games: [], modes: [mode], availableTriggers: ['manual', 'game'] };
}

describe('focusForcesStaticBackground', () => {
  it('forces the solid background on host-rendered panels while the mode is active', () => {
    expect(focusForcesStaticBackground(status('game', true), 'y70')).toBe(true);
    expect(focusForcesStaticBackground(status('game', true), 'lcd-wide')).toBe(true);
  });

  it('leaves panels that render themselves alone', () => {
    expect(focusForcesStaticBackground(status('game', true), 'q60')).toBe(false);
    expect(focusForcesStaticBackground(status('game', true), 'phone')).toBe(false);
  });

  it('does nothing when the mode is inactive or the toggle is off', () => {
    expect(focusForcesStaticBackground(status(null, true), 'y70')).toBe(false);
    expect(focusForcesStaticBackground(status('game', false), 'y70')).toBe(false);
    expect(focusForcesStaticBackground(null, 'y70')).toBe(false);
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
