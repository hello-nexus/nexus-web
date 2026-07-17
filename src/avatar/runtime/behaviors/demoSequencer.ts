/**
 * Port of Assets/Scripts/DemoAnimationSequencer.cs: standalone (no-host) demo
 * driver. Walks the avatar through every wired reaction in turn by writing
 * the same state-machine parameters NexusBridge would.
 *
 * Timing is driven by clip completion, not fixed seconds: each step fires its
 * trigger / bool, waits for the graph to enter the target state, then waits
 * for `loops` full clip plays (or the state auto-exiting), blends back to the
 * idle hub over returnToIdleBlend, and settles before the next step.
 *
 * The showcase order is character-specific, so it is supplied by the pack's
 * DemoAnimationSequencer component (scripts.json); with no such component the
 * sequence is empty and the sequencer is a no-op.
 */

import type { ScriptFieldValue } from '../../pack/types';
import type { AvatarStateMachine } from '../anim/stateMachine';

export type StepKind = 'Trigger' | 'Bool';

export interface SequenceStep {
  /** Human-readable label for logs. */
  label: string;
  /** State-machine parameter to drive. */
  parameter: string;
  kind: StepKind;
  /** State expected on entry; used to detect completion. */
  targetState: string;
  /** Full clip plays to wait for before advancing (bools stay engaged). */
  loops: number;
}

export interface DemoSequencerOptions {
  /** Master switch (C# default off, so a host-driven demo is unaffected). */
  runSelfDrivenSequence?: boolean;
  /** Seconds to idle before the first reaction (lets the camera tour settle). */
  startDelay?: number;
  /** Pause settled in the idle hub between reactions. */
  betweenGap?: number;
  /** Loop the sequence forever; off plays once. */
  loop?: boolean;
  /** Extra pause between full loops. */
  loopGap?: number;
  /** Hard ceiling on a single step, in case a state never auto-exits. */
  perStepTimeout?: number;
  /** Idle hub state every reaction blends back to. */
  idleHubState?: string;
  /** Seconds to cross-fade back to the hub; 0 leaves it to the graph's exit. */
  returnToIdleBlend?: number;
  /** Ceiling on waiting for the return blend to settle. */
  settleTimeout?: number;
  debug?: boolean;
  sequence?: SequenceStep[];
}

/**
 * No built-in steps: the showcase order names pack-specific states/parameters,
 * so it comes from the DemoAnimationSequencer component fields
 * (sequencerOptionsFromFields). Empty here keeps the runtime character-agnostic.
 */
export const DEFAULT_SEQUENCE: readonly SequenceStep[] = [];

/**
 * Builds constructor options from an exported DemoAnimationSequencer
 * component's fields (scripts.json).
 */
export function sequencerOptionsFromFields(fields: Record<string, ScriptFieldValue>): DemoSequencerOptions {
  const opts: DemoSequencerOptions = {};
  if (typeof fields.runSelfDrivenSequence === 'boolean') opts.runSelfDrivenSequence = fields.runSelfDrivenSequence;
  if (typeof fields.startDelay === 'number') opts.startDelay = fields.startDelay;
  if (typeof fields.betweenGap === 'number') opts.betweenGap = fields.betweenGap;
  if (typeof fields.loop === 'boolean') opts.loop = fields.loop;
  if (typeof fields.loopGap === 'number') opts.loopGap = fields.loopGap;
  if (typeof fields.perStepTimeout === 'number') opts.perStepTimeout = fields.perStepTimeout;
  if (typeof fields.idleHubState === 'string') opts.idleHubState = fields.idleHubState;
  if (typeof fields.returnToIdleBlend === 'number') opts.returnToIdleBlend = fields.returnToIdleBlend;
  if (typeof fields.settleTimeout === 'number') opts.settleTimeout = fields.settleTimeout;
  if (typeof fields.debug === 'boolean') opts.debug = fields.debug;
  // The exporter emits the sequence as an object array, beyond the declared
  // ScriptFieldValue union; validate each row shape before accepting it.
  const raw = (fields as Record<string, unknown>).sequence;
  if (Array.isArray(raw)) {
    const sequence: SequenceStep[] = [];
    for (const row of raw) {
      const s = row as Partial<SequenceStep>;
      if (typeof s.parameter === 'string' && typeof s.targetState === 'string' && typeof s.kind === 'string') {
        sequence.push({
          label: typeof s.label === 'string' ? s.label : s.parameter,
          parameter: s.parameter,
          kind: s.kind,
          targetState: s.targetState,
          loops: typeof s.loops === 'number' ? s.loops : 1,
        });
      }
    }
    opts.sequence = sequence;
  }
  return opts;
}

type Phase = 'idle' | 'initialDelay' | 'enter' | 'play' | 'blend' | 'settle' | 'gap' | 'loopGap' | 'done';

export class DemoSequencer {
  private readonly stateMachine: AvatarStateMachine;
  private readonly runSelfDrivenSequence: boolean;
  private readonly startDelay: number;
  private readonly betweenGap: number;
  private readonly loop: boolean;
  private readonly loopGap: number;
  private readonly perStepTimeout: number;
  private readonly idleHubState: string;
  private readonly returnToIdleBlend: number;
  private readonly settleTimeout: number;
  private readonly debug: boolean;
  private readonly sequence: readonly SequenceStep[];

  private phase: Phase = 'idle';
  private clock = 0;
  /** Clock value the current phase ends (or times out) at. */
  private phaseUntil = 0;
  private stepIndex = 0;
  private stepStart = 0;

  constructor(stateMachine: AvatarStateMachine, options: DemoSequencerOptions = {}) {
    this.stateMachine = stateMachine;
    this.runSelfDrivenSequence = options.runSelfDrivenSequence ?? false;
    this.startDelay = options.startDelay ?? 4;
    this.betweenGap = options.betweenGap ?? 1.5;
    this.loop = options.loop ?? true;
    this.loopGap = options.loopGap ?? 4;
    this.perStepTimeout = options.perStepTimeout ?? 25;
    this.idleHubState = options.idleHubState ?? stateMachine.defaultState ?? '';
    this.returnToIdleBlend = options.returnToIdleBlend ?? 0.5;
    this.settleTimeout = options.settleTimeout ?? 4;
    this.debug = options.debug ?? true;
    this.sequence = options.sequence ?? DEFAULT_SEQUENCE;
  }

  /** Begins the sequence (no-op when runSelfDrivenSequence is off). */
  start(): void {
    if (this.phase !== 'idle' && this.phase !== 'done') return;
    if (!this.runSelfDrivenSequence) return;
    if (this.debug) console.log(`[DemoSequencer] starting (${this.sequence.length} steps, loop=${this.loop})`);
    this.stepIndex = 0;
    this.phase = 'initialDelay';
    this.phaseUntil = this.clock + this.startDelay;
  }

  stop(): void {
    this.phase = 'done';
  }

  /** Advances the sequence. Call once per frame after stateMachine.update(dt). */
  update(dt: number): void {
    this.clock += dt;
    switch (this.phase) {
      case 'idle':
      case 'done':
        return;

      case 'initialDelay':
      case 'gap':
      case 'loopGap':
        if (this.clock >= this.phaseUntil) this.fireStep();
        return;

      case 'enter': {
        const step = this.sequence[this.stepIndex];
        if (this.stateMachine.currentState === step.targetState) {
          this.phase = 'play';
          this.phaseUntil = this.stepStart + this.perStepTimeout;
          return;
        }
        if (this.clock >= this.phaseUntil) {
          if (this.debug) {
            console.warn(`[DemoSequencer] state '${step.targetState}' not entered for '${step.label}'; proceeding anyway`);
          }
          this.phase = 'play';
          this.phaseUntil = this.stepStart + this.perStepTimeout;
        }
        return;
      }

      case 'play': {
        const step = this.sequence[this.stepIndex];
        const inTarget = this.stateMachine.currentState === step.targetState;
        const playedEnough = inTarget && this.stateMachine.normalizedTime >= Math.max(1, step.loops);
        if (inTarget && !playedEnough && this.clock < this.phaseUntil) return;
        this.beginReturnToIdle(step);
        return;
      }

      case 'blend':
        if (this.clock < this.phaseUntil) return;
        this.phase = 'settle';
        this.phaseUntil = this.clock + this.settleTimeout;
        return;

      case 'settle': {
        const home = this.stateMachine.currentState === this.idleHubState;
        if (!home && this.clock < this.phaseUntil) return;
        this.finishStep();
      }
    }
  }

  private fireStep(): void {
    // Skip malformed rows, as the C# does.
    while (this.stepIndex < this.sequence.length) {
      const step = this.sequence[this.stepIndex];
      if (step.parameter.length > 0 && step.targetState.length > 0) break;
      this.stepIndex++;
    }
    if (this.stepIndex >= this.sequence.length) {
      this.wrapOrFinish();
      return;
    }

    const step = this.sequence[this.stepIndex];
    this.stepStart = this.clock;
    if (this.debug) {
      console.log(
        `[DemoSequencer] -> ${step.label} (${step.parameter} -> ${step.targetState}, loops=${Math.max(1, step.loops)})`,
      );
    }

    // Fire the parameter the same way NexusBridge does.
    if (step.kind === 'Trigger') this.stateMachine.trigger(step.parameter);
    else this.stateMachine.setBool(step.parameter, true);

    this.phase = 'enter';
    this.phaseUntil = this.clock + Math.min(this.perStepTimeout, 4);
  }

  private beginReturnToIdle(step: SequenceStep): void {
    // Bool reactions don't auto-exit - turn the bool off so the graph can
    // transition back to the hub.
    if (step.kind === 'Bool') this.stateMachine.setBool(step.parameter, false);

    // Blend cleanly back to the hub over a controlled duration rather than
    // relying on the reaction's own short exit transition.
    if (this.returnToIdleBlend > 0 && this.idleHubState.length > 0) {
      if (this.stateMachine.currentState !== this.idleHubState) {
        this.stateMachine.forcePlay(this.idleHubState, this.returnToIdleBlend);
      }
      this.phase = 'blend';
      this.phaseUntil = this.clock + this.returnToIdleBlend;
      return;
    }

    this.phase = 'settle';
    this.phaseUntil = this.clock + this.settleTimeout;
  }

  private finishStep(): void {
    const step = this.sequence[this.stepIndex];
    if (this.debug) console.log(`[DemoSequencer]    ${step.label} done in ${(this.clock - this.stepStart).toFixed(2)}s`);
    this.stepIndex++;
    if (this.stepIndex >= this.sequence.length) {
      this.wrapOrFinish();
      return;
    }
    this.phase = 'gap';
    this.phaseUntil = this.clock + Math.max(0, this.betweenGap);
  }

  private wrapOrFinish(): void {
    if (this.loop) {
      this.stepIndex = 0;
      this.phase = 'loopGap';
      this.phaseUntil = this.clock + Math.max(0, this.loopGap);
      return;
    }
    this.phase = 'done';
    if (this.debug) console.log('[DemoSequencer] sequence complete.');
  }
}
