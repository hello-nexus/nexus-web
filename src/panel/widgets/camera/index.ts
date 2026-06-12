import { Camera } from 'lucide-react';
import type { AppManifest } from '../types';
import { CameraWidget } from './CameraWidget';
import { CameraSettings } from './CameraSettings';
import { CameraTouch } from './CameraTouch';

export const cameraApp: AppManifest = {
  meta: {
    type: 'camera',
    i18nKey: 'panel.widget.camera',
    icon: Camera,
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: true,
    // Streams the phone's camera TO the host PC as a virtual webcam - the
    // PC's own panel surfaces have nothing to capture from. LAN-only in v1:
    // the relay transport is additionally gated at runtime in CameraWidget.
    remoteOnly: true,
  },
  Widget: CameraWidget,
  Touch: CameraTouch,
  Settings: CameraSettings,
};
