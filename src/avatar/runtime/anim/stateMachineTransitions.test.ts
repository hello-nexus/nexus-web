import { describe, expect, it } from 'vitest';
import { AnimationClip, AnimationMixer, NumberKeyframeTrack, Object3D } from 'three';
import { AvatarStateMachine } from './stateMachine';
import type { StatesFile } from '../../pack/types';

const clip = (name: string, x = 0) => new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [x, x])]);
const after = (to: string, chance?: number) => ({ to, hasExitTime: true, exitTime: 1, duration: 0, conditions: [], ...(chance === undefined ? {} : { chance }) });
const graph = (states: unknown[], defaultState: string, parameters: unknown[] = []) => ({
  formatVersion: 1, parameters, layers: [{ name: 'Base', defaultState, anyStateTransitions: [], states }],
}) as unknown as StatesFile;

describe('AvatarStateMachine transition chance', () => {
  const states = graph([
    { name: 'Start', clip: 'Start', speed: 1, loop: false, transitions: [after('A', 0.5), after('B')] },
    { name: 'A', clip: 'A', speed: 1, loop: false, transitions: [] },
    { name: 'B', clip: 'B', speed: 1, loop: false, transitions: [] },
  ], 'Start');
  const run = (roll: number) => {
    const sm = new AvatarStateMachine(states, new AnimationMixer(new Object3D()), ['Start', 'A', 'B'].map((n) => clip(n)));
    let rolls = 0;
    sm.random = () => { rolls++; return roll; };
    for (let i = 0; i < 30; i++) sm.update(0.05);
    return { state: sm.currentState, rolls };
  };

  it('takes the transition on a roll under the chance, rolling once', () => {
    expect(run(0.2)).toEqual({ state: 'A', rolls: 1 });
  });

  it('falls through to the next transition on a miss', () => {
    expect(run(0.8)).toEqual({ state: 'B', rolls: 1 });
  });
});

describe('AvatarStateMachine zero-length transition', () => {
  it('shows the new clip on the cut frame, never the rest pose', () => {
    const root = new Object3D();
    const mixer = new AnimationMixer(root);
    const sm = new AvatarStateMachine(graph([
      { name: 'From', clip: 'From', speed: 1, loop: false, transitions: [after('To')] },
      { name: 'To', clip: 'To', speed: 1, loop: false, transitions: [] },
    ], 'From'), mixer, [clip('From', 5), clip('To', 7)]);
    for (let i = 0; i < 30 && sm.currentState === 'From'; i++) {
      mixer.update(0.05);
      sm.update(0.05);
    }
    expect(sm.currentState).toBe('To');
    expect(root.position.x).toBe(7);
  });
});

describe('AvatarStateMachine trigger expires', () => {
  const reachHub = (expires: number | undefined, firedAfter: number) => {
    const sm = new AvatarStateMachine(graph([
      { name: 'Busy', clip: 'Busy', speed: 1, loop: false, transitions: [after('Hub')] },
      { name: 'Hub', clip: 'Hub', speed: 1, loop: true, transitions: [{ to: 'Go', hasExitTime: false, exitTime: 0, duration: 0, conditions: [{ param: 'Go', mode: 'if', threshold: 0 }] }] },
      { name: 'Go', clip: 'Go', speed: 1, loop: false, transitions: [] },
    ], 'Busy', [{ name: 'Go', type: 'trigger', ...(expires === undefined ? {} : { expires }) }]),
    new AnimationMixer(new Object3D()), ['Busy', 'Hub', 'Go'].map((n) => clip(n)));
    for (let t = 0; t < firedAfter; t += 0.05) sm.update(0.05);
    sm.trigger('Go');
    for (let i = 0; i < 40; i++) sm.update(0.05);
    return sm.currentState;
  };

  it('drops a trigger no transition took within its window', () => {
    expect(reachHub(0.5, 0)).toBe('Hub');
  });

  it('keeps it while the window is open, and forever without expires', () => {
    expect(reachHub(2, 0)).toBe('Go');
    expect(reachHub(undefined, 0)).toBe('Go');
  });

  it('is taken at once when fired where a transition wants it', () => {
    expect(reachHub(0.5, 1.2)).toBe('Go');
  });
});
