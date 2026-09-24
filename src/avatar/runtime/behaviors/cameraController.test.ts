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

  /** Where the camera is actually placed: the clamped angle plus any slack. */
  function yawOf(c: CameraController): number {
    const priv = c as unknown as { yawDeg: number; yawSlack: number };
    return priv.yawDeg + priv.yawSlack;
  }

  function drag(el: HTMLElement, c: CameraController, dx: number, steps = 25): void {
    el.dispatchEvent(pointer('pointerdown', 1, 0, 0));
    for (let i = 1; i <= steps; i++) el.dispatchEvent(pointer('pointermove', 1, (dx / steps) * i, 0));
    for (let i = 0; i < 20; i++) c.update(1 / 60);
    el.dispatchEvent(pointer('pointerup', 1, dx, 0));
    for (let i = 0; i < 400; i++) c.update(1 / 60);
  }

  function mounted(o: Partial<typeof opts> = {}): { el: HTMLElement; c: CameraController } {
    const el = document.createElement('div');
    Object.assign(el, { setPointerCapture: () => {}, hasPointerCapture: () => true });
    return { el, c: new CameraController(new THREE.PerspectiveCamera(), new THREE.Object3D(), el, { ...opts, ...o }) };
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

  it('after hitting a limit the camera still pans back the other way', () => {
    const { el, c } = mounted();
    drag(el, c, -900);
    expect(yawOf(c)).toBe(30);
    // A modest drag the other way must move it off the limit it just hit.
    drag(el, c, 20);
    const back = yawOf(c);
    expect(back).toBeLessThan(29);
    expect(back).toBeGreaterThan(0);
    drag(el, c, 900);
    expect(yawOf(c)).toBe(-30);
    drag(el, c, -20);
    expect(yawOf(c)).toBeGreaterThan(-29);
    c.dispose();
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

describe('CameraController elevation', () => {
  function placed(elevationDeg: number): THREE.PerspectiveCamera {
    const el = document.createElement('div');
    const camera = new THREE.PerspectiveCamera();
    const c = new CameraController(camera, new THREE.Object3D(), el, { elevationDeg, runDemoOnStart: false, targetOffset: [0, 0.9, 1] });
    c.update(1 / 60);
    camera.updateMatrixWorld();
    return camera;
  }

  it('raises the camera and looks down', () => {
    const flat = placed(0);
    const up = placed(8);
    expect(up.position.y).toBeGreaterThan(flat.position.y);
    expect(up.getWorldDirection(new THREE.Vector3()).y).toBeLessThan(0);
  });

  it('keeps the target plane where it was on screen instead of the point in front of it', () => {
    // A point on the target's own vertical plane at the unelevated focus height.
    const onPlane = new THREE.Vector3(0, 0.9, 0);
    const flatY = onPlane.clone().project(placed(0)).y;
    const upY = onPlane.clone().project(placed(8)).y;
    expect(Math.abs(upY - flatY)).toBeLessThan(0.03);
  });
});

describe('CameraController recenter and pitch floor', () => {
  const opts = { minAngles: [-30, -10] as [number, number], maxAngles: [30, 0] as [number, number], overshootDeg: 8, dragSensitivity: 1, inertiaDamping: 0.5, maxDragDelta: 1000 };

  function mounted(o: Record<string, unknown> = {}): { el: HTMLElement; c: CameraController } {
    const el = document.createElement('div');
    Object.assign(el, { setPointerCapture: () => {}, hasPointerCapture: () => true });
    return { el, c: new CameraController(new THREE.PerspectiveCamera(), new THREE.Object3D(), el, { ...opts, ...o }) };
  }

  /** Placed yaw and pitch: the clamped angles plus any slack. */
  function angles(c: CameraController): { yaw: number; pitch: number } {
    const p = c as unknown as { yawDeg: number; yawSlack: number; pitchDeg: number; pitchSlack: number };
    return { yaw: p.yawDeg + p.yawSlack, pitch: p.pitchDeg + p.pitchSlack };
  }

  function dragAndRelease(el: HTMLElement, c: CameraController, dx: number, dy: number): void {
    el.dispatchEvent(pointer('pointerdown', 1, 0, 0));
    for (let i = 1; i <= 10; i++) el.dispatchEvent(pointer('pointermove', 1, (dx / 10) * i, (dy / 10) * i));
    for (let i = 0; i < 20; i++) c.update(1 / 60);
    el.dispatchEvent(pointer('pointerup', 1, dx, dy));
  }

  const run = (c: CameraController, seconds: number): void => {
    for (let i = 0; i < seconds * 60; i++) c.update(1 / 60);
  };

  it('eases yaw and pitch back to rest once the camera sits idle', () => {
    const { el, c } = mounted({ recenterAfterS: 3 });
    dragAndRelease(el, c, -15, 5);
    run(c, 2);
    const held = angles(c);
    expect(held.yaw).toBeGreaterThan(5);
    expect(held.pitch).toBeLessThan(-1);
    run(c, 4);
    expect(angles(c).yaw).toBeCloseTo(0, 1);
    expect(angles(c).pitch).toBeCloseTo(0, 1);
    c.dispose();
  });

  it('a wheel turn restarts the idle clock', () => {
    const { el, c } = mounted({ recenterAfterS: 3 });
    dragAndRelease(el, c, -15, 0);
    run(c, 2);
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    run(c, 2);
    expect(angles(c).yaw).toBeGreaterThan(5);
    c.dispose();
  });

  it('stays where the user left it when recentering is off', () => {
    const { el, c } = mounted();
    dragAndRelease(el, c, -15, 0);
    run(c, 10);
    expect(angles(c).yaw).toBeGreaterThan(5);
    c.dispose();
  });

  it('looking up opens only as the zoom closes in', () => {
    // Pointer up raises pitch, which lowers the camera.
    const lookUp = (zoom: number): number => {
      const { el, c } = mounted({ maxAngles: [30, 15], zoomOutMaxPitchDeg: 0 });
      c.setZoomFraction(zoom);
      el.dispatchEvent(pointer('pointerdown', 1, 0, 0));
      for (let i = 1; i <= 20; i++) el.dispatchEvent(pointer('pointermove', 1, 0, -i * 20));
      run(c, 0.5);
      const pitch = angles(c).pitch;
      c.dispose();
      return pitch;
    };
    expect(lookUp(0)).toBe(0);
    const half = lookUp(0.5);
    expect(half).toBeGreaterThan(7.5);
    expect(half).toBeLessThanOrEqual(7.5 + opts.overshootDeg / 2);
    expect(lookUp(1)).toBeGreaterThan(15);
  });
});

describe('CameraController recenter with a stolen pointer', () => {
  it('recenters once an ancestor has taken the dragging pointer', () => {
    const el = document.createElement('div');
    const held = new Set<number>();
    Object.assign(el, {
      setPointerCapture: (id: number) => { held.add(id); },
      hasPointerCapture: (id: number) => held.has(id),
    });
    const c = new CameraController(new THREE.PerspectiveCamera(), new THREE.Object3D(), el, { recenterAfterS: 1, dragSensitivity: 1, maxDragDelta: 1000 });
    const yaw = (): number => (c as unknown as { yawDeg: number }).yawDeg;
    el.dispatchEvent(pointer('pointerdown', 7, 0, 0));
    el.dispatchEvent(pointer('pointermove', 7, -8, 0));
    for (let i = 0; i < 10; i++) c.update(1 / 60);
    expect(yaw()).toBeGreaterThan(1);
    held.delete(7);
    for (let i = 0; i < 240; i++) c.update(1 / 60);
    expect(yaw()).toBeCloseTo(0, 1);
    c.dispose();
  });
});
