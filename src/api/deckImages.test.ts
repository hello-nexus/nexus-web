import { describe, it, expect } from 'vitest';
import { deckImageFailureOf } from './deckImages';

describe('deckImageFailureOf', () => {
  it('maps 404 to an expired stage', () => {
    expect(deckImageFailureOf({ msg: 'Stage not found or expired', status: 404 })).toBe('expired');
  });
  it('maps the too-large message and 413 to tooLarge', () => {
    expect(deckImageFailureOf({ msg: 'Result too large', status: 400 })).toBe('tooLarge');
    expect(deckImageFailureOf({ msg: 'x', status: 413 })).toBe('tooLarge');
  });
  it('maps anything else to failed', () => {
    expect(deckImageFailureOf({ msg: 'invalid stage id', status: 400 })).toBe('failed');
  });
});
