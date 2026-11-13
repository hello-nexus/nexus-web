import '../src/lib/polyfills';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/variables.scss';
import '../src/styles/global.scss';
import '../src/panel/styles/tokens.scss';
import '../src/panel/skins/skins.scss';
import './harness.scss';
import { I18nProvider } from '../src/lib/i18n';
import { SkinFilters } from '../src/panel/skins/SkinFilters';
import { PANEL_SKINS, normalizePanelSkin, type PanelSkinId, type SkinFilterMode } from '../src/panel/skins/skins';

export interface HarnessState {
  skin: PanelSkinId | null;
  theme: 'dark' | 'light';
  scene: string;
  overlay: boolean;
  filter: SkinFilterMode;
  zoom: number;
}

export function readState(): HarnessState {
  const q = new URLSearchParams(location.search);
  const f = q.get('filter');
  return {
    skin: normalizePanelSkin(q.get('skin')),
    theme: q.get('theme') === 'light' ? 'light' : 'dark',
    scene: q.get('scene') ?? 'main',
    overlay: q.get('overlay') !== '0',
    filter: f === 'off' || f === 'bloom' ? f : 'on',
    zoom: Number(q.get('zoom')) || 1,
  };
}

export function writeState(s: HarnessState) {
  const q = new URLSearchParams({
    skin: s.skin ?? '', theme: s.theme, scene: s.scene,
    overlay: s.overlay ? '1' : '0', filter: s.filter, zoom: String(s.zoom),
  });
  history.replaceState(null, '', `?${q.toString()}`);
}

export function mount(node: ReactNode) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider initialLanguage="en">
        <SkinFilters />
        {node}
      </I18nProvider>
    </StrictMode>,
  );
}

export { PANEL_SKINS };
