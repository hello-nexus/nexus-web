// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { requestCoolingFan, takeCoolingFan } from './coolingFanIntent';

describe('coolingFanIntent', () => {
  it('hands a request over once', () => {
    requestCoolingFan('lianli-flex:AA11:port0');
    expect(takeCoolingFan()).toBe('lianli-flex:AA11:port0');
    expect(takeCoolingFan()).toBeNull();
  });

  it('keeps only the latest request', () => {
    requestCoolingFan('a');
    requestCoolingFan('b');
    expect(takeCoolingFan()).toBe('b');
  });
});
