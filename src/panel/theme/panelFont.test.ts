import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_FONT, PANEL_FONTS, normalizePanelFont, panelFontStack, panelFontVars, type PanelFontId } from './panelFont';

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
});
