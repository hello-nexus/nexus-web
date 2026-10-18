export interface HoverResizeInput {
  pointerType: string;
  hoverCapable: boolean;
  /** A touchscreen delivering mouse pointers: it has no hover. */
  mouseAsTouch: boolean;
  /** Anything that moves or covers tiles, or an explicit resize mode, takes precedence. */
  busy: boolean;
}

/** Corners show on hover only for a real hovering mouse. */
export function hoverResizeAllowed(i: HoverResizeInput): boolean {
  return i.pointerType === 'mouse' && i.hoverCapable && !i.mouseAsTouch && !i.busy;
}

/** The widget under the pointer; a corner of the frame keeps its own widget. */
export function hoverTargetId(target: EventTarget | null): string | null | undefined {
  if (!(target instanceof Element)) return null;
  const frame = target.closest('[data-freeform-frame]');
  if (frame) return undefined;
  return target.closest('[data-panel-widget-id]')?.getAttribute('data-panel-widget-id') ?? null;
}
