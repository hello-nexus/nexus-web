// A pointer an ancestor re-captures never sends this element its up, so the
// slot is purged at the next touch. Chromium defers gotpointercapture to the
// pointer's next event, so slots are claimed on pointerdown.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraController } from './cameraController';

function pointer(type: string, pointerId: number, x: number, y: number): Event {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  return e;
}

function mount() {
  const el = document.createElement('div');
  const held = new Set<number>();
  Object.assign(el, {
    setPointerCapture: (id: number) => { held.add(id); },
    releasePointerCapture: (id: number) => { held.delete(id); },
    hasPointerCapture: (id: number) => held.has(id),
  });
  const camera = new THREE.PerspectiveCamera();
  const controller = new CameraController(camera, new THREE.Object3D(), el, { pinchZoomSpeed: 0.05 });
  return { el, controller, steal: (id: number) => held.delete(id) };
}

describe('CameraController angle limits', () => {
  const opts = { minAngles: [-30, -20] as [number, number], maxAngles: [30, 20] as [number, number], overshootDeg: 8, overshootReturn: 0.9, dragSensitivity: 1, inertiaDamping: 0.9, maxDragDelta: 1000 };

  function yawOf(c: CameraController): number {
    return (c as unknown as { yawDeg: number }).yawDeg;
  }

  it('a drag past the limit resists instead of stopping dead, and eases back when released', () => {
    const el = document.createElement('div');
    Object.assign(el, { setPointerCapture: () => {}, hasPointerCapture: () => true });
    const c = new CameraController(new THREE.PerspectiveCamera(), new THREE.Object3D(), el, opts);
    el.dispatchEvent(pointer('pointerdown', 1, 0, 0));
    for (let i = 1; i <= 40; i++) el.dispatchEvent(pointer('pointermove', 1, -i * 20, 0));
    for (let i = 0; i < 30; i++) c.update(1 / 60);
    const held = yawOf(c);
    expect(held).toBeGreaterThan(30);
    expect(held).toBeLessThanOrEqual(30 + opts.overshootDeg);

    el.dispatchEvent(pointer('pointerup', 1, -800, 0));
    for (let i = 0; i < 30; i++) c.update(1 / 60);
    const halfway = yawOf(c);
    expect(halfway).toBeLessThan(held);
    for (let i = 0; i < 150; i++) c.update(1 / 60);
    expect(yawOf(c)).toBeCloseTo(30, 1);
    c.dispose();
  });

  it('a flick into the limit does not keep climbing after release', () => {
    const el = document.createElement('div');
    Object.assign(el, { setPointerCapture: () => {}, hasPointerCapture: () => true });
    const c = new CameraController(new THREE.PerspectiveCamera(), new THREE.Object3D(), el, { ...opts, inertiaDamping: 0.98 });
    el.dispatchEvent(pointer('pointerdown', 1, 0, 0));
    for (let i = 1; i <= 40; i++) el.dispatchEvent(pointer('pointermove', 1, -i * 25, 0));
    for (let i = 0; i < 20; i++) c.update(1 / 60);
    el.dispatchEvent(pointer('pointerup', 1, -1000, 0));
    const atRelease = yawOf(c);
    let peak = atRelease;
    for (let i = 0; i < 400; i++) { c.update(1 / 60); peak = Math.max(peak, yawOf(c)); }
    expect(peak).toBeLessThanOrEqual(atRelease + 0.01);
    expect(yawOf(c)).toBeCloseTo(30, 1);
  });

  it('inside the limits nothing is resisted', () => {
    const el = document.createElement('div');
    Object.assign(el, { setPointerCapture: () => {}, hasPointerCapture: () => true });
    const c = new CameraController(new THREE.PerspectiveCamera(), new THREE.Object3D(), el, opts);
    el.dispatchEvent(pointer('pointerdown', 1, 0, 0));
    el.dispatchEvent(pointer('pointermove', 1, -10, 0));
    for (let i = 0; i < 20; i++) c.update(1 / 60);
    const y = yawOf(c);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(30);
    c.dispose();
  });
});

describe('CameraController pointer slots', () => {
  it('purges a stolen pointer, so the next single finger drags instead of pinching', () => {
    const { el, controller, steal } = mount();
    const before = controller.getZoomFraction();
    el.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    steal(1);
    el.dispatchEvent(pointer('pointerdown', 2, 200, 200));
    el.dispatchEvent(pointer('pointermove', 2, 260, 200));
    el.dispatchEvent(pointer('pointermove', 2, 320, 200));
    expect(controller.getZoomFraction()).toBe(before);
    controller.dispose();
  });

  it('purges both slots when both were stolen', () => {
    const { el, controller, steal } = mount();
    const before = controller.getZoomFraction();
    el.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    el.dispatchEvent(pointer('pointerdown', 2, 200, 100));
    steal(1); steal(2);
    el.dispatchEvent(pointer('pointerdown', 3, 150, 150));
    el.dispatchEvent(pointer('pointermove', 3, 250, 150));
    el.dispatchEvent(pointer('pointermove', 3, 350, 150));
    expect(controller.getZoomFraction()).toBe(before);
    controller.dispose();
  });

  it('pinches when only the second finger moves', () => {
    const { el, controller } = mount();
    const before = controller.getZoomFraction();
    el.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    el.dispatchEvent(pointer('pointerdown', 2, 200, 100));
    el.dispatchEvent(pointer('pointermove', 2, 220, 100));
    el.dispatchEvent(pointer('pointermove', 2, 300, 100));
    expect(controller.getZoomFraction()).not.toBe(before);
    controller.dispose();
  });

  it('a lifted finger frees its slot', () => {
    const { el, controller } = mount();
    el.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    el.dispatchEvent(pointer('pointerdown', 2, 200, 100));
    el.dispatchEvent(pointer('pointermove', 2, 300, 100));
    const pinched = controller.getZoomFraction();
    el.dispatchEvent(pointer('pointerup', 1, 100, 100));
    el.dispatchEvent(pointer('pointerup', 2, 300, 100));
    el.dispatchEvent(pointer('pointerdown', 3, 50, 50));
    el.dispatchEvent(pointer('pointermove', 3, 150, 50));
    expect(controller.getZoomFraction()).toBe(pinched);
    controller.dispose();
  });
});
