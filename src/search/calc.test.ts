// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { tryCalc } from './calc';

describe('tryCalc', () => {
  it('evaluates basic arithmetic with precedence', () => {
    expect(tryCalc('12*8')?.value).toBe('96');
    expect(tryCalc('2+3*4')?.value).toBe('14');
    expect(tryCalc('(2+3)*4')?.value).toBe('20');
    expect(tryCalc('1920/2')?.value).toBe('960');
    expect(tryCalc('10%3')?.value).toBe('1');
  });

  it('handles unary minus and decimals', () => {
    expect(tryCalc('-5+8')?.value).toBe('3');
    expect(tryCalc('3.5*2')?.value).toBe('7');
    expect(tryCalc('2*(-3)')?.value).toBe('-6');
  });

  it('ignores non-expressions', () => {
    expect(tryCalc('monitoring')).toBeNull();
    expect(tryCalc('lighting')).toBeNull();
    expect(tryCalc('42')).toBeNull();      // no operator
    expect(tryCalc('')).toBeNull();
    expect(tryCalc('1/0')).toBeNull();     // not finite
    expect(tryCalc('2++')).toBeNull();     // malformed
    expect(tryCalc('(1+2')).toBeNull();    // unbalanced
  });
});
