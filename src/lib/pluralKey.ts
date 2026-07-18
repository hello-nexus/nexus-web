import type { Language } from './settings';

export type PluralSuffix = 'one' | 'few' | 'other';

/**
 * CLDR cardinal-plural category for `count` in `language`, collapsed onto
 * the three suffixes our locale files use (`.one` / `.few` / `.other`).
 * Polish and Russian each have their own three-form rule (one/few/many) -
 * CLDR's "many" bucket is stored under the existing `.other` key (already
 * the correct genitive-plural text for both), so `.few` is the only new
 * form. Every other shipped locale has no CLDR "few" category for cardinal
 * numbers, so this collapses to the plain singular/plural split they've
 * always used.
 */
export function pluralSuffix(language: Language, count: number): PluralSuffix {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const isFew = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);

  if (language === 'pl') {
    if (n === 1) return 'one';
    return isFew ? 'few' : 'other';
  }
  if (language === 'ru') {
    if (mod10 === 1 && mod100 !== 11) return 'one';
    return isFew ? 'few' : 'other';
  }
  return n === 1 ? 'one' : 'other';
}

/** `${base}.${suffix}` for the plural category `count` resolves to in
 *  `language` - the key a caller passes straight to t(). */
export function pluralKey(base: string, language: Language, count: number): string {
  return `${base}.${pluralSuffix(language, count)}`;
}
