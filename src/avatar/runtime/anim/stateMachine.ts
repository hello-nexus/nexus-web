/**
 * Animator-graph player over states.json with Unity Animator semantics for a
 * single layer (the first).
 *
 * - Parameters: bool/int/float values plus latching triggers. A trigger stays
 *   set until a taken transition references it in a condition, then it is
 *   consumed (Unity semantics).
 * - update(dt) advances normalized time and evaluates the current state's
 *   transitions in order, then anyState transitions (anyState re-entry into
 *   the current state is suppressed). All conditions must pass; hasExitTime
 *   additionally requires the exit-time mark: for exitTime < 1 the fractional
 *   normalized time must cross the mark this frame (so it can fire once per
 *   loop of a looping state), for exitTime >= 1 the absolute normalized time
 *   must have reached it.
 * - Parameter setters also run one evaluation pass immediately, so hosts that
 *   never call update(dt) (the current harness) keep the v0 react-on-set
 *   behavior; with conditions unchanged this matches Unity's
 *   evaluate-on-next-update.
 * - Transition duration is seconds (the exporter emits fixed durations) and
 *   drives a mixer cross-fade; the destination action restarts at t = 0.
 * - Non-looping states clamp on their last frame (LoopOnce +
 *   clampWhenFinished); looping states use LoopRepeat.
 *
 * Not modeled from Unity: transition interruption sources, exit-time
 * transition offset, blend trees, layers beyond the first, and anyState
 * priority over the current state's own transitions.
 */

import * as THREE from 'three';
import type { AnimState, StatesFile, StateTransition, TransitionCondition } from '../../pack/types';

export type StateChangeListener = (state: string, previous: string | null) => void;

export class AvatarStateMachine {
  private readonly mixer: THREE.AnimationMixer;
  private readonly clipByName = new Map<string, THREE.AnimationClip>();
  private readonly stateByName = new Map<string, AnimState>();
  private readonly anyStateTransitions: StateTransition[] = [];
  /** bool (0/1), float, and int parameter values by name. */
  private readonly values = new Map<string, number>();
  /** Trigger parameters currently latched. */
  private readonly latchedTriggers = new Set<string>();
  private readonly stateChangeListeners: StateChangeListener[] = [];

  private currentStateDef: AnimState | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private generation = 0;
  private currentClipDuration = 0;
  private currentSpeed = 1;
  /** Unscaled seconds spent in the current state (or debug clip). */
  private stateSeconds = 0;
  /** Normalized time at the start of the current update, for exit-time crossing. */
  private prevNormalized = 0;
  /** First-layer default (hub) state name from states.json; null with no graph. */
  private defaultStateName: string | null = null;

  constructor(states: StatesFile | null, mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) {
    this.mixer = mixer;
    for (const c of clips) this.clipByName.set(c.name, c);

    // Drives the first layer only.
    const layer = states?.layers[0];
    if (layer) {
      for (const p of states?.parameters ?? []) {
        if (p.type === 'trigger') continue;
        const def = p.default;
        this.values.set(p.name, typeof def === 'number' ? def : def === true ? 1 : 0);
      }
      for (const s of layer.states) this.stateByName.set(s.name, s);
      this.anyStateTransitions = layer.anyStateTransitions;
      this.defaultStateName = layer.defaultState;
      const def = this.stateByName.get(layer.defaultState);
      if (def) {
        this.playState(def, 0);
        return;
      }
      console.warn(`[stateMachine] default state "${layer.defaultState}" not found in layer "${layer.name}"`);
    }
    // No usable graph: fall back to the first GLB clip, looped.
    const first = clips[0];
    if (first) this.playClip(first.name, true, 0);
  }

  get current(): string | null {
    return this.currentStateDef?.name ?? this.currentAction?.getClip().name ?? null;
  }

  /** The action the machine is playing or fading into (clip-event timing reads it). */
  get activeAction(): THREE.AnimationAction | null {
    return this.currentAction;
  }

  /**
   * Bumps on every (re)start of an action, including a restart of the one
   * already playing, which mixer.clipAction reuses and reset() rewinds.
   */
  get actionGeneration(): number {
    return this.generation;
  }

  /** Graph state name, or null when a debug clip plays outside the graph. */
  get currentState(): string | null {
    return this.currentStateDef?.name ?? null;
  }

  /** First-layer default (hub) state name; the pack-supplied idle-hub target. */
  get defaultState(): string | null {
    return this.defaultStateName;
  }

  /**
   * Unity-style normalized time of the current state: integer part is the
   * completed loop count, fractional part the position within the clip. Keeps
   * growing past 1 for non-looping (clamped) states, as in Unity.
   */
  get normalizedTime(): number {
    return this.currentClipDuration > 0 ? (this.stateSeconds * this.currentSpeed) / this.currentClipDuration : 0;
  }

  /** Registers a state-entry listener; returns its unsubscribe. */
  onStateChange(listener: StateChangeListener): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      const i = this.stateChangeListeners.indexOf(listener);
      if (i >= 0) this.stateChangeListeners.splice(i, 1);
    };
  }

  /** Advances state time and evaluates transitions. Call after mixer.update(dt). */
  update(dt: number): void {
    this.prevNormalized = this.normalizedTime;
    this.stateSeconds += dt;
    this.evaluate();
  }

  setBool(name: string, v: boolean): void {
    this.values.set(name, v ? 1 : 0);
    this.evaluate();
  }

  setFloat(name: string, v: number): void {
    this.values.set(name, v);
    this.evaluate();
  }

  setInt(name: string, v: number): void {
    this.values.set(name, Math.round(v));
    this.evaluate();
  }

  /** Latches a trigger; it resets when a taken transition consumes it. */
  trigger(name: string): void {
    this.latchedTriggers.add(name);
    this.evaluate();
  }

  /**
   * Cross-fades to a graph state, ignoring its entry conditions (Unity
   * Animator.CrossFadeInFixedTime). Latched triggers are not consumed.
   */
  forcePlay(stateName: string, fadeSeconds: number): void {
    const state = this.stateByName.get(stateName);
    if (!state) {
      console.warn(`[stateMachine] forcePlay: state "${stateName}" not found`);
      return;
    }
    this.playState(state, fadeSeconds);
  }

  /** Directly plays a GLB clip by name (harness/debug path, bypasses the graph). */
  playClip(clipName: string, loop = true, fadeSeconds = 0.25): void {
    const clip = this.clipByName.get(clipName);
    if (!clip) {
      console.warn(`[stateMachine] clip "${clipName}" not found`);
      return;
    }
    this.currentStateDef = null;
    this.currentClipDuration = clip.duration;
    this.currentSpeed = 1;
    this.stateSeconds = 0;
    this.prevNormalized = 0;
    this.startAction(clip, loop, 1, fadeSeconds);
  }

  private evaluate(): void {
    // The state's own transitions win over anyState ones (the reference graph
    // is insensitive to this order; Unity checks anyState first by default).
    if (this.currentStateDef && this.tryTransitions(this.currentStateDef.transitions, false)) return;
    this.tryTransitions(this.anyStateTransitions, true);
  }

  private tryTransitions(list: StateTransition[], fromAnyState: boolean): boolean {
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      // No anyState self re-entry (Unity's canTransitionToSelf off): a held
      // bool like Dance must not restart AnimDance every frame.
      if (fromAnyState && t.to === this.currentStateDef?.name) continue;
      if (t.hasExitTime && !this.exitTimeReached(t.exitTime)) continue;
      if (!this.conditionsPass(t.conditions)) continue;
      const target = this.stateByName.get(t.to);
      if (!target) {
        console.warn(`[stateMachine] transition target "${t.to}" not found`);
        continue;
      }
      this.consumeTriggers(t.conditions);
      this.playState(target, t.duration);
      return true;
    }
    return false;
  }

  private exitTimeReached(exitTime: number): boolean {
    const nt = this.normalizedTime;
    if (exitTime >= 1) return nt >= exitTime;
    // Once per loop: true when the fractional time crossed the mark (i.e. some
    // k + exitTime lies in (prev, nt]).
    return Math.floor(nt - exitTime) > Math.floor(this.prevNormalized - exitTime);
  }

  private conditionsPass(conditions: TransitionCondition[]): boolean {
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      const value = this.values.get(c.param) ?? 0;
      const truthy = value !== 0 || this.latchedTriggers.has(c.param);
      switch (c.mode) {
        case 'if':
          if (!truthy) return false;
          break;
        case 'ifnot':
          if (truthy) return false;
          break;
        case 'greater':
          if (!(value > c.threshold)) return false;
          break;
        case 'less':
          if (!(value < c.threshold)) return false;
          break;
        case 'equals':
          if (value !== c.threshold) return false;
          break;
        case 'notequal':
          if (value === c.threshold) return false;
          break;
      }
    }
    return true;
  }

  private consumeTriggers(conditions: TransitionCondition[]): void {
    for (let i = 0; i < conditions.length; i++) this.latchedTriggers.delete(conditions[i].param);
  }

  private playState(state: AnimState, fadeSeconds: number): void {
    const clip = this.clipByName.get(state.clip);
    if (!clip) {
      console.warn(`[stateMachine] state "${state.name}" references missing clip "${state.clip}"`);
      return;
    }
    const previous = this.currentStateDef?.name ?? null;
    this.currentStateDef = state;
    this.currentClipDuration = clip.duration;
    this.currentSpeed = state.speed;
    this.stateSeconds = 0;
    this.prevNormalized = 0;
    this.startAction(clip, state.loop, state.speed, fadeSeconds);
    if (state.name !== previous) this.notifyStateChange(state.name, previous);
  }

  private startAction(clip: THREE.AnimationClip, loop: boolean, speed: number, fadeSeconds: number): void {
    const previous = this.currentAction;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = speed;
    if (previous && previous !== action && fadeSeconds > 0) {
      action.play();
      previous.crossFadeTo(action, fadeSeconds, false);
    } else {
      previous?.stop();
      action.play();
    }
    this.currentAction = action;
    this.generation++;
  }

  private notifyStateChange(state: string, previous: string | null): void {
    for (let i = 0; i < this.stateChangeListeners.length; i++) this.stateChangeListeners[i](state, previous);
  }
}
