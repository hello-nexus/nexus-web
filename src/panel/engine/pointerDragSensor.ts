import { PointerSensor, type PointerSensorOptions } from '@dnd-kit/core';

export type DragActivation = 'distance' | 'delay';

/** A mouse drags after moving a short distance; touch, pen and a mouse standing in for touch hold first. */
export function dragActivationFor(pointerType: string, mouseAsTouch: boolean): DragActivation {
  return pointerType === 'mouse' && !mouseAsTouch ? 'distance' : 'delay';
}

export interface FilteredPointerOptions extends PointerSensorOptions {
  accept?: (event: PointerEvent) => boolean;
}

// A press the sensor declines falls to the next registered one, so two instances split by `accept`.
export class FilteredPointerSensor extends PointerSensor {
  static activators = [{
    eventName: 'onPointerDown' as const,
    handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }, options: FilteredPointerOptions) => {
      if (!event.isPrimary || event.button !== 0 || options.accept?.(event) === false) return false;
      options.onActivation?.({ event });
      return true;
    },
  }];
}
