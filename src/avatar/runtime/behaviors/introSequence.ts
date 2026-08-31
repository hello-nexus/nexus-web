/**
 * Port of Assets/Scripts/IntroSequence.cs: first-load opening sequence.
 *
 * 1. Covers the view (alpha 1) and fades up over fadeDuration. The module does
 *    not own DOM: it reports overlay opacity through onFadeProgress(alpha01)
 *    (1 = fully covered, 0 = clear) and the host maps that to an overlay.
 * 2. forcePlays the walk-in state once (non-looping; the camera push-in
 *    provides the sense of arrival); the graph's own exit-time transition
 *    returns it to the idle hub.
 * 3. Freezes the spring bones at start so the walk-in cannot fling the hair,
 *    releasing them softBoneStartDelay seconds after the fade begins so they
 *    move dynamically for the rest of the walk.
 * 4. Waits for the walk-in to leave (bounded by walkInTimeout, in which case
 *    the hub is forced) and then signals onComplete, which the orchestrator
 *    uses to start the camera push-in / demo.
 *
 * Frame-time guards from the C# keep the fade smooth despite large first
 * frame deltas (asset load / shader compile): the view stays fully covered
 * until the frame time settles, and a single fade step never advances more
 * than maxFadeStep.
 */

import type { AvatarStateMachine } from '../anim/stateMachine';

/** Structural subset of SpringBones (src/runtime/physics/springBones.ts). */
export interface SoftBodyHandle {
  setFrozen(frozen: boolean): void;
}

export interface IntroSequenceOptions {
  /** Master switch; when false, start() completes immediately (no fade, no walk-in). */
  runIntroOnStart?: boolean;
  /** Graph state to play once at the start; must auto-exit back to the hub. */
  walkInState?: string;
  /** Hub state forced if the walk-in never exits by walkInTimeout. */
  hubStateName?: string;
  /** Seconds for the view to fade up from fully covered. */
  fadeDuration?: number;
  /** Seconds after the fade begins before the spring bones start simulating. */
  softBoneStartDelay?: number;
  /** Safety ceiling on waiting for the walk-in to finish, from fade end. */
  walkInTimeout?: number;
  debug?: boolean;
  /** Overlay opacity, 1 = fully covered, 0 = clear. */
  onFadeProgress?: (alpha01: number) => void;
  onComplete?: () => void;
}

/** A delta above this is treated as a load spike; stay covered while settling. */
const FRAME_SETTLE_THRESHOLD = 0.1;
/** Ceiling on frames held covered while waiting for frame time to settle. */
const MAX_SETTLE_FRAMES = 10;
/** Largest time a single fade frame may advance. */
const MAX_FADE_STEP = 0.05;
/** Fade used when the timeout fallback forces the hub state. */
const TIMEOUT_HUB_FADE_SECONDS = 0.25;

type Phase = 'idle' | 'settle' | 'fade' | 'walk' | 'done';

export class IntroSequence {
  private readonly stateMachine: AvatarStateMachine;
  private readonly springBones: SoftBodyHandle;
  private readonly runIntroOnStart: boolean;
  private readonly walkInState: string;
  private readonly hubStateName: string;
  private readonly fadeDuration: number;
  private readonly softBoneStartDelay: number;
  private readonly walkInTimeout: number;
  private readonly debug: boolean;
  private readonly onFadeProgress: ((alpha01: number) => void) | null;
  private readonly onComplete: (() => void) | null;

  private phase: Phase = 'idle';
  private clock = 0;
  private settleFrames = 0;
  private fadeT = 0;
  private boneReleaseAt = Infinity;
  private walkDeadline = Infinity;
  private bonesFrozen = false;
  private lastAlpha = -1;

  constructor(stateMachine: AvatarStateMachine, springBones: SoftBodyHandle, options: IntroSequenceOptions = {}) {
    this.stateMachine = stateMachine;
    this.springBones = springBones;
    this.runIntroOnStart = options.runIntroOnStart ?? true;
    // Both name pack-specific graph states; empty walk-in skips straight to the
    // fade, and the hub falls back to the pack's default (hub) state.
    this.walkInState = options.walkInState ?? '';
    this.hubStateName = options.hubStateName ?? stateMachine.defaultState ?? '';
    this.fadeDuration = options.fadeDuration ?? 2;
    this.softBoneStartDelay = options.softBoneStartDelay ?? 1;
    this.walkInTimeout = options.walkInTimeout ?? 8;
    this.debug = options.debug ?? true;
    this.onFadeProgress = options.onFadeProgress ?? null;
    this.onComplete = options.onComplete ?? null;
  }

  /** Kicks off the sequence. Call once, before the first update(dt). */
  start(): void {
    if (this.phase !== 'idle') return;

    if (!this.runIntroOnStart) {
      this.setAlpha(0);
      this.phase = 'done';
      this.onComplete?.();
      return;
    }

    if (this.debug) console.log('[IntroSequence] start (fade-up + walk-in)');

    // Freeze before the walk-in's first frame so the opening fling never
    // happens; released a short grace into the walk (see boneReleaseAt).
    this.springBones.setFrozen(true);
    this.bonesFrozen = true;

    // Hard cut into the walk-in (C# animator.Play(walkInState, 0, 0f)); the
    // view is fully covered so there is nothing to blend from. A pack with no
    // walk-in state stays on its default state and only fades up.
    if (this.walkInState) this.stateMachine.forcePlay(this.walkInState, 0);

    this.setAlpha(1);
    this.phase = 'settle';
  }

  /** Advances the sequence. Call once per frame after stateMachine.update(dt). */
  update(dt: number): void {
    if (this.phase === 'idle' || this.phase === 'done') return;
    this.clock += dt;

    switch (this.phase) {
      case 'settle':
        // Stay fully covered until the frame time settles, otherwise the
        // first fade step would eat a big chunk of the fade in one jump.
        if (dt > FRAME_SETTLE_THRESHOLD && this.settleFrames < MAX_SETTLE_FRAMES) {
          this.settleFrames++;
          return;
        }
        this.phase = 'fade';
        this.fadeT = 0;
        this.boneReleaseAt = this.clock + Math.max(0, this.softBoneStartDelay);
        return;

      case 'fade':
        this.releaseBonesIfDue();
        this.setAlpha(1 - clamp01(this.fadeT / Math.max(0.0001, this.fadeDuration)));
        this.fadeT += Math.min(dt, MAX_FADE_STEP);
        if (this.fadeT >= this.fadeDuration) {
          this.setAlpha(0);
          this.phase = 'walk';
          this.walkDeadline = this.clock + Math.max(0.1, this.walkInTimeout);
        }
        return;

      case 'walk': {
        this.releaseBonesIfDue();
        // forcePlay is synchronous, so no C#-style entry grace is needed: the
        // walk-in either is the current state or has already exited.
        const inWalkIn = this.stateMachine.currentState === this.walkInState;
        if (inWalkIn && this.clock < this.walkDeadline) return;
        if (inWalkIn) {
          if (this.debug) console.warn('[IntroSequence] walk-in timeout; forcing hub state');
          this.stateMachine.forcePlay(this.hubStateName, TIMEOUT_HUB_FADE_SECONDS);
        }
        this.finish();
      }
    }
  }

  private releaseBonesIfDue(): void {
    if (!this.bonesFrozen || this.clock < this.boneReleaseAt) return;
    this.springBones.setFrozen(false);
    this.bonesFrozen = false;
    if (this.debug) console.log('[IntroSequence] soft bones released');
  }

  private finish(): void {
    // Safety net: bones must be live by the time the intro ends, even when
    // softBoneStartDelay outlasted the walk-in.
    if (this.bonesFrozen) {
      this.springBones.setFrozen(false);
      this.bonesFrozen = false;
    }
    this.setAlpha(0);
    this.phase = 'done';
    if (this.debug) console.log('[IntroSequence] complete');
    this.onComplete?.();
  }

  private setAlpha(a: number): void {
    if (a === this.lastAlpha) return;
    this.lastAlpha = a;
    this.onFadeProgress?.(a);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
