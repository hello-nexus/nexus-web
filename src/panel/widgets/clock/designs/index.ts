import type { ComponentType } from 'react';
import type { ClockDesignProps } from './types';

import DigitalClock from './DigitalClock';
import AnalogClock from './AnalogClock';
import SplitFlapClock from './SplitFlapClock';
import RollingClock from './RollingClock';
import LedClock from './LedClock';
import DotsClock from './DotsClock';
import MatrixClock from './MatrixClock';

export type { ClockDesignProps } from './types';

export const CLOCK_DESIGNS: Record<string, {
  component: ComponentType<ClockDesignProps>;
  label: string;
}> = {
  digital:    { component: DigitalClock,    label: 'Digital' },
  analog:     { component: AnalogClock,     label: 'Analog' },
  splitflap:  { component: SplitFlapClock,  label: 'Split Flap' },
  rolling:    { component: RollingClock,    label: 'Rolling' },
  led:        { component: LedClock,        label: 'LED' },
  dots:       { component: DotsClock,       label: 'Dots' },
  matrix:     { component: MatrixClock,     label: 'Matrix' },
};
