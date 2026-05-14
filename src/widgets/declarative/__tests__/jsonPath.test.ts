import { describe, expect, it } from 'vitest';
import { jsonPath } from '../jsonPath';

describe('jsonPath', () => {
  const doc = {
    properties: { temperature: { value: 72, unit: 'F' } },
    series: [10, 20, 30, 40],
    nested: [{ name: 'a' }, { name: 'b' }],
  };

  it('returns root for $', () => {
    expect(jsonPath(doc, '$')).toBe(doc);
  });

  it('walks dotted paths', () => {
    expect(jsonPath(doc, '$.properties.temperature.value')).toBe(72);
  });

  it('indexes arrays', () => {
    expect(jsonPath(doc, '$.series[0]')).toBe(10);
    expect(jsonPath(doc, '$.series[2]')).toBe(30);
  });

  it('supports negative indexing', () => {
    expect(jsonPath(doc, '$.series[-1]')).toBe(40);
  });

  it('handles bracketed keys', () => {
    expect(jsonPath({ "weird key": 1 }, '$["weird key"]')).toBe(1);
  });

  it('mixes brackets + dots', () => {
    expect(jsonPath(doc, '$.nested[1].name')).toBe('b');
  });

  it('returns undefined for missing paths', () => {
    expect(jsonPath(doc, '$.nope.gone')).toBeUndefined();
    expect(jsonPath(doc, '$.series[99]')).toBeUndefined();
  });

  it('returns undefined on malformed paths', () => {
    expect(jsonPath(doc, '$[unclosed')).toBeUndefined();
  });

  it('refuses to walk prototype-chain keys', () => {
    expect(jsonPath({}, '$.__proto__')).toBeUndefined();
    expect(jsonPath({}, '$["__proto__"]')).toBeUndefined();
    expect(jsonPath({}, '$.constructor.prototype')).toBeUndefined();
    expect(jsonPath({}, '$.constructor')).toBeUndefined();
    expect(jsonPath({}, '$.prototype')).toBeUndefined();
  });
});
