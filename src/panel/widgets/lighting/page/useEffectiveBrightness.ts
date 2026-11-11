import { useBrightnessSchedule } from '../../../../hooks/useBrightnessSchedule';
import { useMasterScalesDevices } from '../../../../hooks/useMasterScalesDevices';
import { brightnessCauses, effectiveBrightness, type BrightnessCause } from './effectiveBrightness';
import { useGlobalBrightness } from './useGlobalBrightness';

/**
 * What scales one lighting device's output right now: the resulting percent and
 * the controls below full, or null until the master level has loaded. The
 * schedule level comes from the schedule hook, which re-evaluates it each
 * minute in step with the service.
 */
export function useEffectiveBrightness(deviceBrightness: number | undefined): { level: number; causes: BrightnessCause[] } | null {
  const master = useGlobalBrightness();
  const scales = useMasterScalesDevices(true);
  const { schedule, current, lightingFollows } = useBrightnessSchedule(true);
  if (master === null) return null;
  const inputs = {
    master,
    schedule: schedule?.enabled && lightingFollows ? current : null,
    device: deviceBrightness ?? 100,
    scales: scales.on === true,
  };
  return { level: effectiveBrightness(inputs), causes: brightnessCauses(inputs) };
}
