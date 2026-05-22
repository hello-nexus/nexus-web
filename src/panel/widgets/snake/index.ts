import { Gamepad2 } from 'lucide-react';
import type { AppManifest } from '../types';
import { SnakeWidget } from './SnakeWidget';

export const snakeApp: AppManifest = {
  meta: {
    type: 'snake',
    i18nKey: 'panel.widget.snake',
    icon: Gamepad2,
    sizes: ['1x1', '4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: SnakeWidget,
};
