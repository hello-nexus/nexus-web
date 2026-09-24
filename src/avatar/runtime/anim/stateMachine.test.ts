import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AvatarStateMachine } from './stateMachine';

function machine(): AvatarStateMachine {
  const root = new THREE.Object3D();
  const track = new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1]);
  const clip = new THREE.AnimationClip('Wave', 1, [track]);
  const states = { formatVersion: 1 as const, parameters: [], layers: [{ name: 'Base', defaultState: 'Wave', states: [{ name: 'Wave', clip: 'Wave', speed: 1, loop: false, transitions: [] }] }] };
  return new AvatarStateMachine(states, new THREE.AnimationMixer(root), [clip]);
}

describe('AvatarStateMachine action generation', () => {
  it('bumps on a restart of the action already playing, so clip events restart instead of wrapping', () => {
    const sm = machine();
    const first = sm.actionGeneration;
    const action = sm.activeAction;
    sm.playClip('Wave');
    expect(sm.activeAction).toBe(action);
    expect(sm.actionGeneration).toBe(first + 1);
  });
});
