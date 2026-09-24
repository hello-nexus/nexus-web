// The generic manipulation stage: a `ui-layer` with gestures moves its
// `ui-manipulable` children with pointer events and reports the settled
// transform; taps select; `ui-youtube` frames only a valid video id.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { Layer, Manipulable, YouTube } from '../ui/LayerStage';

// jsdom has no layout: every element reports the stage box, which is all the
// layer measures and the geometry reads.
const W = 400;
const H = 800;
const proto = HTMLElement.prototype;
const saved = {
  cw: Object.getOwnPropertyDescriptor(proto, 'clientWidth'),
  ch: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
  rect: proto.getBoundingClientRect,
};
beforeEach(() => {
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => W });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => H });
  proto.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: W, height: H, right: W, bottom: H, toJSON: () => ({}) }) as DOMRect;
});
afterEach(() => {
  cleanup();
  if (saved.cw) Object.defineProperty(proto, 'clientWidth', saved.cw); else delete (proto as unknown as Record<string, unknown>).clientWidth;
  if (saved.ch) Object.defineProperty(proto, 'clientHeight', saved.ch); else delete (proto as unknown as Record<string, unknown>).clientHeight;
  proto.getBoundingClientRect = saved.rect;
});

function renderStage(opts: { editable?: boolean; gestures?: boolean; selected?: boolean; events?: Record<string, (...a: unknown[]) => void>; layerEvents?: Record<string, (...a: unknown[]) => void> } = {}) {
  const change = vi.fn();
  const press = vi.fn();
  const layerPress = vi.fn();
  const ref = { current: null as HTMLDivElement | null };
  const view = render(
    <div ref={ref} style={{ width: 400, height: 800 }}>
      <Layer grow gestures={opts.gestures ?? true} __events={{ press: layerPress, ...(opts.layerEvents ?? {}) }}>
        <Manipulable id="a" x={0.5} y={0.5} scale={1} rotation={0} editable={opts.editable ?? true} selected={opts.selected} __events={{ change, press, ...(opts.events ?? {}) }}>
          <span>art</span>
        </Manipulable>
      </Layer>
    </div>,
  );
  const layer = (view.container.querySelector('[data-layer-gestures]') ?? view.container.firstElementChild!.firstElementChild) as HTMLElement;
  return { view, layer, change, press, layerPress, item: () => view.container.querySelector('[data-manipulable-id="a"]') as HTMLElement };
}

describe('Layer + Manipulable', () => {
  it('places the child by its normalized transform and sizes it from the shorter side', () => {
    const { item } = renderStage();
    // The stage measures in a layout effect; a zero box would render nothing.
    const el = item();
    expect(el).toBeTruthy();
    expect(el.style.left).toBe('50%');
    expect(el.style.top).toBe('50%');
    expect(el.style.width).toBe(`${Math.round(400 * 0.24)}px`);
    expect(el.style.transform).toBe('rotate(0deg) scale(1)');
  });

  it('a drag reports the settled transform and a tap reports a press, on the child not the layer', () => {
    const { layer, change, press, layerPress, item } = renderStage();
    const el = item();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(layer, { pointerId: 1, clientX: 240, clientY: 480 });
    fireEvent.pointerUp(layer, { pointerId: 1, clientX: 240, clientY: 480 });
    expect(change).toHaveBeenCalledTimes(1);
    const t = change.mock.calls[0][0] as { x: number; y: number; scale: number; rotation: number };
    expect(t.x).toBeCloseTo(0.6);
    expect(t.y).toBeCloseTo(0.6);
    expect(press).not.toHaveBeenCalled();

    fireEvent.pointerDown(el, { pointerId: 2, clientX: 200, clientY: 400 });
    fireEvent.pointerUp(layer, { pointerId: 2, clientX: 201, clientY: 401 });
    expect(press).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
    fireEvent.click(el);
    expect(layerPress).not.toHaveBeenCalled();
  });

  it('a second finger anywhere on the layer turns the drag into a pinch and twist', () => {
    const { layer, change, item } = renderStage();
    const el = item();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 180, clientY: 400 });
    fireEvent.pointerDown(layer, { pointerId: 2, clientX: 220, clientY: 400 });
    fireEvent.pointerMove(layer, { pointerId: 1, clientX: 200, clientY: 360 });
    fireEvent.pointerMove(layer, { pointerId: 2, clientX: 200, clientY: 440 });
    fireEvent.pointerUp(layer, { pointerId: 2, clientX: 200, clientY: 440 });
    fireEvent.pointerUp(layer, { pointerId: 1, clientX: 200, clientY: 360 });
    expect(change).toHaveBeenCalledTimes(1);
    const t = change.mock.calls[0][0] as { scale: number; rotation: number };
    expect(t.scale).toBeCloseTo(2);
    expect(t.rotation).toBeCloseTo(90);
  });

  it('a non-editable child still reports taps but never moves; without gestures the layer is inert', () => {
    const a = renderStage({ editable: false });
    const el = a.item();
    expect(el.style.pointerEvents).toBe('auto');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(a.layer, { pointerId: 1, clientX: 260, clientY: 480 });
    fireEvent.pointerUp(a.layer, { pointerId: 1, clientX: 260, clientY: 480 });
    expect(a.change).not.toHaveBeenCalled();
    expect(a.press).not.toHaveBeenCalled();
    cleanup();

    const b = renderStage({ gestures: false });
    expect(b.view.container.querySelector('[data-layer-gestures]')).toBeNull();
  });
});

describe('Manipulable remove handle', () => {
  it('appears only while selected with a remove listener, fires it, and never starts a drag', () => {
    const remove = vi.fn();
    const { view, layer, change, press, item } = renderStage({ selected: true, events: { remove } });
    const handle = view.container.querySelector('[data-manipulable-remove]') as HTMLElement;
    expect(handle).not.toBeNull();
    expect(item().contains(handle)).toBe(true);

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 260, clientY: 340 });
    fireEvent.pointerMove(layer, { pointerId: 1, clientX: 300, clientY: 420 });
    fireEvent.pointerUp(layer, { pointerId: 1, clientX: 300, clientY: 420 });
    expect(change).not.toHaveBeenCalled();
    expect(press).not.toHaveBeenCalled();
    fireEvent.click(handle);
    expect(remove).toHaveBeenCalledTimes(1);

    cleanup();
    expect(renderStage({ selected: false, events: { remove } }).view.container.querySelector('[data-manipulable-remove]')).toBeNull();
    cleanup();
    expect(renderStage({ selected: true }).view.container.querySelector('[data-manipulable-remove]')).toBeNull();
  });
});

describe('YouTube', () => {
  it('frames the privacy-enhanced embed for a valid id and nothing otherwise', () => {
    const ok = render(<YouTube videoId="rFZHOHl-L8A" title="t" />);
    const frame = ok.container.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/rFZHOHl-L8A?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1');
    expect(frame.getAttribute('title')).toBe('t');
    cleanup();
    const noAuto = render(<YouTube videoId="rFZHOHl-L8A" autoplay={false} />);
    expect(noAuto.container.querySelector('iframe')!.getAttribute('src')).toContain('autoplay=0&mute=0');
    cleanup();
    expect(render(<YouTube videoId="../evil" />).container.querySelector('iframe')).toBeNull();
    expect(render(<YouTube />).container.querySelector('iframe')).toBeNull();
  });
});
