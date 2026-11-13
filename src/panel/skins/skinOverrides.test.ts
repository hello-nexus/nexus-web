import { describe, expect, it } from 'vitest';
import { normalizeSkinOverrides, resetSkinOverride, setSkinBackground, setSkinOverride } from './skinOverrides';
import { resolveSkin, type SkinThemeFields } from '../theme/panelSkin';
import { skinDef } from './skins';

const base: SkinThemeFields = {
  skin: null, skinOverrides: {}, accentSyncWithDesktop: false, accentColor: '', font: null, widgetOpacity: 1,
  backgroundMode: 'solid', backgroundModeBefore: 'solid',
};

describe('resolveSkin with overrides', () => {
  const overrides = { arcade: { accent: '#22c55e', font: 'lexend' } };
  it('uses the active skin entry, and the skin defaults for any other skin', () => {
    expect(resolveSkin({ ...base, skin: 'arcade', skinOverrides: overrides })).toMatchObject({ accent: '#22c55e', font: 'lexend' });
    expect(resolveSkin({ ...base, skin: 'lcd', skinOverrides: overrides })).toMatchObject({ accent: skinDef('lcd')!.accent, font: 'jura' });
  });
  it('overrides one field at a time', () => {
    expect(resolveSkin({ ...base, skin: 'arcade', skinOverrides: { arcade: { accent: '#22c55e' } } })).toMatchObject({ accent: '#22c55e', font: 'tektur' });
  });
});

describe('skin override writes', () => {
  it('writes a field into the skin entry and keeps the others', () => {
    const a = setSkinOverride({ lcd: { font: 'oswald' } }, 'arcade', 'accent', '#22c55e');
    expect(a).toEqual({ lcd: { font: 'oswald' }, arcade: { accent: '#22c55e' } });
    expect(setSkinOverride(a, 'arcade', 'font', 'lexend').arcade).toEqual({ accent: '#22c55e', font: 'lexend' });
  });
  it('removes the key when the value is the skin default, and the entry once empty', () => {
    const both = { arcade: { accent: '#22c55e', font: 'lexend' } };
    const noFont = setSkinOverride(both, 'arcade', 'font', 'tektur');
    expect(noFont).toEqual({ arcade: { accent: '#22c55e' } });
    expect(setSkinOverride(noFont, 'arcade', 'accent', skinDef('arcade')!.accent.toUpperCase())).toEqual({});
  });
  it('does not mutate its input', () => {
    const input = { arcade: { accent: '#22c55e' } };
    setSkinOverride(input, 'arcade', 'accent', '#000000');
    resetSkinOverride(input, 'arcade');
    expect(input).toEqual({ arcade: { accent: '#22c55e' } });
  });
  it('reset removes only the named skin', () => {
    expect(resetSkinOverride({ arcade: { accent: '#22c55e' }, lcd: { font: 'oswald' } }, 'arcade')).toEqual({ lcd: { font: 'oswald' } });
  });
});

describe('normalizeSkinOverrides', () => {
  it('drops unknown skins and empty entries', () => {
    expect(normalizeSkinOverrides({ arcade: { accent: '#22c55e' }, nope: { accent: '#fff' }, lcd: {} })).toEqual({ arcade: { accent: '#22c55e' } });
    expect(normalizeSkinOverrides(null)).toEqual({});
  });

  it('keeps only a #rrggbb accent and a font the panel can draw', () => {
    expect(normalizeSkinOverrides({ arcade: { accent: 'red', font: 'comic-nope' }, lcd: { accent: '#9BB36A', font: 'oswald' }, hud: { accent: 'rgb(1,2,3)' } }))
      .toEqual({ lcd: { accent: '#9BB36A', font: 'oswald' } });
  });
});

describe('skin background overrides', () => {
  it('keeps only a known mode, and the effect only with shader', () => {
    expect(normalizeSkinOverrides({
      neon: { backgroundMode: 'shader', backgroundEffect: 'aurora', backgroundOpacity: 0.3 } as never,
      lcd: { backgroundMode: 'solid', backgroundEffect: 'aurora' },
      hud: { backgroundMode: 'shader', backgroundEffect: 'not-an-effect' },
      crt: { backgroundMode: 'skin' },
      vfd: { backgroundMode: 'gradient' },
      arcade: { accent: '#22c55e', backgroundMode: 'media' },
    })).toEqual({
      neon: { backgroundMode: 'shader', backgroundEffect: 'aurora' },
      lcd: { backgroundMode: 'solid' },
      hud: { backgroundMode: 'shader' },
      arcade: { accent: '#22c55e', backgroundMode: 'media' },
    });
  });
  it('writes the mode and effect and leaves accent and font alone', () => {
    const map = { arcade: { accent: '#22c55e', backgroundMode: 'shader' as const, backgroundEffect: 'aurora' } };
    expect(setSkinBackground(map, 'arcade', 'solid', 'aurora')).toEqual({ arcade: { accent: '#22c55e', backgroundMode: 'solid' } });
    expect(setSkinBackground(map, 'arcade', 'skin', 'aurora')).toEqual({ arcade: { accent: '#22c55e' } });
    expect(setSkinBackground({}, 'lcd', 'skin', 'plasma')).toEqual({});
    expect(map.arcade.backgroundEffect).toBe('aurora');
  });
});
