import { createContext, useContext } from 'react';

// Lets a fullscreen widget offer its own close affordance. The overlay owns
// the exit animation, so a widget must not call the host's onExit directly -
// it would unmount without playing it. Undefined outside the overlay (grid
// tile, catalog preview), which is the signal to render no close control.
const ImmersiveExitContext = createContext<(() => void) | undefined>(undefined);

export const ImmersiveExitProvider = ImmersiveExitContext.Provider;

/** The animated close for the enclosing immersive overlay, or undefined outside one. */
export function useImmersiveExit(): (() => void) | undefined {
  return useContext(ImmersiveExitContext);
}
