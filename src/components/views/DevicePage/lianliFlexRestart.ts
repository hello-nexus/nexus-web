// Pending state of a Restart LCD request, free of React so it is unit-testable.

import type { LianLiWirelessFan } from '../../../api/lianli-wireless';

/** Per unit MAC: whether the service has been seen restarting the screen since the request. */
export type RestartPending = Record<string, boolean>;

/**
 * A request is pending from the click until the service has reported the
 * restart and then reported it finished. A unit that vanishes ends it too.
 * Returns the same object when nothing changed.
 */
export function reconcileRestarts(pending: RestartPending, fans: readonly LianLiWirelessFan[]): RestartPending {
  let next = pending;
  for (const mac of Object.keys(pending)) {
    const fan = fans.find(f => f.mac === mac);
    if (!fan) {
      if (next === pending) next = { ...pending };
      delete next[mac];
    } else if (fan.lcdRestarting === true && !pending[mac]) {
      if (next === pending) next = { ...pending };
      next[mac] = true;
    } else if (fan.lcdRestarting !== true && pending[mac]) {
      if (next === pending) next = { ...pending };
      delete next[mac];
    }
  }
  return next;
}
