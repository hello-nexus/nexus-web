import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

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
