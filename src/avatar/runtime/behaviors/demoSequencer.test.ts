import { describe, expect, it } from 'vitest';
import { DemoSequencer } from './demoSequencer';
import type { AvatarStateMachine } from '../anim/stateMachine';

describe('DemoSequencer and other states', () => {
  it('fires steps only from the hub and never forces home from a state it did not start', () => {
    const graph = {
      currentState: 'Hub' as string | null,
      defaultState: 'Hub',
      normalizedTime: 0,
      fired: [] as string[],
      forced: [] as string[],
      trigger(name: string) { this.fired.push(name); },
      setBool() {},
      forcePlay(name: string) { this.forced.push(name); this.currentState = name; },
    };
    const seq = new DemoSequencer(graph as unknown as AvatarStateMachine, {
      runSelfDrivenSequence: true, startDelay: 0, betweenGap: 0, loopGap: 0, debug: false,
      sequence: [{ label: 'A', parameter: 'TriggerA', kind: 'Trigger', targetState: 'StateA', loops: 1 }],
    });
    seq.start();

    graph.currentState = 'Activity';
    for (let i = 0; i < 20; i++) seq.update(0.1);
    expect(graph.fired).toEqual([]);

    graph.currentState = 'Hub';
    seq.update(0.1);
    expect(graph.fired).toEqual(['TriggerA']);

    graph.currentState = 'Activity';
    for (let i = 0; i < 100; i++) seq.update(0.1);
    expect(graph.forced).toEqual([]);
    expect(graph.currentState).toBe('Activity');
  });
});
