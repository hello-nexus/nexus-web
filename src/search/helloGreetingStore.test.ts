import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HELLO_FIRST_KEY, HELLO_POOL_KEYS } from './helloGreetings';

const fetchService = vi.fn();
vi.mock('../api/service', () => ({
  fetchService: (...a: unknown[]) => fetchService(...a),
}));

type StoreModule = typeof import('./helloGreetingStore');
let store: StoreModule;

beforeEach(async () => {
  vi.resetModules();
  fetchService.mockReset();
  localStorage.clear();
  store = await import('./helloGreetingStore');
});

describe('checkHelloGreetingOnce', () => {
  it('queues the first-run greeting and stores the boot id when nothing was stored', async () => {
    fetchService.mockResolvedValue({ bootId: 'boot-1' });
    await store.checkHelloGreetingOnce();
    expect(store.getPendingHelloGreeting()?.textKey).toBe(HELLO_FIRST_KEY);
    expect(localStorage.getItem('nexus.helloGreetedBoot')).toBe('boot-1');
  });

  it('queues a random pool line and updates storage when the boot id changed', async () => {
    localStorage.setItem('nexus.helloGreetedBoot', 'boot-old');
    fetchService.mockResolvedValue({ bootId: 'boot-new' });
    await store.checkHelloGreetingOnce();
    const pending = store.getPendingHelloGreeting();
    expect(pending).not.toBeNull();
    expect(HELLO_POOL_KEYS).toContain(pending?.textKey);
    expect(localStorage.getItem('nexus.helloGreetedBoot')).toBe('boot-new');
  });

  it('does not queue a greeting when the boot id matches what was already greeted', async () => {
    localStorage.setItem('nexus.helloGreetedBoot', 'boot-1');
    fetchService.mockResolvedValue({ bootId: 'boot-1' });
    await store.checkHelloGreetingOnce();
    expect(store.getPendingHelloGreeting()).toBeNull();
  });

  it('leaves no pending greeting and does not throw when the fetch fails', async () => {
    fetchService.mockRejectedValue(new Error('offline'));
    await expect(store.checkHelloGreetingOnce()).resolves.toBeUndefined();
    expect(store.getPendingHelloGreeting()).toBeNull();
  });

  it('leaves no pending greeting when the response has no bootId', async () => {
    fetchService.mockResolvedValue(null);
    await store.checkHelloGreetingOnce();
    expect(store.getPendingHelloGreeting()).toBeNull();
  });

  it('only runs once per module session even if called again after a boot id change', async () => {
    fetchService.mockResolvedValue({ bootId: 'boot-1' });
    await store.checkHelloGreetingOnce();
    store.dismissHelloGreeting();

    fetchService.mockResolvedValue({ bootId: 'boot-2' });
    await store.checkHelloGreetingOnce();
    expect(store.getPendingHelloGreeting()).toBeNull();
  });
});

describe('dismissHelloGreeting', () => {
  it('clears a pending greeting and notifies subscribers', () => {
    store.playHelloGreeting();
    expect(store.getPendingHelloGreeting()).not.toBeNull();

    const listener = vi.fn();
    store.subscribeHelloGreeting(listener);
    store.dismissHelloGreeting();
    expect(store.getPendingHelloGreeting()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is pending', () => {
    const listener = vi.fn();
    store.subscribeHelloGreeting(listener);
    store.dismissHelloGreeting();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('playHelloGreeting', () => {
  it('sets a pool line independent of the stored boot id', () => {
    localStorage.setItem('nexus.helloGreetedBoot', 'boot-1');
    store.playHelloGreeting();
    const pending = store.getPendingHelloGreeting();
    expect(HELLO_POOL_KEYS).toContain(pending?.textKey);
    expect(localStorage.getItem('nexus.helloGreetedBoot')).toBe('boot-1');
  });

  it('bumps the id on every call so a remount is forced even on a repeat line', () => {
    store.playHelloGreeting();
    const first = store.getPendingHelloGreeting();
    store.playHelloGreeting();
    const second = store.getPendingHelloGreeting();
    expect(second?.id).not.toBe(first?.id);
  });
});

describe('resetHelloGreetedBoot', () => {
  it('clears the stored boot id and lets checkHelloGreetingOnce run again', async () => {
    fetchService.mockResolvedValue({ bootId: 'boot-1' });
    await store.checkHelloGreetingOnce();
    store.dismissHelloGreeting();

    store.resetHelloGreetedBoot();
    expect(localStorage.getItem('nexus.helloGreetedBoot')).toBeNull();

    fetchService.mockResolvedValue({ bootId: 'boot-1' });
    await store.checkHelloGreetingOnce();
    expect(store.getPendingHelloGreeting()?.textKey).toBe(HELLO_FIRST_KEY);
  });
});
