// The panel's gauge gradient (one list per panel, see gaugeGradient.ts) for the
// monitoring widgets and their settings sheet. Provided by the two hosts that
// own a panel theme, PanelApp and PanelDevicePage; without a provider the
// default gradient reads and edits are dropped, so previews and tests render
// coloured gauges but cannot persist anything.
import { createContext, useContext } from 'react';
import { DEFAULT_GAUGE_GRADIENT, type GaugeGradientStop } from '../../theme/gaugeGradient';

export interface PanelGaugeGradientValue {
  stops: readonly GaugeGradientStop[];
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
  mode: 'dark',
  preview: NOOP,
  commit: NOOP,
});

export function usePanelGaugeGradient(): PanelGaugeGradientValue {
  return useContext(PanelGaugeGradientContext);
}

export const PanelGaugeGradientProvider = PanelGaugeGradientContext.Provider;
