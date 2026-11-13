import { describe, expect, it } from 'vitest';
import {
  backgroundModeBeforeSkin,
  encodeSkinBackgroundMode,
  normalizePanelBackgroundMode,
  skinBackgroundHeld,
} from '../background/panelBackground';
import {
  chooseBackgroundMode,
  enterSkinBackground,
  leaveSkinBackground,
  pickSkin,
  type SkinBackgroundFields,
  type SkinPickFields,
  type SkinPickSwitch,
} from './skinBackgroundSwitch';

const wallpaper: SkinBackgroundFields = {
  backgroundMode: 'solid',
  backgroundModeBefore: 'solid',
  backdrop: 'wallpaper',
  backgroundFrost: 20,
  backgroundOpacity: 0.7,
};
const shader: SkinBackgroundFields = {
  backgroundMode: 'shader',
  backgroundModeBefore: 'shader',
  backdrop: 'theme',
  backgroundFrost: 30,
  backgroundOpacity: 0.4,
};

// Apply a switch the way the hook does, so the next step reads the stored result back.
function apply(cur: SkinBackgroundFields, change: { theme: Partial<SkinBackgroundFields> }): SkinBackgroundFields {
  return { ...cur, ...change.theme };
}

describe('skin background hold', () => {
  it('round-trips the held values through the stored mode string', () => {
    const stored = encodeSkinBackgroundMode('shader', { backdrop: 'wallpaper', frost: 30, opacity: 0.4 });
    expect(normalizePanelBackgroundMode(stored)).toBe('skin');
    expect(backgroundModeBeforeSkin(stored)).toBe('shader');
    expect(skinBackgroundHeld(stored)).toEqual({ backdrop: 'wallpaper', frost: 30, opacity: 0.4 });
  });

  it('reads the older values without a hold as no hold', () => {
    expect(skinBackgroundHeld('skin:shader')).toBeNull();
    expect(skinBackgroundHeld('skin')).toBeNull();
    expect(skinBackgroundHeld('skin:shader:nope:x:y')).toBeNull();
    expect(backgroundModeBeforeSkin('skin:media:theme:0:1')).toBe('media');
  });

  it('wallpaper -> LCD -> None restores the wallpaper with its opacity and frost', () => {
    const entered = enterSkinBackground(wallpaper);
    expect(entered.patch).toMatchObject({ backdrop: 'theme', backgroundFrostLevel: 0, backgroundOpacity: 1 });
    const inSkin = apply(wallpaper, entered);
    expect(inSkin).toMatchObject({ backgroundMode: 'skin', backdrop: 'theme', backgroundFrost: 0, backgroundOpacity: 1 });
    // The patch survives a reload: the held values come back from the stored string alone.
    const reloaded: SkinBackgroundFields = {
      ...inSkin,
      backgroundModeBefore: backgroundModeBeforeSkin(entered.patch.backgroundMode),
      backgroundHeld: skinBackgroundHeld(entered.patch.backgroundMode),
    };
    const left = leaveSkinBackground(reloaded);
    expect(left.patch).toEqual({ backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrostLevel: 20, backgroundOpacity: 0.7 });
    expect(apply(reloaded, left)).toMatchObject({ backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrost: 20, backgroundOpacity: 0.7, backgroundHeld: null });
  });

  it('shader at 40% with frost -> LCD -> None restores the shader, frost and opacity', () => {
    const inSkin = apply(shader, enterSkinBackground(shader));
    const left = leaveSkinBackground(inSkin);
    expect(left.patch).toEqual({ backgroundMode: 'shader', backdrop: 'theme', backgroundFrostLevel: 30, backgroundOpacity: 0.4 });
  });

  it('shader at 40% with frost -> LCD -> Solid chip keeps the frost and opacity on the theme backdrop', () => {
    const inSkin = apply(shader, enterSkinBackground(shader));
    const left = leaveSkinBackground(inSkin, 'solid');
    expect(left.patch).toEqual({ backgroundMode: 'solid', backdrop: 'theme', backgroundFrostLevel: 30, backgroundOpacity: 0.4 });
  });

  it('a wallpaper held before a different chip does not bring its backdrop or opacity along', () => {
    const inSkin = apply(wallpaper, enterSkinBackground(wallpaper));
    const left = leaveSkinBackground(inSkin, 'shader');
    expect(left.patch).toEqual({ backgroundMode: 'shader', backdrop: 'theme', backgroundFrostLevel: 20, backgroundOpacity: 1 });
  });

  it('keeps the first hold when the Skin chip is picked again', () => {
    const inSkin = apply(wallpaper, enterSkinBackground(wallpaper));
    const again = enterSkinBackground(inSkin);
    expect(again.theme.backgroundHeld).toEqual({ backdrop: 'wallpaper', frost: 20, opacity: 0.7 });
  });

  it('changes only the mode when nothing was held', () => {
    const legacy: SkinBackgroundFields = { ...shader, backgroundMode: 'skin', backdrop: 'theme', backgroundFrost: 0, backgroundOpacity: 1, backgroundHeld: null };
    expect(leaveSkinBackground(legacy).patch).toEqual({ backgroundMode: 'shader' });
  });
});

describe('per-skin background mode', () => {
  const unskinned = (fields: SkinBackgroundFields): SkinPickFields => ({
    ...fields, skin: null, skinOverrides: {}, backgroundEffect: 'plasma', backgroundTemplates: { aurora: 2 },
  });
  const step = (cur: SkinPickFields, change: SkinPickSwitch): SkinPickFields => ({ ...cur, ...change.theme });

  it('starts every skin on Skin, remembers a mode picked under it, and gives the pre-skin background back', () => {
    let cur = step(unskinned(wallpaper), pickSkin(unskinned(wallpaper), 'neon'));
    expect(cur).toMatchObject({ skin: 'neon', backgroundMode: 'skin', backdrop: 'theme', backgroundFrost: 0, backgroundOpacity: 1 });

    const solid = chooseBackgroundMode(cur, 'solid');
    expect(solid.patch.skinOverrides).toEqual({ neon: { backgroundMode: 'solid' } });
    cur = step(cur, solid);
    expect(cur).toMatchObject({ backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrost: 20, backgroundOpacity: 0.7 });

    cur = step(cur, pickSkin(cur, 'lcd'));
    expect(cur).toMatchObject({ skin: 'lcd', backgroundMode: 'skin', backgroundModeBefore: 'solid' });

    cur = step(cur, pickSkin(cur, 'neon'));
    expect(cur).toMatchObject({ skin: 'neon', backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrost: 20, backgroundOpacity: 0.7 });

    const none = pickSkin(cur, null);
    expect(none.patch.skin).toBe('');
    expect(step(cur, none)).toMatchObject({ skin: null, backgroundMode: 'solid', backdrop: 'wallpaper', backgroundFrost: 20, backgroundOpacity: 0.7 });
  });

  it('keeps the held background across hops between skins on Skin', () => {
    let cur = step(unskinned(shader), pickSkin(unskinned(shader), 'lcd'));
    cur = { ...cur, backgroundOpacity: 0.5 };
    const hop = pickSkin(cur, 'crt');
    expect(hop.theme).toEqual({ skin: 'crt' });
    cur = step(cur, hop);
    expect(step(cur, pickSkin(cur, null))).toMatchObject({ skin: null, backgroundMode: 'shader', backgroundFrost: 30, backgroundOpacity: 0.4 });
  });

  it('applies the remembered effect with this panel preset for it', () => {
    const cur = { ...unskinned(shader), skinOverrides: { neon: { backgroundMode: 'shader' as const, backgroundEffect: 'aurora' } } };
    const change = pickSkin(cur, 'neon');
    expect(change.theme).toMatchObject({ skin: 'neon', backgroundMode: 'shader', backgroundEffect: 'aurora', backgroundTemplate: 2 });
    expect(change.patch).toEqual({ skin: 'neon', backgroundMode: 'shader', backgroundEffect: 'aurora', backgroundTemplate: 2 });
  });

  it('stores the effect only with Animations and nothing without a skin', () => {
    const cur = { ...unskinned(wallpaper), skin: 'neon' as const };
    expect(chooseBackgroundMode(cur, 'shader').patch.skinOverrides).toEqual({ neon: { backgroundMode: 'shader', backgroundEffect: 'plasma' } });
    expect(chooseBackgroundMode({ ...cur, skinOverrides: { neon: { backgroundMode: 'media' } } }, 'skin').patch.skinOverrides).toEqual({});
    expect(chooseBackgroundMode(unskinned(wallpaper), 'shader').patch).toEqual({ backgroundMode: 'shader' });
  });
});
