import '../src/lib/polyfills';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/variables.scss';
import '../src/styles/global.scss';
import '../src/panel/styles/tokens.scss';
import './harness.scss';
import { I18nProvider } from '../src/lib/i18n';

export function mount(node: ReactNode) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider initialLanguage={new URLSearchParams(location.search).get('lang') ?? 'en'}>
        {node}
      </I18nProvider>
    </StrictMode>,
  );
}

export function readView() {
  const q = new URLSearchParams(location.search);
  return { scene: q.get('scene') ?? 'main', overlay: q.get('overlay') !== '0', zoom: Number(q.get('zoom')) || 1 };
}
