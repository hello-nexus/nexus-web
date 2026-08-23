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

// stackable: the design reads the time as digit groups, so it can put each unit
// on its own line - the analog face has no such groups. supportsAccent: the
// design honours useAccentColor; Abstract is drawn in the accent already.
export const CLOCK_DESIGNS: Record<string, {
  component: ComponentType<ClockDesignProps>;
  label: string;
  stackable: boolean;
  supportsAccent: boolean;
}> = {
  digital:    { component: DigitalClock,    label: 'Digital',    stackable: true, supportsAccent: true },
  analog:     { component: AnalogClock,     label: 'Analog',     stackable: false, supportsAccent: true },
  splitflap:  { component: SplitFlapClock,  label: 'Split Flap', stackable: true, supportsAccent: true },
  rolling:    { component: RollingClock,    label: 'Rolling',    stackable: true, supportsAccent: true },
  led:        { component: LedClock,        label: 'LED',        stackable: true, supportsAccent: true },
  dots:       { component: DotsClock,       label: 'Dots',       stackable: true, supportsAccent: true },
  matrix:     { component: MatrixClock,     label: 'Matrix',     stackable: true, supportsAccent: true },
  abstract:   { component: AbstractClock,   label: 'Abstract',   stackable: false, supportsAccent: false },
};
