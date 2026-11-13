import { describe, expect, it } from 'vitest';
import {
  backgroundModeBeforeSkin,
  encodeSkinBackgroundMode,
  normalizePanelBackgroundMode,
  skinBackgroundHeld,
} from '../background/panelBackground';
import { enterSkinBackground, leaveSkinBackground, type SkinBackgroundFields } from './skinBackgroundSwitch';

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
