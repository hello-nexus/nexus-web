import { describe, expect, it, vi } from 'vitest';
import { announceSidebarArrival, subscribeSidebarArrival } from './sidebarArrival';

describe('sidebarArrival', () => {
  it('reveals at once when no sidebar is listening, so a waiting modal still opens', () => {
    const onRevealed = vi.fn();

    announceSidebarArrival('app:fish', { enter: true, onRevealed });

    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it('reveals once even when several sidebars report it', () => {
    const onRevealed = vi.fn();
    const first = subscribeSidebarArrival(arrival => arrival.onRevealed?.());
    const second = subscribeSidebarArrival(arrival => arrival.onRevealed?.());

    announceSidebarArrival('app:fish', { enter: true, onRevealed });
    first();
    second();

    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it('hands a listening sidebar the reveal, with a fresh nonce per announcement', () => {
    const seen: { nonce: number; onRevealed?: () => void }[] = [];
    const onRevealed = vi.fn();
    const unsubscribe = subscribeSidebarArrival(arrival => seen.push(arrival));

    announceSidebarArrival('app:fish', { enter: true, onRevealed });
    announceSidebarArrival('app:fish', { enter: false });
    unsubscribe();

    expect(onRevealed).not.toHaveBeenCalled();
    seen[0].onRevealed?.();
    expect(onRevealed).toHaveBeenCalledTimes(1);
    expect(seen[1].nonce).toBeGreaterThan(seen[0].nonce);
  });
});
