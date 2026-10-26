import { PointerSensor, type PointerActivationConstraint, type PointerSensorOptions, type SensorProps } from '@dnd-kit/core';

export type DragActivation = 'distance' | 'delay';

/** A mouse drags after moving a short distance; touch, pen and a mouse standing in for touch hold first. */
export function dragActivationFor(pointerType: string, mouseAsTouch: boolean): DragActivation {
  return pointerType === 'mouse' && !mouseAsTouch ? 'distance' : 'delay';
}

export interface AdaptivePointerOptions extends PointerSensorOptions {
  // Resolved per press: the activation a drag needs depends on who is pressing.
  constraintFor?: (event: PointerEvent) => PointerActivationConstraint;
}

// dnd-kit keeps one handler per event name, so two sensors cannot split by pointer type; one sensor picks its constraint per press.
export class AdaptivePointerSensor extends PointerSensor {
  constructor(props: SensorProps<AdaptivePointerOptions>) {
    const { constraintFor, ...rest } = props.options ?? {};
    super({ ...props, options: { ...rest, activationConstraint: constraintFor?.(props.event as PointerEvent) ?? rest.activationConstraint } });
  }
}
