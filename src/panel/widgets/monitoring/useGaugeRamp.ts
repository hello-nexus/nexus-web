import { useLayoutEffect, useState, type RefObject } from 'react';
import { cssColorToHex, type GaugeRamp } from './valueColor';

// Dark-theme values from variables.scss, used before the first read and on any
// surface where the custom properties resolve to nothing (jsdom, previews).
const FALLBACK: GaugeRamp = { accent: '#2563eb', warn: '#f59e0b', bad: '#ef4444', mode: 'dark' };

/** Reads the live ramp anchors off an element inside the widget subtree. */
export function readGaugeRamp(el: HTMLElement): GaugeRamp {
  const computed = getComputedStyle(el);
  const pick = (name: string, fallback: string) => cssColorToHex(computed.getPropertyValue(name)) ?? fallback;
  // PanelApp stamps data-theme on the panel root; the dashboard's is on <html>.
  const themed = el.closest('[data-theme]')?.getAttribute('data-theme')
    ?? document.documentElement.getAttribute('data-theme');
  return {
    accent: pick('--panel-accent', FALLBACK.accent),
    warn: pick('--warn', FALLBACK.warn),
    bad: pick('--bad', FALLBACK.bad),
    mode: themed === 'light' ? 'light' : 'dark',
  };
}

function sameRamp(a: GaugeRamp, b: GaugeRamp): boolean {
  return a.accent === b.accent && a.warn === b.warn && a.bad === b.bad && a.mode === b.mode;
}

/**
 * The ramp anchors for a monitoring widget, read from `ref` - the widget root,
 * never a graded slot, or the override would feed back into its own input.
 *
 * The accent and the light/dark status tokens reach this subtree only as custom
 * properties on an ancestor (applyAccentColor writes <html>'s inline style,
 * PanelApp writes the panel root's), so the re-read is driven by watching those
 * two elements rather than by React state that never changes here.
 */
export function useGaugeRamp(ref: RefObject<HTMLElement | null>, enabled: boolean): GaugeRamp {
  const [ramp, setRamp] = useState<GaugeRamp>(FALLBACK);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;
    const read = () => setRamp(prev => {
      const next = readGaugeRamp(el);
      return sameRamp(prev, next) ? prev : next;
    });
    read();
    const observer = new MutationObserver(read);
    const options: MutationObserverInit = { attributes: true, attributeFilter: ['style', 'data-theme'] };
    observer.observe(document.documentElement, options);
    const themed = el.closest('[data-theme]');
    if (themed && themed !== document.documentElement) observer.observe(themed, options);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return ramp;
}
