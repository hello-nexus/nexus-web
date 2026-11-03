import { BUILD_ICON } from '../../../app/buildEntry';
import type { AppManifest } from '../types';
import { BuildWidget } from './BuildWidget';

export const buildApp: AppManifest = {
  meta: {
    type: 'build',
    i18nKey: 'panel.widget.build',
    icon: BUILD_ICON,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    touch: false,
    surfaces: ['desktop'],
    localOnly: true,
  },
  Widget: BuildWidget,
};
