import { Calculator } from 'lucide-react';
import type { AppManifest } from '../types';
import { CalculatorWidget } from './CalculatorWidget';

export const calculatorApp: AppManifest = {
  meta: {
    type: 'calculator',
    i18nKey: 'panel.widget.calculator',
    icon: Calculator,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: CalculatorWidget,
};
