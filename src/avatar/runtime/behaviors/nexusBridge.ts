/**
 * Port of Assets/Scripts/NexusBridge.cs: routes signals from the host (the
 * nexus desktop app / React side) to state-machine parameter writes via a
 * mappings table. All transition logic lives in the animator graph; this
 * module only writes parameter values, never invokes specific states.
 *
 * Also owns the idle fidget timer: while the avatar sits continuously in the
 * hub state, the Fidget trigger fires every fidgetMin..fidgetMax seconds
 * (uniform-random). Any matched signal, or leaving the hub state, rerolls the
 * timer so a fidget never stacks on top of a real reaction.
 *
 * "bridge:ping" is reserved as a liveness probe: it never touches the
 * animator, but always logs (when debug) and always acks (when emitAck).
 */

import type { ScriptFieldValue } from '../../pack/types';
import type { AvatarStateMachine } from '../anim/stateMachine';

/** How an incoming signal's numeric payload (n) applies to its parameter. */
export type ParamKind = 'Trigger' | 'BoolFromN' | 'BoolTrue' | 'BoolFalse' | 'FloatFromN' | 'IntFromN';

export interface Mapping {
  /** Signal key from the host side (see signals.ts in nexus). */
  signal: string;
  /** State-machine parameter to drive when this signal arrives. */
  parameter: string;
  kind: ParamKind;
}

export interface BridgeEvent {
  signal: string;
  n?: number;
}

/** Ack payload, shape-identical to the C# `Ack` struct sent to React. */
export interface BridgeAck {
  signal: string;
  n: number;
  matched: number;
  /** Comma-joined matched parameter names, or a "(...)" marker. */
  parameters: string;
  /** Unix epoch milliseconds. */
  ts: number;
}

export interface NexusBridgeOptions {
  debug?: boolean;
  emitAck?: boolean;
  onAck?: (ack: BridgeAck) => void;
  /** Trigger fired as the periodic idle fidget. Empty string disables. */
  fidgetTrigger?: string;
  /** Hub state name; the fidget timer only fires while in this state. */
  hubStateName?: string;
  fidgetMinSeconds?: number;
  fidgetMaxSeconds?: number;
  mappings?: Mapping[];
  /** Echoed as n=1 in the boot "bridge:hello" ack (C# DemoController.ShouldRunDemo). */
  demoMode?: boolean;
}

const PING_SIGNAL = 'bridge:ping';
/** Probe interval when the fidget timer elapses outside the hub state. */
const FIDGET_PROBE_SECONDS = 30;

/** Serialized-field defaults from NexusBridge.cs. */
export const DEFAULT_MAPPINGS: readonly Mapping[] = [
  // Media
  { signal: 'media:playing', parameter: 'Dance', kind: 'BoolFromN' },
  // Discord
  { signal: 'discord:mention', parameter: 'Wave', kind: 'Trigger' },
  { signal: 'discord:talking', parameter: 'Listening', kind: 'BoolTrue' },
  { signal: 'discord:silent', parameter: 'Listening', kind: 'BoolFalse' },
  // App focus / launch
  { signal: 'app:launch', parameter: 'Cheer', kind: 'Trigger' },
  { signal: 'app:shutdown', parameter: 'Goodbye', kind: 'Trigger' },
  // Y70 panel
  { signal: 'y70:open', parameter: 'Awake', kind: 'Trigger' },
  { signal: 'y70:close', parameter: 'Sleep', kind: 'Trigger' },
  // System / lighting
  { signal: 'system:energy', parameter: 'Energy', kind: 'FloatFromN' },
  { signal: 'lighting:mode', parameter: 'LightingMode', kind: 'IntFromN' },
  { signal: 'theme:applied', parameter: 'Celebrate', kind: 'Trigger' },
];

/**
 * Builds constructor options from an exported NexusBridge component's fields
 * (scripts.json), so a pack's inspector-tuned values override the C# defaults.
 */
export function bridgeOptionsFromFields(fields: Record<string, ScriptFieldValue>): NexusBridgeOptions {
  const opts: NexusBridgeOptions = {};
  if (typeof fields.debug === 'boolean') opts.debug = fields.debug;
  if (typeof fields.emitAck === 'boolean') opts.emitAck = fields.emitAck;
  if (typeof fields.fidgetTrigger === 'string') opts.fidgetTrigger = fields.fidgetTrigger;
  if (typeof fields.hubStateName === 'string') opts.hubStateName = fields.hubStateName;
  if (typeof fields.fidgetMinSeconds === 'number') opts.fidgetMinSeconds = fields.fidgetMinSeconds;
  if (typeof fields.fidgetMaxSeconds === 'number') opts.fidgetMaxSeconds = fields.fidgetMaxSeconds;
  // The exporter emits mappings as an object array, beyond the declared
  // ScriptFieldValue union; validate each row shape before accepting it.
  const rawMappings = (fields as Record<string, unknown>).mappings;
  if (Array.isArray(rawMappings)) {
    const mappings: Mapping[] = [];
    for (const raw of rawMappings) {
      const m = raw as Partial<Mapping>;
      if (typeof m.signal === 'string' && typeof m.parameter === 'string' && typeof m.kind === 'string') {
        mappings.push({ signal: m.signal, parameter: m.parameter, kind: m.kind });
      }
    }
    opts.mappings = mappings;
  }
  return opts;
}

export class NexusBridge {
  private readonly stateMachine: AvatarStateMachine;
  private readonly mappings: readonly Mapping[];
  private readonly debug: boolean;
  private readonly emitAck: boolean;
  private readonly onAck: ((ack: BridgeAck) => void) | null;
  private readonly fidgetTrigger: string;
  private readonly hubStateName: string;
  private readonly fidgetMinSeconds: number;
  private readonly fidgetMaxSeconds: number;
  private readonly unsubscribeStateChange: () => void;

  /** Monotonic bridge clock (seconds); the fidget deadline lives on it. */
  private now = 0;
  private nextFidgetTime = 0;

  constructor(stateMachine: AvatarStateMachine, options: NexusBridgeOptions = {}) {
    this.stateMachine = stateMachine;
    this.mappings = options.mappings ?? DEFAULT_MAPPINGS;
    this.debug = options.debug ?? true;
    this.emitAck = options.emitAck ?? true;
    this.onAck = options.onAck ?? null;
    this.fidgetTrigger = options.fidgetTrigger ?? 'Fidget';
    this.hubStateName = options.hubStateName ?? stateMachine.defaultState ?? '';
    this.fidgetMinSeconds = options.fidgetMinSeconds ?? 90;
    this.fidgetMaxSeconds = options.fidgetMaxSeconds ?? 120;

    this.resetFidgetTimer();

    // Any reaction (bridge-driven or not, e.g. intro forcePlay) that leaves
    // the hub rerolls the timer so the fidget cadence restarts from a fresh
    // interval once the avatar settles back home.
    this.unsubscribeStateChange = stateMachine.onStateChange((state) => {
      if (state !== this.hubStateName) this.resetFidgetTimer();
    });

    if (this.debug) {
      console.log(`[NexusBridge] ready (mappings=${this.mappings.length})`);
    }

    // Boot hello, mirroring C# Awake: tells the host the bridge is alive; n
    // doubles as the demo-mode flag the React side keys its scripted demo on.
    if (this.emitAck) {
      const demo = options.demoMode === true;
      this.sendAck(ackOf('bridge:hello', demo ? 1 : 0, 0, demo ? '(boot,demo)' : '(boot)'));
    }
  }

  /** Advances the idle-fidget timer. Call once per frame. */
  update(dt: number): void {
    this.now += dt;
    if (this.fidgetTrigger.length === 0) return;
    if (this.now < this.nextFidgetTime) return;

    // Only fidget while genuinely in the hub; otherwise postpone with a short
    // probe interval instead of wasting the rolled interval.
    if (this.stateMachine.currentState !== this.hubStateName) {
      this.nextFidgetTime = this.now + FIDGET_PROBE_SECONDS;
      return;
    }

    this.stateMachine.trigger(this.fidgetTrigger);
    if (this.debug) console.log(`[NexusBridge] fidget triggered (${this.fidgetTrigger})`);
    this.resetFidgetTimer();
  }

  /** Entry point for host signals; the JSON payload is {signal, n?}. */
  handleEvent(event: BridgeEvent): void {
    const signal = event.signal;
    if (typeof signal !== 'string' || signal.length === 0) return;
    const n = event.n ?? 0;

    // bridge:ping is reserved - never touches the animator, just acks.
    if (signal === PING_SIGNAL) {
      if (this.debug) console.log(`[NexusBridge] ping received (n=${n})`);
      if (this.emitAck) this.sendAck(ackOf(signal, n, 0, '(ping)'));
      return;
    }

    let matched = 0;
    let parameters = '';
    for (const m of this.mappings) {
      if (m.signal !== signal || m.parameter.length === 0) continue;
      this.apply(m, n);
      if (parameters.length > 0) parameters += ',';
      parameters += m.parameter;
      matched++;
    }

    // A matched reaction resets the fidget timer so a fidget never stacks on
    // top of a real animation. (Continuous streams like Energy/LightingMode
    // still count here; the state-change reroll dominates in practice.)
    if (matched > 0) this.resetFidgetTimer();

    if (this.debug) console.log(`[NexusBridge] ${signal} n=${n} -> ${matched} mapping(s): ${parameters}`);
    if (this.emitAck) this.sendAck(ackOf(signal, n, matched, parameters));
  }

  dispose(): void {
    this.unsubscribeStateChange();
  }

  private apply(m: Mapping, n: number): void {
    switch (m.kind) {
      case 'Trigger':
        this.stateMachine.trigger(m.parameter);
        break;
      case 'BoolFromN':
        this.stateMachine.setBool(m.parameter, n > 0);
        break;
      case 'BoolTrue':
        this.stateMachine.setBool(m.parameter, true);
        break;
      case 'BoolFalse':
        this.stateMachine.setBool(m.parameter, false);
        break;
      case 'FloatFromN':
        this.stateMachine.setFloat(m.parameter, n);
        break;
      case 'IntFromN':
        this.stateMachine.setInt(m.parameter, Math.round(n));
        break;
    }
  }

  private resetFidgetTimer(): void {
    const min = Math.max(0, this.fidgetMinSeconds);
    const max = Math.max(min, this.fidgetMaxSeconds);
    this.nextFidgetTime = this.now + min + Math.random() * (max - min);
  }

  private sendAck(ack: BridgeAck): void {
    this.onAck?.(ack);
  }
}

function ackOf(signal: string, n: number, matched: number, parameters: string): BridgeAck {
  return { signal, n, matched, parameters, ts: Date.now() };
}
