import { describe, it, expect } from 'vitest';
import { matchBrowserLanguage } from './browserLanguage';

describe('matchBrowserLanguage', () => {
  it('matches exact tags case-insensitively', () => {
    expect(matchBrowserLanguage(['pt-BR'])).toBe('pt-BR');
    expect(matchBrowserLanguage(['pt-br'])).toBe('pt-BR');
    expect(matchBrowserLanguage(['zh-CN'])).toBe('zh-CN');
    expect(matchBrowserLanguage(['fur'])).toBe('fur');
    expect(matchBrowserLanguage(['nl'])).toBe('nl');
  });

  it('falls back from regional tags to the base language', () => {
    expect(matchBrowserLanguage(['fr-CA'])).toBe('fr');
    expect(matchBrowserLanguage(['de-AT'])).toBe('de');
    expect(matchBrowserLanguage(['pt-PT'])).toBe('pt');
    expect(matchBrowserLanguage(['es-419'])).toBe('es');
    expect(matchBrowserLanguage(['nl-NL'])).toBe('nl');
    expect(matchBrowserLanguage(['nl-BE'])).toBe('nl');
  });

  it('maps Traditional Chinese script and region tags to zh-TW', () => {
    expect(matchBrowserLanguage(['zh-Hant'])).toBe('zh-TW');
    expect(matchBrowserLanguage(['zh-Hant-HK'])).toBe('zh-TW');
    expect(matchBrowserLanguage(['zh-HK'])).toBe('zh-TW');
  });

  it('maps bare zh to Simplified', () => {
    expect(matchBrowserLanguage(['zh'])).toBe('zh-CN');
  });

  it('walks the preference list until something matches', () => {
    expect(matchBrowserLanguage(['da', 'sv', 'ko-KR', 'en'])).toBe('ko');
    expect(matchBrowserLanguage(['da', 'sv'])).toBeNull();
  });

  it('returns null for an empty or blank list', () => {
    expect(matchBrowserLanguage([])).toBeNull();
    expect(matchBrowserLanguage([''])).toBeNull();
  });
});
