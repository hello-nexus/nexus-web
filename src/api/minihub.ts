// HYTE MiniHub (IBP Mini Hub rebrand) endpoints. The hub only has two
// cooling modes — Software (Nexus drives) and Motherboard (PWM passthrough);
// there's no firmware-side standalone setpoint and no read-back for the
// current mode, so callers cache what they last set.

import { putService } from './service';

export const MINIHUB_LIVE_MODE_SOFTWARE = 0;
export const MINIHUB_LIVE_MODE_MOTHERBOARD = 1;

export type MiniHubLiveMode =
  | typeof MINIHUB_LIVE_MODE_SOFTWARE
  | typeof MINIHUB_LIVE_MODE_MOTHERBOARD;

// Display kind shared with NP50's HubModeKind — MiniHub has no 'firmware'
// because the hardware doesn't support a stored fan setpoint.
export type MiniHubModeKind = 'software' | 'motherboard';

export function setMiniHubLiveCoolingMode(mode: MiniHubLiveMode): Promise<unknown | null> {
  return putService('/devices/minihub/cooling-mode', { mode });
}
