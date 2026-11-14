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
// fullBleed: the design paints its own background and insets its own content.
export const CLOCK_DESIGNS: Record<string, {
  component: ComponentType<ClockDesignProps>;
  labelKey: string;
  stackable: boolean;
  supportsAccent: boolean;
  fullBleed?: boolean;
}> = {
  digital:    { component: DigitalClock,    labelKey: 'panel.widget.clock.settings.designName.digital', stackable: true, supportsAccent: true },
  analog:     { component: AnalogClock,     labelKey: 'panel.widget.clock.settings.designName.analog', stackable: false, supportsAccent: true },
  splitflap:  { component: SplitFlapClock,  labelKey: 'panel.widget.clock.settings.designName.splitflap', stackable: true, supportsAccent: true },
  rolling:    { component: RollingClock,    labelKey: 'panel.widget.clock.settings.designName.rolling', stackable: true, supportsAccent: true },
  led:        { component: LedClock,        labelKey: 'panel.widget.clock.settings.designName.led', stackable: true, supportsAccent: true },
  dots:       { component: DotsClock,       labelKey: 'panel.widget.clock.settings.designName.dots', stackable: true, supportsAccent: true },
  matrix:     { component: MatrixClock,     labelKey: 'panel.widget.clock.settings.designName.matrix', stackable: true, supportsAccent: true },
  abstract:   { component: AbstractClock,   labelKey: 'panel.widget.clock.settings.designName.abstract', stackable: false, supportsAccent: false, fullBleed: true },
};
