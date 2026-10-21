import { useRef } from 'react';
import { useSensors } from './useSensors';
import { useSensorExtras } from './useSensorExtras';
import { buildNicNetworkSensors } from '../panel/widgets/monitoring/networkSensors';
import { resolveMonitoringSensor } from '../panel/widgets/deck/deckMonitoring';
import type { DeckMonitoringCategory } from '../panel/widgets/deck/types';
import { normalizeSensor, type SensorSignal } from '../lib/sensorBinding';

/**
 * A stable ref to a function mapping a sensor binding to its live 0..1 value
 * (null while the sensor does not resolve). The ref's function is replaced on
 * every sensor frame, so a render loop reads `ref.current` each frame. Nothing
 * subscribes while `enabled` is false.
 */
export function useSensorSignal(enabled: boolean): React.RefObject<SensorSignal> {
  const sensors = useSensors(enabled);
  const extras = useSensorExtras(enabled);
  const ref = useRef<SensorSignal>(() => null);
  const networkSensors = buildNicNetworkSensors(extras.nics);
  ref.current = binding => {
    const sensor = resolveMonitoringSensor(sensors, binding.category as DeckMonitoringCategory, binding.sensor, [], networkSensors, extras);
    return sensor && Number.isFinite(sensor.value) ? normalizeSensor(sensor.value, binding.min, binding.max) : null;
  };
  return ref;
}
