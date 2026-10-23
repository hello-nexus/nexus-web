import { usePanelGlassSurface } from '../widgets/common/PanelGlassSurfaceContext';
import type { PanelSurface } from '../types';
import { isQSeriesViewport } from '../device/inferSurface';

// Displays this PC renders and drives itself. Q-series is left out for latency;
// every surface not listed here counts as remote.
const AUDIO_REACTIVE_SURFACES: ReadonlySet<PanelSurface> = new Set<PanelSurface>([
  'lcd-round', 'lcd-square', 'lcd-wide', 'monitor', 'y70',
]);

// 'y70' is inferred from viewport aspect, so surface alone cannot prove the
// client is on this PC; the page must also have loaded from a loopback host.
// Loopback does not separate local from tunnelled: Q-series panels load
// localhost through adb reverse, so they are denied by identity below.
// Unlike api/service isRemotePaired, an empty hostname does not count as local.
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
  const glass = usePanelGlassSurface(surface);
  const qSeries = surface === 'q60'
    || (typeof window !== 'undefined' && isQSeriesViewport(window.innerWidth, window.innerHeight));
  return !qSeries && panelAudioReactiveAllowed(glass, isLocalPanelClient());
}
