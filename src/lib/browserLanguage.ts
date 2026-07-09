import { LANGUAGES, type Language } from './settings';

// Regional-tag fallbacks for base tags we ship regionalized. Plain 'zh'
// browsers overwhelmingly mean Simplified; 'zh-Hant*' means Traditional.
const BASE_TAG_DEFAULTS: Record<string, Language> = {
  zh: 'zh-CN',
};

/**
 * Matches the browser's language preference list against the shipped locale
 * set. Exact tag first (pt-BR, zh-CN), then Traditional-Chinese script tags,
 * then the base tag (fr-CA -> fr). Returns null when nothing matches so the
 * caller keeps its default.
 */
export function matchBrowserLanguage(langs: readonly string[]): Language | null {
  for (const raw of langs) {
    const tag = raw.trim();
    if (!tag) continue;
    const lower = tag.toLowerCase();

    const exact = LANGUAGES.find(l => l.toLowerCase() === lower);
    if (exact) return exact;

    // zh-Hant / zh-Hant-TW / zh-HK / zh-MO carry Traditional script but do not
    // string-match 'zh-TW'.
    if (lower === 'zh-hant' || lower.startsWith('zh-hant-')
      || lower === 'zh-hk' || lower === 'zh-mo') {
      return 'zh-TW';
    }

    const base = lower.split('-')[0];
    if (base in BASE_TAG_DEFAULTS) return BASE_TAG_DEFAULTS[base];
    const baseMatch = LANGUAGES.find(l => l.toLowerCase() === base);
    if (baseMatch) return baseMatch;
  }
  return null;
}
