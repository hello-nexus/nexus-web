import { describe, expect, it } from 'vitest';
import {
  backgroundModeBeforeSkin,
  encodeSkinBackgroundMode,
  normalizePanelBackgroundMode,
  skinBackgroundHeld,
} from '../background/panelBackground';
import { chooseBackgroundMode, pickSkin, type BackgroundSwitch, type SkinBackgroundFields } from './skinBackgroundSwitch';

const unskinned = { skin: null, skinOverrides: {}, backgroundHeld: null, backgroundTemplates: { aurora: 2 } } as const;
const wallpaper: SkinBackgroundFields = {
  ...unskinned,
  backgroundMode: 'solid',
  backgroundModeBefore: 'solid',
  backdrop: 'wallpaper',
  backgroundFrost: 20,
  backgroundOpacity: 0.7,
  backgroundEffect: 'plasma',
};
const aurora: SkinBackgroundFields = {
  ...unskinned,
  backgroundMode: 'shader',
  backgroundModeBefore: 'shader',
  backdrop: 'theme',
  backgroundFrost: 30,
  backgroundOpacity: 0.4,
  backgroundEffect: 'aurora',
};

// Apply a switch the way the hook does, then read the record back as a reload would.
function step(cur: SkinBackgroundFields, change: BackgroundSwitch): SkinBackgroundFields {
  const next = { ...cur, ...change.theme };
  const stored = change.patch.backgroundMode;
  if (stored === undefined) return next;
  return { ...next, backgroundMode: normalizePanelBackgroundMode(stored), backgroundModeBefore: backgroundModeBeforeSkin(stored), backgroundHeld: skinBackgroundHeld(stored) };
}

describe('skin background hold encoding', () => {
  it('round-trips the live mode, the pre-skin mode and the held values', () => {
    const held = { backdrop: 'wallpaper' as const, frost: 30, opacity: 0.4, effect: 'aurora' };
    for (const live of ['skin', 'solid', 'shader', 'media'] as const) {
      const stored = encodeSkinBackgroundMode(live, 'shader', held);
      expect(normalizePanelBackgroundMode(stored)).toBe(live);
      expect(backgroundModeBeforeSkin(stored)).toBe('shader');
      expect(skinBackgroundHeld(stored)).toEqual(held);
    }
  });

  it('reads the older values', () => {
    expect(skinBackgroundHeld('skin:shader')).toBeNull();
    expect(skinBackgroundHeld('skin')).toBeNull();
    expect(skinBackgroundHeld('skin:shader:nope:x:y')).toBeNull();
    expect(skinBackgroundHeld('skin:media:theme:0:1')).toEqual({ backdrop: 'theme', frost: 0, opacity: 1 });
    expect(skinBackgroundHeld('skin:media:theme:0:1:not-an-effect')).toEqual({ backdrop: 'theme', frost: 0, opacity: 1 });
    expect(backgroundModeBeforeSkin('skin:media:theme:0:1')).toBe('media');
    expect(backgroundModeBeforeSkin('shader')).toBe('shader');
    expect(skinBackgroundHeld('shader')).toBeNull();
  });
});

describe('per-skin background mode', () => {
  it('Solid -> Neon -> Neon set to Solid -> LCD -> Neon -> none restores the wallpaper, frost and opacity', () => {
    let cur = step(wallpaper, pickSkin(wallpaper, 'neon'));
    expect(cur).toMatchObject({ skin: 'neon', backgroundMode: 'skin', backdrop: 'theme', backgroundFrost: 0, backgroundOpacity: 1 });

    const solid = chooseBackgroundMode(cur, 'solid');
    expect(solid.patch.skinOverrides).toEqual({ neon: { backgroundMode: 'solid' } });
    cur = step(cur, solid);
    expect(cur).toMatchObject({ backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrost: 20, backgroundOpacity: 0.7 });

    cur = step(cur, pickSkin(cur, 'lcd'));
    expect(cur).toMatchObject({ skin: 'lcd', backgroundMode: 'skin', backdrop: 'theme' });
    cur = step(cur, pickSkin(cur, 'neon'));
    expect(cur).toMatchObject({ skin: 'neon', backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrost: 20, backgroundOpacity: 0.7 });

    const none = pickSkin(cur, null);
    expect(none.patch).toEqual({ skin: '', backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrostLevel: 20, backgroundOpacity: 0.7 });
    expect(step(cur, none)).toMatchObject({ skin: null, backgroundMode: 'solid', backgroundHeld: null });
  });

  it('aurora -> Neon (remembers Solid) -> LCD -> Neon -> none restores aurora with its preset', () => {
    const start = { ...aurora, skinOverrides: { neon: { backgroundMode: 'solid' as const } } };
    let cur = step(start, pickSkin(start, 'neon'));
    expect(cur).toMatchObject({ skin: 'neon', backgroundMode: 'solid', backgroundModeBefore: 'shader' });
    cur = step(cur, pickSkin(cur, 'lcd'));
    expect(cur).toMatchObject({ backgroundMode: 'skin', backgroundModeBefore: 'shader', backgroundFrost: 0 });
    cur = step(cur, pickSkin(cur, 'neon'));
    expect(cur).toMatchObject({ backgroundMode: 'solid', backgroundModeBefore: 'shader' });
    const none = pickSkin({ ...cur, backgroundEffect: 'fire' }, null);
    expect(none.patch).toEqual({ skin: '', backgroundMode: 'shader', backdrop: 'theme', backgroundFrostLevel: 30, backgroundOpacity: 0.4, backgroundEffect: 'aurora', backgroundTemplate: 2 });
  });

  it('Solid -> Sketch (remembers an animation) -> none restores Solid and the effect', () => {
    const start = { ...wallpaper, skinOverrides: { sketch: { backgroundMode: 'shader' as const, backgroundEffect: 'aurora' } } };
    const on = pickSkin(start, 'sketch');
    expect(on.patch).toMatchObject({ skin: 'sketch', backgroundEffect: 'aurora', backgroundTemplate: 2 });
    const cur = step(start, on);
    expect(cur).toMatchObject({ backgroundMode: 'shader', backgroundEffect: 'aurora', backgroundModeBefore: 'solid' });
    expect(step(cur, pickSkin(cur, null))).toMatchObject({ skin: null, backgroundMode: 'solid', backgroundEffect: 'plasma', backdrop: 'wallpaper', backgroundFrost: 20, backgroundOpacity: 0.7 });
  });

  it('keeps the held background and the opacity set under Skin across hops', () => {
    let cur = step(aurora, pickSkin(aurora, 'lcd'));
    cur = { ...cur, backgroundOpacity: 0.5 };
    const hop = pickSkin(cur, 'crt');
    expect(hop.theme.backgroundOpacity).toBeUndefined();
    cur = step(cur, hop);
    expect(cur.backgroundHeld).toEqual({ backdrop: 'theme', frost: 30, opacity: 0.4, effect: 'aurora' });
    expect(step(cur, pickSkin(cur, null))).toMatchObject({ backgroundMode: 'shader', backgroundFrost: 30, backgroundOpacity: 0.4 });
  });

  it('a wallpaper held before a different mode does not bring its backdrop or opacity along', () => {
    const cur = step(wallpaper, pickSkin(wallpaper, 'lcd'));
    expect(chooseBackgroundMode(cur, 'shader').theme).toMatchObject({ backgroundMode: 'shader', backdrop: 'theme', backgroundFrost: 20, backgroundOpacity: 1 });
  });

  it('stores the effect only with Animations, and nothing without a skin', () => {
    const cur = { ...wallpaper, skin: 'neon' as const };
    expect(chooseBackgroundMode(cur, 'shader').patch.skinOverrides).toEqual({ neon: { backgroundMode: 'shader', backgroundEffect: 'plasma' } });
    expect(chooseBackgroundMode({ ...cur, skinOverrides: { neon: { backgroundMode: 'media' } } }, 'skin').patch.skinOverrides).toEqual({});
    expect(chooseBackgroundMode(wallpaper, 'shader').patch).toEqual({ backgroundMode: 'shader' });
  });

  it('a skinned record stored before the hold existed captures it on its next switch', () => {
    const legacy = { ...aurora, skin: 'neon' as const };
    const cur = step(legacy, pickSkin(legacy, 'lcd'));
    expect(cur.backgroundHeld).toEqual({ backdrop: 'theme', frost: 30, opacity: 0.4, effect: 'aurora' });
    const orphan: SkinBackgroundFields = { ...aurora, skin: 'lcd', backgroundMode: 'skin', backdrop: 'theme', backgroundFrost: 0, backgroundOpacity: 1 };
    expect(pickSkin(orphan, null).patch).toEqual({ skin: '', backgroundMode: 'shader' });
  });

  it('a skin:shader record that shows Solid still restores Animations when the skin is removed', () => {
    const legacy: SkinBackgroundFields = {
      ...aurora,
      skin: 'neon',
      backgroundMode: normalizePanelBackgroundMode('skin:shader'),
      backgroundModeBefore: backgroundModeBeforeSkin('skin:shader'),
      backgroundHeld: skinBackgroundHeld('skin:shader'),
      backdrop: 'theme',
      backgroundFrost: 0,
      backgroundOpacity: 1,
    };
    const solid = chooseBackgroundMode(legacy, 'solid');
    expect(normalizePanelBackgroundMode(solid.patch.backgroundMode)).toBe('solid');
    expect(backgroundModeBeforeSkin(solid.patch.backgroundMode)).toBe('shader');
    const cur = step(legacy, solid);
    expect(cur).toMatchObject({ backgroundMode: 'solid', backgroundModeBefore: 'shader' });
    expect(step(cur, pickSkin(cur, null))).toMatchObject({ skin: null, backgroundMode: 'shader', backgroundHeld: null });
  });
});
