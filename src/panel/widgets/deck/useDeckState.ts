import { useMemo } from 'react';
import { useSystemVolume } from '../../../hooks/useSystemVolume';
import type { DeckConfig, DeckSlot, DeckToggleState } from './types';

/** Which live-state sources any toggle slot in the deck references. */
function collectToggleStates(deck: DeckConfig): { needsVolume: boolean } {
  let needsVolume = false;
  const walk = (slots: readonly DeckSlot[]) => {
    for (const s of slots) {
      if (s.action?.type === 'toggle' && s.action.state?.kind === 'mute') needsVolume = true;
      if (s.folder) walk(s.folder.slots);
    }
  };
  for (const p of deck.pages) walk(p.slots);
  return { needsVolume };
}

export interface DeckLiveState {
  /** True/false for a state-backed toggle, or undefined when the caller should use an internal flip. */
  isOn(state: DeckToggleState | undefined): boolean | undefined;
}

/**
 * Resolves live on/off state for two-state toggle buttons. Mute is event-driven
 * via the `volume` multiplex topic (no polling cost when no mute toggle exists).
 * lightingPower / internal sources fall back to the widget's local flip.
 * Hooks are called unconditionally (enabled-gated) to keep hook order stable.
 */
export function useDeckLiveState(deck: DeckConfig, enabled: boolean): DeckLiveState {
  const { needsVolume } = useMemo(() => collectToggleStates(deck), [deck]);
  const vol = useSystemVolume(enabled && needsVolume);
  const muted = vol.state.muted;
  return useMemo<DeckLiveState>(() => ({
    isOn(state) {
      if (state?.kind === 'mute') return muted;
      return undefined;
    },
  }), [muted]);
}
