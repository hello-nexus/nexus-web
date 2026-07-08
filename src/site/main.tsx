// Marketing-site entry (site/index.html) - a separate bundle from the SPA.
// Present only in the standalone build; build:service never emits it.
import '../lib/polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/variables.scss';
import '../styles/global.scss';
import '../panel/styles/tokens.scss';
import { I18nProvider } from '../lib/i18n';
import { primeShaderSource } from '../api/lighting';
import { matchBrowserLanguage } from '../lib/browserLanguage';
import { loadStoredLanguage } from '../lib/settings';
import { SiteApp } from './SiteApp';
import preludeFrag from './shaders/_prelude.frag?raw';
import plasmaFrag from './shaders/plasma.frag?raw';
import fireFrag from './shaders/fire.frag?raw';
import spiralFrag from './shaders/spiral.frag?raw';
import neongridFrag from './shaders/neongrid.frag?raw';
import terraceFrag from './shaders/terrace.frag?raw';

// Same composition the service performs in ShaderLibrary.Get (prelude + body);
// priming the cache means useShaderRenderer never fetches from a service.
const SHADER_BODIES: Record<string, string> = {
  plasma: plasmaFrag,
  fire: fireFrag,
  spiral: spiralFrag,
  neongrid: neongridFrag,
  terrace: terraceFrag,
};
for (const [name, body] of Object.entries(SHADER_BODIES)) {
  primeShaderSource(name, `${preludeFrag}\n${body}`);
}

// A language explicitly chosen in the footer wins; otherwise match the
// browser's preference list against the shipped locales.
const initialLanguage = loadStoredLanguage()
  ?? matchBrowserLanguage(navigator.languages ?? [navigator.language])
  ?? 'en';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider initialLanguage={initialLanguage}>
      <SiteApp />
    </I18nProvider>
  </StrictMode>,
);
