import type { WidgetProps } from '../types';
import { MixerBody, useMixerView } from './MixerWidget';

/** Fullscreen mixer: the same row, with the roomier immersive sizing. */
export function MixerTouch({ widget }: WidgetProps) {
  return <MixerBody {...useMixerView(widget.config)} immersive />;
}
