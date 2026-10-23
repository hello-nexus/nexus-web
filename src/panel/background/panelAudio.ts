import { usePanelGlassSurface } from '../widgets/common/PanelGlassSurfaceContext';
import type { PanelSurface } from '../types';

// Displays this PC renders and drives itself. Q-series is left out for latency,
// 'desktop' until decided; every surface not listed here counts as remote.
const AUDIO_REACTIVE_SURFACES: ReadonlySet<PanelSurface> = new Set<PanelSurface>([
  'kraken', 'lcd-round', 'lcd-square', 'lcd-wide', 'monitor', 'y70',
]);

// 'y70' is inferred from viewport aspect, so surface alone cannot prove the
// client is on this PC; the page must also have loaded from the local service.
// Same host set api/service uses for isRemotePaired, read here so this gate
// does not depend on that module's load-time state.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function isLocalPanelClient(): boolean {
  return typeof window !== 'undefined' && isLoopbackHost(window.location.hostname);
}

export function panelAudioReactiveAllowed(
  surface: PanelSurface | null | undefined,
  localClient: boolean,
): boolean {
  return localClient && surface != null && AUDIO_REACTIVE_SURFACES.has(surface);
}

/** Audio-reactive backgrounds for the glass this panel renders on. */
export function usePanelAudioReactive(surface: PanelSurface | undefined): boolean {
  return panelAudioReactiveAllowed(usePanelGlassSurface(surface), isLocalPanelClient());
}
