import { createElement, type ComponentType } from 'react';
import type { WidgetProps } from '../types';
import { makeWidgetTouchView } from '../common/WidgetTouchView';
import { CameraWidget } from './CameraWidget';

// Fullscreen letterboxes (whole frame visible) where the tile crops to fill;
// same shared capture session and controls either way.
function CameraImmersive(props: WidgetProps) {
  return createElement(CameraWidget, { ...props, immersive: true });
}

export const CameraTouch: ComponentType<WidgetProps> = makeWidgetTouchView(CameraImmersive);
