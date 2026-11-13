import { describe, expect, it } from 'vitest';
import { normalizeSkinOverrides, resetSkinOverride, setSkinOverride } from './skinOverrides';
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
});
