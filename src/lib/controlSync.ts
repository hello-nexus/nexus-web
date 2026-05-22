import type { EffectState, LightingMode } from '../types/lighting';
import type { CoolingPresetKey } from '../panel/widgets/cooling/page/coolingPresets';

const CHANNEL_NAME = 'qos-control-sync';
const WINDOW_EVENT = 'qos-control-sync';

export type ControlSyncEvent =
  | {
      domain: 'lighting';
      mode?: LightingMode;
      rawSync?: string;
      effect?: string;
      staticColor?: string;
      templateIndex?: number;
      effectState?: EffectState;
      revision?: number;
    }
  | {
      domain: 'cooling';
      /** Active preset key after the change. Replaces the legacy `activeProfile` field. */
      activePreset?: CoolingPresetKey;
      /** @deprecated Older surfaces still publish this; new code reads `activePreset`. Kept transitional so an old widget on the panel doesn't lose sync mid-deploy. */
      activeProfile?: string;
      revision?: number;
    };

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (channel === undefined) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function publishControlSync(event: ControlSyncEvent) {
  if (typeof window === 'undefined') return;
  const payload = { ...event, revision: Date.now() } as ControlSyncEvent;
  window.dispatchEvent(new CustomEvent<ControlSyncEvent>(WINDOW_EVENT, { detail: payload }));
  getChannel()?.postMessage(payload);
}

export function subscribeControlSync(handler: (event: ControlSyncEvent) => void) {
  if (typeof window === 'undefined') return () => {};

  const onWindowEvent = (event: Event) => {
    handler((event as CustomEvent<ControlSyncEvent>).detail);
  };
  const onChannelMessage = (event: MessageEvent<ControlSyncEvent>) => {
    handler(event.data);
  };

  window.addEventListener(WINDOW_EVENT, onWindowEvent);
  const bc = getChannel();
  bc?.addEventListener('message', onChannelMessage);

  return () => {
    window.removeEventListener(WINDOW_EVENT, onWindowEvent);
    bc?.removeEventListener('message', onChannelMessage);
  };
}
