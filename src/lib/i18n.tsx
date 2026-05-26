// Lightweight i18n - no dependencies.
// Uses React context to provide a t() function that looks up keys from JSON translation files.
// Supports interpolation: t('key', { name: 'World' }) -> "Hello, {name}" -> "Hello, World"
//
// useTranslation is co-located with the provider because the hook binds to
// the context defined in this file; splitting the export would just create
// a one-liner re-export module imported from every i18n consumer.
 

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { Language } from './settings';
import { loadSettings } from './settings';

type Translations = Record<string, string>;

interface I18nContextValue {
  language: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLanguage: (lang: Language) => void;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: (key) => key,
  setLanguage: () => {},
});

// All locale files - Vite's import.meta.glob loads them lazily.
const localeModules = import.meta.glob<{ default: Translations }>('../locales/*.json');

function resolveModulePath(lang: Language): string {
  return `../locales/${lang}.json`;
}

/**
 * I18nProvider owns the language state. Consumers change it through
 * useTranslation().setLanguage(). Previously this was prop-drilled through
 * App -> Dashboard -> UiSettingsProvider via an onLanguageChange callback,
 * which produced a race where the provider's language prop lagged one render
 * behind the actual UI state on switch. Keeping the state local here means
 * the provider always re-renders first with the new language, and the async
 * locale-file load fires immediately.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => loadSettings().general.language);
  const [translations, setTranslations] = useState<Translations>({});

  useEffect(() => {
    const path = resolveModulePath(language);
    const loader = localeModules[path];
    if (loader) {
      loader().then(mod => setTranslations(mod.default));
    }
  }, [language]);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let text = translations[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  }, [translations]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ language, t, setLanguage }),
    [language, t, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}
