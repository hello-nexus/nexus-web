import type { ComponentType } from 'react';
import type { ClockDesignProps } from './types';

import DigitalClock from './DigitalClock';
import AnalogClock from './AnalogClock';
import SplitFlapClock from './SplitFlapClock';
import RollingClock from './RollingClock';
import LedClock from './LedClock';
import DotsClock from './DotsClock';
import MatrixClock from './MatrixClock';
import AbstractClock from './AbstractClock';

export type { ClockDesignProps, ClockLayout } from './types';

// stackable: the design reads the time as digit groups, so it can put each
// unit on its own line. The analog face has no such groups.
export const CLOCK_DESIGNS: Record<string, {
  component: ComponentType<ClockDesignProps>;
  label: string;
  stackable: boolean;
}> = {
  digital:    { component: DigitalClock,    label: 'Digital',    stackable: true },
  analog:     { component: AnalogClock,     label: 'Analog',     stackable: false },
  splitflap:  { component: SplitFlapClock,  label: 'Split Flap', stackable: true },
  rolling:    { component: RollingClock,    label: 'Rolling',    stackable: true },
  led:        { component: LedClock,        label: 'LED',        stackable: true },
  dots:       { component: DotsClock,       label: 'Dots',       stackable: true },
  matrix:     { component: MatrixClock,     label: 'Matrix',     stackable: true },
  abstract:   { component: AbstractClock,   label: 'Abstract',   stackable: false },
};
