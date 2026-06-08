// The element-name -> host-component map. This is the structural visual-consistency
// boundary: the host renders ONLY these elements. An element a worker invents that
// is not a key here renders nothing, so a forged worker bundle cannot draw raw DOM.
// A unit test asserts these keys exactly equal the shared contract's element set.

import type { FC } from 'react';
import type { UiElementName } from './contract/elements';
import type { HostProps } from './ui/components';
import {
  Stack, Grid, Frame, Spacer, Divider, Text, Icon,
  Ring, Bar, Range, Gauge, Sparkline, Slider, Button, Stepper,
} from './ui/components';

export const ELEMENT_COMPONENTS: Record<UiElementName, FC<HostProps>> = {
  'ui-stack': Stack,
  'ui-grid': Grid,
  'ui-frame': Frame,
  'ui-spacer': Spacer,
  'ui-divider': Divider,
  'ui-text': Text,
  'ui-icon': Icon,
  'ui-ring': Ring,
  'ui-bar': Bar,
  'ui-range': Range,
  'ui-gauge': Gauge,
  'ui-sparkline': Sparkline,
  'ui-slider': Slider,
  'ui-button': Button,
  'ui-stepper': Stepper,
};
