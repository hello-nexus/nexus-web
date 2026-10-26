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

// dnd-kit's private session hooks; pointerDragSensor.test pins them across upgrades.
interface SensorInternals {
  handleCancel(): void;
  detach(): void;
}

// dnd-kit keeps one handler per event name, so two sensors cannot split by pointer type; one sensor picks its constraint per press.
export class AdaptivePointerSensor extends PointerSensor {
  constructor(props: SensorProps<AdaptivePointerOptions>) {
    const { constraintFor, ...rest } = props.options ?? {};
    super({ ...props, options: { ...rest, activationConstraint: constraintFor?.(props.event as PointerEvent) ?? rest.activationConstraint } });
    cancelOnLostRelease(this as unknown as SensorInternals, props.event.target);
  }
}

// A release over a system prompt or another app never reaches the page as pointerup: the next move reports no
// button held, or the window loses focus. dnd-kit already cancels on pointercancel and visibilitychange.
function cancelOnLostRelease(sensor: SensorInternals, target: EventTarget | null): void {
  const doc = target instanceof Node ? (target.ownerDocument ?? (target as Document)) : document;
  const win = doc.defaultView;
  const onMove = (event: Event) => {
    if ((event as PointerEvent).buttons === 0) sensor.handleCancel();
  };
  const onBlur = () => sensor.handleCancel();
  doc.addEventListener('pointermove', onMove);
  win?.addEventListener('blur', onBlur);
  const detach = sensor.detach.bind(sensor);
  sensor.detach = () => {
    doc.removeEventListener('pointermove', onMove);
    win?.removeEventListener('blur', onBlur);
    detach();
  };
}
