import { describe, expect, it } from 'vitest';
import { evaluateBinding, evaluateExpression, resolvePath } from '../bindings';

describe('evaluateBinding', () => {
  const ctx = {
    data: { temp: { value: 42, formatted: '42°C' } },
    settings: { color: '#ff8800', warnTemp: 80 },
  };

  it('returns plain strings unchanged', () => {
    expect(evaluateBinding('hello', ctx)).toBe('hello');
  });

  it('interpolates {path} tokens to strings', () => {
    expect(evaluateBinding('CPU {data.temp.formatted}', ctx)).toBe('CPU 42°C');
  });

  it('returns the raw value when the entire string is a single binding', () => {
    expect(evaluateBinding('{data.temp.value}', ctx)).toBe(42);
  });

  it('evaluates simple arithmetic + comparison', () => {
    expect(evaluateBinding('{data.temp.value + 8}', ctx)).toBe(50);
    expect(evaluateBinding('{data.temp.value > settings.warnTemp}', ctx)).toBe(false);
    expect(evaluateBinding('{data.temp.value > 40}', ctx)).toBe(true);
  });

  it('supports if(cond, a, b)', () => {
    expect(evaluateBinding('{if(data.temp.value > 80, "hot", "ok")}', ctx)).toBe('ok');
    expect(evaluateBinding('{if(data.temp.value > 10, "hot", "ok")}', ctx)).toBe('hot');
  });

  it('returns empty string when a path resolves to undefined', () => {
    expect(evaluateBinding('CPU {data.missing.value}°', ctx)).toBe('CPU °');
  });

  it('supports round / floor / ceil / pct / clamp', () => {
    expect(evaluateBinding('{round(data.temp.value + 0.5)}', ctx)).toBe(43);
    expect(evaluateBinding('{floor(3.9)}', ctx)).toBe(3);
    expect(evaluateBinding('{ceil(3.1)}', ctx)).toBe(4);
    expect(evaluateBinding('{pct(50, 0, 100)}', ctx)).toBe(0.5);
    expect(evaluateBinding('{clamp(150, 0, 100)}', ctx)).toBe(100);
  });

  it('handles logical and/or short-circuit', () => {
    expect(evaluateExpression('1 && 2', {})).toBe(2);
    expect(evaluateExpression('0 || 5', {})).toBe(5);
  });

  it('returns input unchanged when no {...} pattern is present', () => {
    expect(evaluateBinding('{', ctx)).toBe('{');
  });

  it('returns undefined for a single-binding string whose path is unresolved', () => {
    // Single-{...} returns the raw expression value; an unresolved path
    // evaluates to undefined.
    expect(evaluateBinding('{data.missing}', ctx)).toBeUndefined();
  });
});

describe('resolvePath', () => {
  it('walks dotted paths', () => {
    expect(resolvePath('a.b.c', { a: { b: { c: 42 } } })).toBe(42);
  });
  it('returns undefined past nullish nodes', () => {
    expect(resolvePath('a.b.c', { a: null })).toBeUndefined();
  });
  it('handles missing keys gracefully', () => {
    expect(resolvePath('a.missing', { a: { b: 1 } })).toBeUndefined();
  });
  it('refuses prototype-chain segments', () => {
    expect(resolvePath('__proto__', {})).toBeUndefined();
    expect(resolvePath('constructor', {})).toBeUndefined();
    expect(resolvePath('prototype', {})).toBeUndefined();
    expect(resolvePath('a.__proto__.toString', { a: {} })).toBeUndefined();
  });
});
