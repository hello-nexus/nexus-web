import { Gamepad2 } from 'lucide-react';
import type { AppManifest } from '../types';
import { SnakeWidget } from './SnakeWidget';
import { SnakeTouch } from './SnakeTouch';

export const snakeApp: AppManifest = {
  meta: {
    type: 'snake',
    i18nKey: 'panel.widget.snake',
    icon: Gamepad2,
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: true, landscape: false },
    hasConfig: false,
    touch: true,
  },
  Widget: SnakeWidget,
  Touch: SnakeTouch,
};
