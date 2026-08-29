import { describe, it, expect } from 'vitest';
import { onOpenFramesGame, requestOpenFramesGame } from './framesNav';

describe('framesNav', () => {
  it('announces the gameKey via the window event, and stops after unsubscribe', () => {
    const received: string[] = [];
    const off = onOpenFramesGame(gameKey => { received.push(gameKey); });

    requestOpenFramesGame('steam:730');
    expect(received).toEqual(['steam:730']);

    off();
    requestOpenFramesGame('steam:440');
    expect(received).toEqual(['steam:730']);
  });

  it('is a no-op with no listener registered', () => {
    expect(() => requestOpenFramesGame('steam:730')).not.toThrow();
  });
});
