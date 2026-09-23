/**
 * Port of Assets/Scripts/CameraController.cs: orbit-around-target camera with
 * drag inertia (mouse + touch via pointer events), pinch/scroll zoom,
 * aspect-aware framing, the one-shot intro push-in dolly, and the scripted
 * demo tour (delay -> zoom-in -> Lissajous orbit -> zoom-out).
 *
 * Angles are Unity euler degrees (yaw about Y, pitch about X); the rig math
 * mirrors the C# exactly, converted to three.js handedness the same way the
 * runtime converts pack data (negated X). Y-axis pointer deltas are stored
 * up-positive (Unity screen convention) so the ported formulas keep their
 * signs. The drag lerp (0.5/frame) and inertia damping are per-update like
 * the C# per-frame values, so they assume ~60 updates/s.
 *
 * User input is ignored while the intro push-in or the demo tour runs, as in
 * the C# (their Update paths return before input processing).
 */

import * as THREE from 'three';
import type { ScriptFieldValue } from '../../pack/types';

const DEG2RAD = Math.PI / 180;
/** One browser wheel notch (deltaY ~100) ~= Unity's 0.1 scroll-axis step. */
const WHEEL_PIXELS_TO_SCROLL = 0.001;
const WHEEL_LINES_TO_SCROLL = 1 / 30;

export interface CameraControllerOptions {
  /** Unity-space offset from the target's origin to the focus point. */
  targetOffset?: [number, number, number];
  dragSensitivity?: number;
  maxDragDelta?: number;
  /** [yaw, pitch] lower bounds, degrees. */
  minAngles?: [number, number];
  /** [yaw, pitch] upper bounds, degrees. */
  maxAngles?: [number, number];
  inertiaDamping?: number;
  pinchZoomSpeed?: number;
  mouseZoomSpeed?: number;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  verticalZoomOffset?: number;
  baseDistance?: number;
  /** Hard floor on camera-to-target distance after the aspect factor. */
  minDistance?: number;
  /** 0..1 strength of the square-canvas pull-in; 0 keeps baseDistance on every aspect. */
  aspectFraming?: number;
  /**
   * Resting zoom as a fraction of maxZoomLevel (0 = full body, the default;
   * 1 = the head-bone closeup the wheel otherwise has to be driven to). Rest
   * is what the camera returns to after the intro and the demo tour, so this
   * moves the whole neutral framing rather than nudging one transition.
   */
  restZoomFraction?: number;
  /** Yaw (degrees) blended in with zoom depth, so full zoom frames a 3/4 view. */
  zoomYawOffsetDeg?: number;
  /** How far full zoom pulls the focus onto zoomFocusTarget: 1 locks on it, lower keeps the body in frame. */
  zoomFocusLock?: number;
  /** Degrees of travel past a yaw/pitch limit a drag can accumulate; 0 is a hard stop. */
  overshootDeg?: number;
  /** Fraction of the remaining overshoot eased away per second once nothing holds it. */
  overshootReturn?: number;
  /** World-Y added to zoomFocusTarget's position (head bones anchor at the chin). */
  zoomFocusHeightOffset?: number;
  /**
   * Degrees the camera sits above the focus, looking down at it. Added on top
   * of the (clamped) drag pitch at every zoom, so minAngles/maxAngles bound
   * the drag around this elevation. The rest focus rises by its forward
   * offset times tan(elevation) so the character's own vertical plane, not
   * the point in front of it, stays centered.
   */
  elevationDeg?: number;
  /** Chain the demo tour after the intro push-in completes. */
  runDemoOnStart?: boolean;
  demoInitialDelay?: number;
  demoZoomInDuration?: number;
  demoOrbitDuration?: number;
  demoZoomOutDuration?: number;
  /** Fraction of maxZoomLevel reached at the deepest point of the zoom-in. */
  demoZoomDepth?: number;
  /** Fraction of the yaw range swept during the orbit phase. */
  demoYawAmplitude?: number;
  /** Fraction of the pitch range nodded during the orbit phase. */
  demoPitchAmplitude?: number;
  introPanDuration?: number;
  /** Extra start distance (world units) eased to zero by the push-in. */
  introStartExtraDistance?: number;
}

/**
 * Builds constructor options from an exported CameraController component's
 * fields (scripts.json), so inspector-tuned values override the defaults.
 */
export function cameraOptionsFromFields(fields: Record<string, ScriptFieldValue>): CameraControllerOptions {
  const opts: CameraControllerOptions = {};
  const num = (key: keyof CameraControllerOptions & string): void => {
    const v = fields[key];
    if (typeof v === 'number') (opts as Record<string, number>)[key] = v;
  };
  const vec = (key: 'minAngles' | 'maxAngles' | 'targetOffset', length: number): void => {
    const v = fields[key];
    if (Array.isArray(v) && v.length >= length && v.every((x) => typeof x === 'number')) {
      (opts as Record<string, number[]>)[key] = v;
    }
  };
  vec('targetOffset', 3);
  vec('minAngles', 2);
  vec('maxAngles', 2);
  for (const key of [
    'dragSensitivity', 'maxDragDelta', 'inertiaDamping', 'pinchZoomSpeed', 'mouseZoomSpeed',
    'minZoomLevel', 'maxZoomLevel', 'verticalZoomOffset', 'baseDistance', 'minDistance',
    'demoInitialDelay', 'demoZoomInDuration', 'demoOrbitDuration', 'demoZoomOutDuration',
    'demoZoomDepth', 'demoYawAmplitude', 'demoPitchAmplitude',
    'introPanDuration', 'introStartExtraDistance',
  ] as const) {
    num(key);
  }
  if (typeof fields.runDemoOnStart === 'boolean') opts.runDemoOnStart = fields.runDemoOnStart;
  return opts;
}

export class CameraController {
  /**
   * Closeup pivot (set post-construction, e.g. the head bone): as zoom
   * deepens the focus blends from the exported rest offset toward this node's
   * world position (by zoomFocusLock), so full zoom frames the node. Without
   * it, zoom raises the focus by verticalZoomOffset (the Unity behavior,
   * whose exported offset sits in front of the character - any yaw at depth
   * then swings the character out of frame).
   */
  zoomFocusTarget: THREE.Object3D | null = null;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly target: THREE.Object3D;
  private readonly element: HTMLElement;
  private readonly previousTouchAction: string;

  // Defaults are the reference pack's exported Main Camera component values.
  private readonly offset: THREE.Vector3;
  private readonly dragSensitivity: number;
  private readonly maxDragDelta: number;
  private readonly minAngles: [number, number];
  private readonly maxAngles: [number, number];
  private readonly inertiaDamping: number;
  private readonly pinchZoomSpeed: number;
  private readonly mouseZoomSpeed: number;
  private readonly minZoomLevel: number;
  private readonly maxZoomLevel: number;
  private readonly verticalZoomOffset: number;
  private readonly baseDistance: number;
  private readonly minDistance: number;
  private readonly aspectFraming: number;
  private readonly restZoomLevel: number;
  private readonly zoomYawOffsetDeg: number;
  private readonly zoomFocusLock: number;
  private readonly overshootDeg: number;
  private readonly overshootReturn: number;
  private readonly zoomFocusHeightOffset: number;
  private readonly elevationDeg: number;
  private readonly runDemoOnStart: boolean;
  private readonly demoInitialDelay: number;
  private readonly demoZoomInDuration: number;
  private readonly demoOrbitDuration: number;
  private readonly demoZoomOutDuration: number;
  private readonly demoZoomDepth: number;
  private readonly demoYawAmplitude: number;
  private readonly demoPitchAmplitude: number;
  private readonly introPanDuration: number;
  private readonly introStartExtraDistance: number;

  /** currentRotation.x/.y in the C#: yaw/pitch degrees. */
  private yawDeg = 0;
  private pitchDeg = 0;
  private dragDeltaX = 0;
  private dragDeltaY = 0;
  private zoomLevel = 0;
  /** Pointer movement (Unity screen convention: y up) since the last update. */
  private pendingDx = 0;
  private pendingDy = 0;
  private yawSlack = 0;
  private pitchSlack = 0;
  private isPinching = false;
  private lastTouchMag = 0;

  // Two tracked pointer slots, mirroring Unity's touch0/touch1 (ids -1 = empty).
  private p0Id = -1;
  private p0X = 0;
  private p0Y = 0;
  private p1Id = -1;
  private p1X = 0;
  private p1Y = 0;

  private introActive = false;
  private introElapsed = 0;
  private introDistanceBoost = 0;
  private demoActive = false;
  private demoElapsed = 0;

  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly dir = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly zoomFocus = new THREE.Vector3();

  private readonly onPointerDown = (e: PointerEvent): void => this.handlePointerDown(e);
  private readonly onPointerMove = (e: PointerEvent): void => this.handlePointerMove(e);
  private readonly onPointerUp = (e: PointerEvent): void => this.handlePointerUp(e);
  private readonly onWheel = (e: WheelEvent): void => this.handleWheel(e);

  constructor(
    camera: THREE.PerspectiveCamera,
    target: THREE.Object3D,
    element: HTMLElement,
    options: CameraControllerOptions = {},
  ) {
    this.camera = camera;
    this.target = target;
    this.element = element;

    const off = options.targetOffset ?? [0, 0.9, 1];
    // Unity -> three handedness: negate X (matches the runtime's converters).
    this.offset = new THREE.Vector3(-off[0], off[1], off[2]);
    this.dragSensitivity = options.dragSensitivity ?? 0.1;
    this.maxDragDelta = options.maxDragDelta ?? 10;
    this.minAngles = options.minAngles ?? [-10, -5];
    this.maxAngles = options.maxAngles ?? [10, 5];
    this.inertiaDamping = options.inertiaDamping ?? 0.98;
    this.pinchZoomSpeed = options.pinchZoomSpeed ?? 0.01;
    this.mouseZoomSpeed = options.mouseZoomSpeed ?? 2;
    this.minZoomLevel = options.minZoomLevel ?? 0;
    this.maxZoomLevel = options.maxZoomLevel ?? 2.1;
    this.verticalZoomOffset = options.verticalZoomOffset ?? 0.2;
    this.baseDistance = options.baseDistance ?? 2.3;
    this.minDistance = options.minDistance ?? 0.7;
    this.aspectFraming = options.aspectFraming ?? 1;
    this.restZoomLevel = this.maxZoomLevel * clamp01(options.restZoomFraction ?? 0);
    this.zoomLevel = this.restZoomLevel;
    this.zoomYawOffsetDeg = options.zoomYawOffsetDeg ?? 0;
    this.zoomFocusLock = clamp01(options.zoomFocusLock ?? 1);
    this.overshootDeg = Math.max(0, options.overshootDeg ?? 0);
    // 0 would leave the slack in place forever; keep a floor under the ease.
    this.overshootReturn = clamp(options.overshootReturn ?? 0.85, 0.01, 0.999999);
    this.zoomFocusHeightOffset = options.zoomFocusHeightOffset ?? 0;
    this.elevationDeg = options.elevationDeg ?? 0;
    this.runDemoOnStart = options.runDemoOnStart ?? true;
    this.demoInitialDelay = options.demoInitialDelay ?? 5;
    this.demoZoomInDuration = options.demoZoomInDuration ?? 3.5;
    this.demoOrbitDuration = options.demoOrbitDuration ?? 8;
    this.demoZoomOutDuration = options.demoZoomOutDuration ?? 3.5;
    this.demoZoomDepth = options.demoZoomDepth ?? 0.7;
    this.demoYawAmplitude = options.demoYawAmplitude ?? 0.85;
    this.demoPitchAmplitude = options.demoPitchAmplitude ?? 0.4;
    this.introPanDuration = options.introPanDuration ?? 4;
    this.introStartExtraDistance = options.introStartExtraDistance ?? 0.45;

    this.previousTouchAction = element.style.touchAction;
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('lostpointercapture', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });

    this.applyTransform();
  }

  /**
   * One-shot opening push-in: holds the resting yaw/pitch/zoom while the extra
   * start distance eases to zero, then hands off to the demo tour (when
   * runDemoOnStart) or to user input.
   */
  startIntroPushIn(): void {
    this.demoActive = false;
    this.introActive = true;
    this.introElapsed = 0;
    this.zoomLevel = this.restZoomLevel;
    this.yawDeg = 0;
    this.pitchDeg = 0;
    this.introDistanceBoost = this.introStartExtraDistance;
  }

  startDemoTour(): void {
    this.introActive = false;
    this.introDistanceBoost = 0;
    this.demoActive = true;
    this.demoElapsed = 0;
    this.zoomLevel = this.restZoomLevel;
    this.yawDeg = 0;
    this.pitchDeg = 0;
  }

  stopDemoTour(): void {
    if (!this.demoActive) return;
    this.demoActive = false;
    this.zoomLevel = this.restZoomLevel;
    this.yawDeg = 0;
    this.pitchDeg = 0;
  }

  update(dt: number): void {
    if (this.scriptedActive) { this.yawSlack = 0; this.pitchSlack = 0; }
    if (this.introActive) {
      this.introElapsed += dt;
      this.updateIntro();
      this.applyTransform();
      this.discardInput();
      return;
    }

    if (this.demoActive) {
      this.demoElapsed += dt;
      this.updateDemo();
      this.applyTransform();
      this.discardInput();
      return;
    }

    if (this.p0Id !== -1) {
      // dragDelta chases the frame movement (C# Vector2.Lerp factor 0.5).
      this.dragDeltaX += (this.pendingDx - this.dragDeltaX) * 0.5;
      this.dragDeltaY += (this.pendingDy - this.dragDeltaY) * 0.5;
      const mag = Math.hypot(this.dragDeltaX, this.dragDeltaY);
      if (mag > this.maxDragDelta && mag > 0) {
        const s = this.maxDragDelta / mag;
        this.dragDeltaX *= s;
        this.dragDeltaY *= s;
      }
      this.pendingDx = 0;
      this.pendingDy = 0;
    }

    if (Math.hypot(this.dragDeltaX, this.dragDeltaY) > 0.001) {
      this.dragDeltaX *= this.inertiaDamping;
      this.dragDeltaY *= this.inertiaDamping;
    }

    const dragging = this.p0Id !== -1;
    const yaw = this.applyLimit(
      this.yawDeg + this.dragDeltaX * this.dragSensitivity,
      this.minAngles[0], this.maxAngles[0], this.yawSlack, dragging, dt);
    this.yawDeg = yaw.angle;
    this.yawSlack = yaw.slack;
    if (yaw.blocked) this.dragDeltaX = 0;
    const pitch = this.applyLimit(
      this.pitchDeg - this.dragDeltaY * this.dragSensitivity,
      this.minAngles[1], this.maxAngles[1], this.pitchSlack, dragging, dt);
    this.pitchDeg = pitch.angle;
    this.pitchSlack = pitch.slack;
    if (pitch.blocked) this.dragDeltaY = 0;

    this.applyTransform();
  }

  dispose(): void {
    const el = this.element;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('lostpointercapture', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.style.touchAction = this.previousTouchAction;
  }

  private get scriptedActive(): boolean {
    return this.introActive || this.demoActive;
  }

  private updateIntro(): void {
    if (this.introElapsed >= this.introPanDuration) {
      this.introActive = false;
      this.introDistanceBoost = 0;
      this.zoomLevel = this.restZoomLevel;
      this.yawDeg = 0;
      this.pitchDeg = 0;
      if (this.runDemoOnStart) {
        this.demoActive = true;
        this.demoElapsed = 0;
      }
      return;
    }

    const p = smooth01(this.introElapsed / this.introPanDuration);
    this.introDistanceBoost = this.introStartExtraDistance * (1 - p);
    this.zoomLevel = this.restZoomLevel;
    this.yawDeg = 0;
    this.pitchDeg = 0;
  }

  private updateDemo(): void {
    let elapsed = this.demoElapsed;
    const total = this.demoInitialDelay + this.demoZoomInDuration + this.demoOrbitDuration + this.demoZoomOutDuration;

    if (elapsed >= total) {
      this.demoActive = false;
      this.zoomLevel = this.restZoomLevel;
      this.yawDeg = 0;
      this.pitchDeg = 0;
      return;
    }

    // Initial idle hold before any motion.
    if (elapsed < this.demoInitialDelay) {
      this.zoomLevel = this.restZoomLevel;
      this.yawDeg = 0;
      this.pitchDeg = 0;
      return;
    }

    elapsed -= this.demoInitialDelay;
    const depth = this.maxZoomLevel * clamp01(this.demoZoomDepth);

    if (elapsed < this.demoZoomInDuration) {
      this.zoomLevel = depth * smooth01(elapsed / this.demoZoomInDuration);
    } else if (elapsed < this.demoZoomInDuration + this.demoOrbitDuration) {
      // Orbit phase: zoom held at depth, the rotation sweeps a Lissajous-style
      // figure (one full yaw cycle, two pitch nods).
      const lt = (elapsed - this.demoZoomInDuration) / this.demoOrbitDuration;
      const yawSweep = Math.sin(lt * Math.PI * 2) * 0.5;
      const pitchSweep = Math.sin(lt * Math.PI * 4) * 0.5;

      const yawCenter = (this.minAngles[0] + this.maxAngles[0]) * 0.5;
      const yawHalf = (this.maxAngles[0] - this.minAngles[0]) * 0.5;
      const pitchCenter = (this.minAngles[1] + this.maxAngles[1]) * 0.5;
      const pitchHalf = (this.maxAngles[1] - this.minAngles[1]) * 0.5;

      this.yawDeg = yawCenter + yawSweep * yawHalf * this.demoYawAmplitude * 2;
      this.pitchDeg = pitchCenter + pitchSweep * pitchHalf * this.demoPitchAmplitude * 2;
      this.zoomLevel = depth;
    } else {
      const p = smooth01((elapsed - this.demoZoomInDuration - this.demoOrbitDuration) / this.demoZoomOutDuration);
      this.zoomLevel = depth + (0 - depth) * p;
      // Per-frame compounding lerp toward rest, as the C# does.
      this.yawDeg += (0 - this.yawDeg) * p;
      this.pitchDeg += (0 - this.pitchDeg) * p;
    }
  }

  private applyTransform(): void {
    // Unity: Quaternion.Euler(pitch, yaw, 0) * Vector3.forward, X negated for
    // three.js handedness. With rest angles the camera sits at +Z of the focus.
    const zoomFraction = this.maxZoomLevel > 0 ? clamp01(this.zoomLevel / this.maxZoomLevel) : 0;
    // Negative X pitch swings the camera above the focus (dir.y > 0).
    this.euler.set(
      (this.pitchDeg + this.pitchSlack - this.elevationDeg) * DEG2RAD,
      (this.yawDeg + this.yawSlack + zoomFraction * this.zoomYawOffsetDeg) * DEG2RAD,
      0);
    this.dir.set(0, 0, 1).applyEuler(this.euler);
    this.dir.x = -this.dir.x;

    this.focus.copy(this.target.position).add(this.offset);
    this.focus.y += this.offset.z * Math.tan(this.elevationDeg * DEG2RAD);
    if (this.zoomFocusTarget) {
      this.zoomFocusTarget.getWorldPosition(this.zoomFocus);
      this.zoomFocus.y += this.zoomFocusHeightOffset;
      this.focus.lerp(this.zoomFocus, zoomFraction * this.zoomFocusLock);
    } else {
      this.focus.y += this.zoomLevel * this.verticalZoomOffset;
    }

    // Aspect-aware framing: a tall portrait canvas keeps the full base
    // distance; a square/landscape canvas pulls the camera in so the
    // character occupies more of the cell.
    const aspectFactor = lerp(1, 0.55, clamp01((this.camera.aspect - 0.5) / 0.5) * this.aspectFraming);
    const effectiveDistance =
      Math.max(this.minDistance, this.baseDistance * aspectFactor - this.zoomLevel) + this.introDistanceBoost;

    this.camera.position.copy(this.focus).addScaledVector(this.dir, effectiveDistance);
    this.camera.lookAt(this.focus);
  }

  // The angle itself never leaves its limits; travel past one is banked as
  // slack, added only when the camera is placed. Slack resists further travel
  // the deeper it goes and eases away once nothing holds it, so the drag can
  // always come straight back the other way.
  private applyLimit(
    angle: number, min: number, max: number, slack: number, dragging: boolean, dt: number,
  ): { angle: number; slack: number; blocked: boolean } {
    const clamped = clamp(angle, min, max);
    const over = angle - clamped;
    if (dragging && over !== 0 && this.overshootDeg > 0) {
      // A degree of travel past the edge buys less the closer slack already is
      // to overshootDeg, so the band tightens with distance, not drag speed.
      const next = slack + over * (1 - Math.abs(slack) / this.overshootDeg);
      return { angle: clamped, slack: clamp(next, -this.overshootDeg, this.overshootDeg), blocked: true };
    }
    if (slack === 0) return { angle: clamped, slack: 0, blocked: over !== 0 };
    const eased = slack * Math.pow(1 - this.overshootReturn, dt);
    return { angle: clamped, slack: Math.abs(eased) < 0.01 ? 0 : eased, blocked: over !== 0 };
  }

  private zoom(increment: number): void {
    this.zoomLevel = clamp(this.zoomLevel + increment, this.minZoomLevel, this.maxZoomLevel);
  }

  /** Zoom depth as a fraction of the deepest closeup, the unit a host slider speaks. */
  getZoomFraction(): number {
    return this.maxZoomLevel > 0 ? clamp01(this.zoomLevel / this.maxZoomLevel) : 0;
  }

  /** Jumps the zoom to a fraction of the deepest closeup; ignored while a scripted move owns the camera. */
  setZoomFraction(fraction: number): void {
    if (this.scriptedActive) return;
    this.zoomLevel = clamp(this.maxZoomLevel * clamp01(fraction), this.minZoomLevel, this.maxZoomLevel);
  }

  private discardInput(): void {
    this.pendingDx = 0;
    this.pendingDy = 0;
    this.dragDeltaX = 0;
    this.dragDeltaY = 0;
  }

  // An ancestor re-capturing a pointer in the same dispatch (the sticker layer
  // joining a second finger to its pinch) takes it from this element, which
  // then never receives that pointer's up; its slot is dropped here instead.
  // Claiming on `gotpointercapture` cannot replace this: it is deferred to the
  // pointer's next event, so a motionless finger would hold no slot.
  private releaseStolenSlots(): void {
    const held = (id: number) => id === -1 || this.element.hasPointerCapture(id);
    if (!held(this.p1Id)) this.p1Id = -1;
    if (!held(this.p0Id)) {
      this.p0Id = this.p1Id;
      this.p0X = this.p1X;
      this.p0Y = this.p1Y;
      this.p1Id = -1;
    }
    if (this.p0Id === -1 || this.p1Id === -1) this.isPinching = false;
  }

  private handlePointerDown(e: PointerEvent): void {
    this.releaseStolenSlots();
    if (this.p0Id === -1) {
      this.p0Id = e.pointerId;
      this.p0X = e.clientX;
      this.p0Y = e.clientY;
    } else if (this.p1Id === -1 && e.pointerId !== this.p0Id) {
      this.p1Id = e.pointerId;
      this.p1X = e.clientX;
      this.p1Y = e.clientY;
    } else {
      return; // third pointer: ignored, as with Unity touch0/touch1
    }
    this.element.setPointerCapture(e.pointerId);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerId === this.p0Id) {
      if (!this.scriptedActive) {
        // Inverted drag: the finger pulls the world, not the camera - drag
        // left orbits the view right. Sign-flip at the input only; ranges,
        // sensitivity, and inertia are unchanged. (Stored up-positive per
        // Unity screen convention, inverted.)
        this.pendingDx -= e.clientX - this.p0X;
        this.pendingDy += e.clientY - this.p0Y;
      }
      this.p0X = e.clientX;
      this.p0Y = e.clientY;
    } else if (e.pointerId === this.p1Id) {
      this.p1X = e.clientX;
      this.p1Y = e.clientY;
    } else {
      return;
    }

    if (this.p0Id !== -1 && this.p1Id !== -1) {
      const mag = Math.hypot(this.p0X - this.p1X, this.p0Y - this.p1Y);
      if (!this.isPinching) {
        this.isPinching = true;
        this.lastTouchMag = mag;
      } else if (!this.scriptedActive) {
        this.zoom((mag - this.lastTouchMag) * this.pinchZoomSpeed);
      }
      this.lastTouchMag = mag;
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.pointerId === this.p1Id) {
      this.p1Id = -1;
    } else if (e.pointerId === this.p0Id) {
      // Promote the second pointer to primary, as Unity's touch list reindexes.
      this.p0Id = this.p1Id;
      this.p0X = this.p1X;
      this.p0Y = this.p1Y;
      this.p1Id = -1;
    } else {
      return;
    }
    if (this.p0Id === -1 || this.p1Id === -1) this.isPinching = false;
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.scriptedActive) return;
    const scroll = -e.deltaY * (e.deltaMode === 1 ? WHEEL_LINES_TO_SCROLL : WHEEL_PIXELS_TO_SCROLL);
    if (Math.abs(scroll) > 0.01) this.zoom(scroll * this.mouseZoomSpeed);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth01(t: number): number {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}
