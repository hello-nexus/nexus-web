import { useEffect } from 'react';
import type { UpdateChannel } from '../api/update';

// Settings, the search palette and the device page all ask the dashboard to
// open the channel switch modal; none of them change the channel themselves.
type Handler = (channel: UpdateChannel) => void;

const handlers = new Set<Handler>();

export function requestChannelSwitch(channel: UpdateChannel): void {
  handlers.forEach(h => h(channel));
}

/** Subscribe the owner of the modal. Pass a stable (useCallback) handler. */
export function useChannelSwitchRequests(handler: Handler): void {
  useEffect(() => {
    handlers.add(handler);
    return () => { handlers.delete(handler); };
  }, [handler]);
}
