import { createContext } from 'react';
import type { SensorSignal } from '../lib/sensorBinding';

/** Live sensor readings for every shader renderer below a provider; without one a sensor-fed shader reads 0. */
export const SensorSignalContext = createContext<React.RefObject<SensorSignal | null> | null>(null);
