import { useState } from 'react';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * True while Restricted mode is on, as pushed on the `system/session` topic
 * (active while Windows is in first-boot setup). Stays false until a frame
 * arrives, so a service without the topic never restricts a panel. `enabled`
 * gates the subscription to the surfaces that act on it. `recordFlag` is the
 * panel's own manual toggle; either source restricts.
 */
export function useRestrictedMode(enabled: boolean, recordFlag = false): boolean {
  const [restricted, setRestricted] = useState(false);
  useTopicCallback('system/session', enabled, data => {
    setRestricted((data as { restricted?: unknown } | null)?.restricted === true);
  });
  return enabled && (restricted || recordFlag);
}
