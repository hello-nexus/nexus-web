import { useState, type ReactNode } from 'react';
import type { BrightnessScheduleBinding } from '../components/common/BrightnessScheduleButton/BrightnessScheduleButton';
import { BrightnessScheduleModal } from '../components/views/SettingsView/BrightnessScheduleModal';
import { useBrightnessSchedule, type BrightnessScheduleState } from './useBrightnessSchedule';
import { useScheduleBinding } from './useScheduleBinding';

/**
 * The sun popover binding for every lighting brightness slider (master
 * brightness, per-device LED brightness): lighting follows the schedule as one,
 * so they share the `lightingFollows` switch. Render `modal` next to the
 * slider. The binding is null until the schedule has loaded, or while the
 * service is offline.
 */
export function useLightingScheduleBinding(serviceOnline: boolean): {
  binding: BrightnessScheduleBinding | null;
  modal: ReactNode;
  state: BrightnessScheduleState;
} {
  const state = useBrightnessSchedule(serviceOnline);
  const [editing, setEditing] = useState(false);
  const binding = useScheduleBinding({
    state,
    follows: state.lightingFollows,
    onFollowsChange: next => { void state.saveLightingFollows(next); },
    onEdit: () => setEditing(true),
  });
  return {
    binding: serviceOnline && state.schedule !== null ? binding : null,
    modal: editing ? <BrightnessScheduleModal open onClose={() => setEditing(false)} state={state} /> : null,
    state,
  };
}
