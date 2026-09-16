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
