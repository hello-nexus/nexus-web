import { useState, type ReactNode } from 'react';
import type { BrightnessScheduleBinding } from '../components/common/BrightnessScheduleButton/BrightnessScheduleButton';
import { BrightnessScheduleModal } from '../components/views/SettingsView/BrightnessScheduleModal';
import { useBrightnessSchedule } from './useBrightnessSchedule';
import { useScheduleBinding } from './useScheduleBinding';
import { useScheduleFollowDevices } from './useScheduleFollowDevices';

/**
 * The sun popover binding for one device's brightness slider, plus the real
 * schedule editor it opens (render `modal` next to the slider). `key` is the
 * service's id for the device ("y70", "corsair-lcd", or a display id); a null
 * key, or an offline service, gives no binding, so the slider shows no sun.
 */
export function useDeviceScheduleBinding(
  key: string | null,
  serviceOnline: boolean,
): { binding: BrightnessScheduleBinding | null; modal: ReactNode } {
  const active = serviceOnline && key !== null;
  const state = useBrightnessSchedule(active);
  const { devices, setFollows, refresh } = useScheduleFollowDevices(active);
  const [editing, setEditing] = useState(false);
  const entry = key !== null ? devices[key] : undefined;
  const binding = useScheduleBinding({
    state,
    // A device the service does not list does not follow: following is opt-in.
    follows: entry?.follows ?? false,
    onFollowsChange: next => { if (key !== null) void setFollows(key, next); },
    onEdit: () => setEditing(true),
    onOpen: refresh,
    capsSlider: true,
  });
  return {
    binding: active && state.schedule !== null ? binding : null,
    modal: editing ? <BrightnessScheduleModal open onClose={() => setEditing(false)} state={state} /> : null,
  };
}
