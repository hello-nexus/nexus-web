import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_FONT, PANEL_FONTS, normalizePanelFont, panelFontStack, panelFontVars, panelSystemFontsAvailable, type PanelFontId } from './panelFont';

describe('panel font fallback', () => {
  it('draws a stored id the build no longer offers in the app font', () => {
    expect(normalizePanelFont('spectral')).toBeNull();
    expect(normalizePanelFont('')).toBeNull();
    expect(panelFontVars(normalizePanelFont('spectral'))).toEqual({});
  });

  it('keeps Lexend right behind every offered font so a font file that fails to load still renders', () => {
    for (const font of PANEL_FONTS) {
      const stack = panelFontStack(font.id);
      if (font.id === DEFAULT_PANEL_FONT) expect(stack).toBeUndefined();
      else expect(stack).toContain(`'${font.family}', 'Lexend'`);
    }
  });

  it('resolves an unknown id that skipped normalization to Lexend', () => {
    expect(panelFontStack('spectral' as PanelFontId)).toContain("'Lexend', 'Lexend'");
  });

  it('keeps a system family and puts Lexend right behind it', () => {
    expect(normalizePanelFont('system:  Helvetica Neue ')).toBe('system:Helvetica Neue');
    expect(normalizePanelFont('system:')).toBeNull();
    expect(normalizePanelFont('system:   ')).toBeNull();
    expect(normalizePanelFont(`system:${'a'.repeat(129)}`)).toBeNull();
    expect(panelFontStack('system:Helvetica Neue')).toContain("'Helvetica Neue', 'Lexend'");
  });

  it('escapes quotes, backslashes and control characters in a family name', () => {
    const stack = panelFontStack("system:Evil'; } body{x:\\y\n")!;
    expect(stack).toContain("'Evil\\'; } body{x:\\\\y', 'Lexend'");
    expect(stack).not.toContain('\n');
  });

  it('offers system fonts to every glass except phone and Q-series', () => {
    for (const s of ['desktop', 'monitor', 'y70', 'lcd-round']) expect(panelSystemFontsAvailable(s)).toBe(true);
    for (const s of ['phone', 'q60', null, undefined]) expect(panelSystemFontsAvailable(s)).toBe(false);
  });
});
