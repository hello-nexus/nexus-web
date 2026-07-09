import { lazy } from 'react';
import { Stethoscope } from 'lucide-react';
import type { AppManifest } from '../types';
import { DiagnosticsWidget } from './DiagnosticsWidget';

const DiagnosticsPage = lazy(() => import('./DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));

export const diagnosticsApp: AppManifest = {
  meta: {
    type: 'diagnostics',
    i18nKey: 'panel.widget.diagnostics',
    icon: Stethoscope,
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    pickerSize: '4x2',
    supportsImmersive: { portrait: false, landscape: false },
    touch: false,
    hasConfig: false,
  },
  Widget: DiagnosticsWidget,
  Page: DiagnosticsPage,
};
