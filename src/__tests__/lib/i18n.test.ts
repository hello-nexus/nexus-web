import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { pluralSuffix } from '../../lib/pluralKey';
import type { Language } from '../../lib/settings';

const LOCALES_DIR = path.resolve(__dirname, '../../locales');
const LOCALE_FILES = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json')).sort();

function loadLocale(filename: string): Record<string, string> {
  const content = fs.readFileSync(path.join(LOCALES_DIR, filename), 'utf-8');
  return JSON.parse(content);
}

describe('locale files', () => {
  it('has exactly 16 locale files', () => {
    expect(LOCALE_FILES).toHaveLength(16);
  });

  it('all files parse as valid JSON', () => {
    for (const file of LOCALE_FILES) {
      expect(() => loadLocale(file), `${file} should be valid JSON`).not.toThrow();
    }
  });

  it('all files have identical key sets', () => {
    const enKeys = Object.keys(loadLocale('en.json')).sort();
    // Polish and Russian each add a CLDR "few" plural category English has no
    // use for - pluralKey.ts falls back to `.other` everywhere else, so a
    // `.few` sibling of an existing `.one`/`.other` pair is not drift.
    const isPluralCategoryExtension = (key: string) => key.endsWith('.few') && enKeys.includes(`${key.slice(0, -'.few'.length)}.other`);
    for (const file of LOCALE_FILES) {
      if (file === 'en.json') continue;
      const keys = Object.keys(loadLocale(file)).sort();
      const missing = enKeys.filter(k => !keys.includes(k));
      const extra = keys.filter(k => !enKeys.includes(k) && !isPluralCategoryExtension(k));
      expect(missing, `${file} missing keys: ${missing.join(', ')}`).toHaveLength(0);
      expect(extra, `${file} extra keys: ${extra.join(', ')}`).toHaveLength(0);
    }
  });

  it('no empty string values in English', () => {
    const en = loadLocale('en.json');
    const empty = Object.entries(en).filter(([, v]) => v === '');
    expect(empty.map(([k]) => k), 'empty English values').toHaveLength(0);
  });

  it('keys are sorted alphabetically in English', () => {
    const en = loadLocale('en.json');
    const keys = Object.keys(en);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  // pluralKey() resolves `<base>.<suffix>` at call time, so a base missing a
  // form its language can ask for renders the raw key instead of a label.
  // Scope: this checks the locale files against each other. A call site that
  // pluralises a base English ships flat is invisible here - no `.one`, so it
  // is not treated as a base at all.
  it('every pluralised base carries the forms its locales can ask for', () => {
    const en = loadLocale('en.json');
    // A bare `.other` is an enum value elsewhere (diagnostics.gpu.throttle).
    const bases = Object.keys(en)
      .filter(k => k.endsWith('.other'))
      .map(k => k.slice(0, -'.other'.length))
      .filter(base => en[`${base}.one`] !== undefined);
    expect(bases.length, 'expected pluralised keys in en.json').toBeGreaterThan(0);
    for (const file of LOCALE_FILES) {
      const locale = loadLocale(file);
      // Asked of pluralSuffix rather than listed here, so adding a CLDR-few
      // language to it cannot leave this guard blind to the new locale.
      const language = file.slice(0, -'.json'.length) as Language;
      const needsFew = pluralSuffix(language, 3) === 'few';
      for (const base of bases) {
        expect(locale[`${base}.one`], `${file} missing ${base}.one`).toBeTruthy();
        expect(locale[`${base}.other`], `${file} missing ${base}.other`).toBeTruthy();
        if (needsFew) expect(locale[`${base}.few`], `${file} missing ${base}.few`).toBeTruthy();
      }
    }
  });

  it('no non-English locale has English-identical values for long strings', () => {
    const en = loadLocale('en.json');
    for (const file of LOCALE_FILES) {
      if (file === 'en.json') continue;
      const locale = loadLocale(file);
      const untranslated = Object.entries(locale)
        .filter(([k, v]) => en[k] && en[k].length > 15 && v === en[k])
        .map(([k]) => k);
      // Allow some overlap (brand names, technical terms), but flag if > 20% untranslated
      const ratio = untranslated.length / Object.keys(en).length;
      expect(ratio, `${file} has ${(ratio * 100).toFixed(0)}% untranslated long strings`)
        .toBeLessThan(0.2);
    }
  });
});
