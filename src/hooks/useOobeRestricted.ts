import { useState } from 'react';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * True while Windows is in first-boot setup (OOBE), as pushed on the
 * `system/session` topic. Stays false until a frame arrives, so a service
 * without the topic never restricts a panel. `enabled` gates the subscription
 * to the surfaces that act on it.
 */
export function useOobeRestricted(enabled: boolean): boolean {
  const [oobe, setOobe] = useState(false);
  useTopicCallback('system/session', enabled, data => {
    setOobe((data as { oobe?: unknown } | null)?.oobe === true);
  });
  return enabled && oobe;
}
