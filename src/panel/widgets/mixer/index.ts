import { SlidersVertical } from 'lucide-react';
import type { AppManifest } from '../types';
import { MixerWidget } from './MixerWidget';
import { MixerTouch } from './MixerTouch';
import { MixerSettings } from './MixerSettings';

export const mixerApp: AppManifest = {
  meta: {
    type: 'mixer',
    i18nKey: 'panel.widget.mixer',
    icon: SlidersVertical,
    sizes: ['4x4'],
    defaultSize: '4x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    // Every control is a fader or a mute button, so a display-only surface
    // (Q60) would render an inert wall of sliders.
    touch: true,
  },
  Widget: MixerWidget,
  Touch: MixerTouch,
  Settings: MixerSettings,
};
