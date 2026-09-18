// The panel's gauge gradient (one list per panel, see gaugeGradient.ts) for the
// monitoring widgets and their settings sheet. Provided by the two hosts that
// own a panel theme, PanelApp and PanelDevicePage; without a provider the
// default gradient reads and edits are dropped, so previews and tests render
// coloured gauges but cannot persist anything.
import { createContext, useContext } from 'react';
import { DEFAULT_ACCENT } from '../../../lib/settings';
import { DEFAULT_GAUGE_GRADIENT, type GaugeGradientStop } from '../../theme/gaugeGradient';

export interface PanelGaugeGradientValue {
  /** What the gauges paint: the stored list with accent-docked stops resolved to hex. */
  stops: readonly GaugeGradientStop[];
  /** The stored list, accent-docked stops intact, for the editor. */
  source: readonly GaugeGradientStop[];
  /** The panel's accent hex the docked stops follow. */
  accent: string;
  /** The panel's resolved theme; the accent tint derives its glow tiers per mode. */
  mode: 'dark' | 'light';
  /** Live update while dragging a stop; nothing is written. */
  preview: (stops: readonly GaugeGradientStop[]) => void;
  /** Persist to this panel's record. */
  commit: (stops: readonly GaugeGradientStop[]) => void;
}

const NOOP = () => {};

const PanelGaugeGradientContext = createContext<PanelGaugeGradientValue>({
  stops: DEFAULT_GAUGE_GRADIENT,
  source: DEFAULT_GAUGE_GRADIENT,
  accent: DEFAULT_ACCENT,
  mode: 'dark',
  preview: NOOP,
  commit: NOOP,
});

export function usePanelGaugeGradient(): PanelGaugeGradientValue {
  return useContext(PanelGaugeGradientContext);
}

export const PanelGaugeGradientProvider = PanelGaugeGradientContext.Provider;
