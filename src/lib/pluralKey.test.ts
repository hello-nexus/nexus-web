import { describe, expect, it } from 'vitest';
import { pluralKey, pluralSuffix } from './pluralKey';

describe('pluralSuffix', () => {
  it('resolves the correct 3-form CLDR category for Polish across the one/few/many boundaries', () => {
    expect(pluralSuffix('pl', 1)).toBe('one');
    expect(pluralSuffix('pl', 3)).toBe('few');
    expect(pluralSuffix('pl', 5)).toBe('other');
    expect(pluralSuffix('pl', 21)).toBe('other');
    expect(pluralSuffix('pl', 22)).toBe('few');
    expect(pluralSuffix('pl', 25)).toBe('other');
  });

  it('resolves the correct 3-form CLDR category for Russian, which differs from Polish at 21', () => {
    expect(pluralSuffix('ru', 1)).toBe('one');
    expect(pluralSuffix('ru', 3)).toBe('few');
    expect(pluralSuffix('ru', 5)).toBe('other');
    // 21/31/41... take the singular-like "one" form in Russian (i%10=1,
    // i%100!=11) - unlike Polish, where 21 falls in the "many"/other bucket.
    expect(pluralSuffix('ru', 21)).toBe('one');
    expect(pluralSuffix('ru', 22)).toBe('few');
    expect(pluralSuffix('ru', 25)).toBe('other');
  });

  it('treats the Slavic 11-14 teens as the "many"/other bucket in both languages, not "few"', () => {
    expect(pluralSuffix('pl', 12)).toBe('other');
    expect(pluralSuffix('pl', 14)).toBe('other');
    expect(pluralSuffix('ru', 11)).toBe('other');
    expect(pluralSuffix('ru', 14)).toBe('other');
  });

  it('treats 0 as "other" (many) in both Slavic locales', () => {
    expect(pluralSuffix('pl', 0)).toBe('other');
    expect(pluralSuffix('ru', 0)).toBe('other');
  });

  it('collapses to the plain singular/plural split for every other shipped locale', () => {
    for (const language of ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pt-BR', 'tr', 'ja', 'ko', 'zh-CN', 'zh-TW', 'fur'] as const) {
      expect(pluralSuffix(language, 1)).toBe('one');
      expect(pluralSuffix(language, 0)).toBe('other');
      expect(pluralSuffix(language, 2)).toBe('other');
      expect(pluralSuffix(language, 21)).toBe('other');
    }
  });
});

describe('pluralKey', () => {
  it('appends the resolved suffix to the base key', () => {
    expect(pluralKey('panel.editor.slotCount', 'pl', 3)).toBe('panel.editor.slotCount.few');
    expect(pluralKey('panel.editor.slotCount', 'ru', 21)).toBe('panel.editor.slotCount.one');
    expect(pluralKey('panel.editor.slotCount', 'en', 3)).toBe('panel.editor.slotCount.other');
  });
});
