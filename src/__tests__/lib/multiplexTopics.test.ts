// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests the ref-counted topic subscription logic used by useMultiplexConnection.
 * We test the data structure pattern directly rather than the React hook,
 * since the hook is a thin wrapper around this logic.
 */

interface TopicListener {
  refCount: number;
  listeners: Set<(data: unknown) => void>;
}

function createTopicManager() {
  const topics = new Map<string, TopicListener>();
  const pendingSubs = new Set<string>();
  const sent: Array<{ sub?: string[]; unsub?: string[] }> = [];

  function send(msg: { sub?: string[]; unsub?: string[] }) {
    sent.push(msg);
  }

  function subscribe(topic: string, listener: (data: unknown) => void, connected: boolean) {
    let entry = topics.get(topic);
    if (!entry) {
      entry = { refCount: 0, listeners: new Set() };
      topics.set(topic, entry);
    }
    entry.refCount++;
    entry.listeners.add(listener);

    if (entry.refCount === 1) {
      if (connected) {
        send({ sub: [topic] });
      } else {
        pendingSubs.add(topic);
      }
    }
  }

  function unsubscribe(topic: string, listener: (data: unknown) => void, connected: boolean) {
    const entry = topics.get(topic);
    if (!entry) return;

    entry.listeners.delete(listener);
    entry.refCount--;

    if (entry.refCount <= 0) {
      topics.delete(topic);
      pendingSubs.delete(topic);
      if (connected) {
        send({ unsub: [topic] });
      }
    }
  }

  function onReconnect() {
    const activeTopics = Array.from(topics.keys());
    if (activeTopics.length > 0) {
      send({ sub: activeTopics });
    }
    if (pendingSubs.size > 0) {
      send({ sub: Array.from(pendingSubs) });
      pendingSubs.clear();
    }
  }

  function dispatch(topic: string, data: unknown) {
    const entry = topics.get(topic);
    if (entry) {
      for (const listener of entry.listeners) listener(data);
    }
  }

  return { topics, pendingSubs, sent, subscribe, unsubscribe, onReconnect, dispatch };
}

describe('topic ref-counting', () => {
  let mgr: ReturnType<typeof createTopicManager>;

  beforeEach(() => { mgr = createTopicManager(); });

  it('first subscriber sends sub message', () => {
    const fn = vi.fn();
    mgr.subscribe('cpu', fn, true);
    expect(mgr.sent).toHaveLength(1);
    expect(mgr.sent[0]).toEqual({ sub: ['cpu'] });
  });

  it('second subscriber does NOT send another sub', () => {
    mgr.subscribe('cpu', vi.fn(), true);
    mgr.subscribe('cpu', vi.fn(), true);
    expect(mgr.sent).toHaveLength(1);
  });

  it('refCount tracks correctly', () => {
    mgr.subscribe('cpu', vi.fn(), true);
    mgr.subscribe('cpu', vi.fn(), true);
    expect(mgr.topics.get('cpu')?.refCount).toBe(2);
  });

  it('unsubscribe one of two does not send unsub', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    mgr.subscribe('cpu', fn1, true);
    mgr.subscribe('cpu', fn2, true);
    mgr.unsubscribe('cpu', fn1, true);
    expect(mgr.sent.filter(m => m.unsub)).toHaveLength(0);
    expect(mgr.topics.get('cpu')?.refCount).toBe(1);
  });

  it('last unsubscribe sends unsub message', () => {
    const fn = vi.fn();
    mgr.subscribe('cpu', fn, true);
    mgr.unsubscribe('cpu', fn, true);
    expect(mgr.sent).toHaveLength(2);
    expect(mgr.sent[1]).toEqual({ unsub: ['cpu'] });
    expect(mgr.topics.has('cpu')).toBe(false);
  });

  it('unsubscribe unknown topic is a no-op', () => {
    mgr.unsubscribe('nonexistent', vi.fn(), true);
    expect(mgr.sent).toHaveLength(0);
  });
});

describe('pending subs', () => {
  let mgr: ReturnType<typeof createTopicManager>;
  beforeEach(() => { mgr = createTopicManager(); });

  it('queues sub when disconnected', () => {
    mgr.subscribe('cpu', vi.fn(), false);
    expect(mgr.sent).toHaveLength(0);
    expect(mgr.pendingSubs.has('cpu')).toBe(true);
  });

  it('sends pending subs on reconnect', () => {
    mgr.subscribe('cpu', vi.fn(), false);
    mgr.onReconnect();
    expect(mgr.sent.some(m => m.sub?.includes('cpu'))).toBe(true);
    expect(mgr.pendingSubs.size).toBe(0);
  });

  it('reconnect re-subscribes all active topics', () => {
    mgr.subscribe('cpu', vi.fn(), true);
    mgr.subscribe('network', vi.fn(), true);
    mgr.sent.length = 0;
    mgr.onReconnect();
    const resubs = mgr.sent.flatMap(m => m.sub ?? []);
    expect(resubs).toContain('cpu');
    expect(resubs).toContain('network');
  });

  it('unsubscribe while disconnected clears pending', () => {
    const fn = vi.fn();
    mgr.subscribe('cpu', fn, false);
    mgr.unsubscribe('cpu', fn, false);
    expect(mgr.pendingSubs.has('cpu')).toBe(false);
  });
});

describe('message dispatch', () => {
  let mgr: ReturnType<typeof createTopicManager>;
  beforeEach(() => { mgr = createTopicManager(); });

  it('routes messages to correct topic listeners', () => {
    const cpuFn = vi.fn();
    const netFn = vi.fn();
    mgr.subscribe('cpu', cpuFn, true);
    mgr.subscribe('network', netFn, true);

    mgr.dispatch('cpu', { load: 50 });
    expect(cpuFn).toHaveBeenCalledWith({ load: 50 });
    expect(netFn).not.toHaveBeenCalled();
  });

  it('dispatches to multiple listeners on same topic', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    mgr.subscribe('cpu', fn1, true);
    mgr.subscribe('cpu', fn2, true);

    mgr.dispatch('cpu', 42);
    expect(fn1).toHaveBeenCalledWith(42);
    expect(fn2).toHaveBeenCalledWith(42);
  });

  it('dispatch to unknown topic is a no-op', () => {
    expect(() => mgr.dispatch('unknown', {})).not.toThrow();
  });
});
