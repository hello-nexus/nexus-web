// The surface of the physical glass when its Widget size lays it out as another
// surface (a Small Q-series renders a monitor grid on the Q-series SoC). Render
// cost and streaming checks key on the glass; layout keys on the passed surface.
import { createContext, useContext } from 'react';
import type { PanelSurface } from '../../types';

const PanelGlassSurfaceContext = createContext<PanelSurface | undefined>(undefined);

export function usePanelGlassSurface(layoutSurface: PanelSurface): PanelSurface;
export function usePanelGlassSurface(layoutSurface: PanelSurface | undefined): PanelSurface | undefined;
export function usePanelGlassSurface(layoutSurface: PanelSurface | undefined): PanelSurface | undefined {
  return useContext(PanelGlassSurfaceContext) ?? layoutSurface;
}

export const PanelGlassSurfaceProvider = PanelGlassSurfaceContext.Provider;
