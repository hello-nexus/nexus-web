// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolvePrimaryGpu } from '../../lib/gpuResolver';

const intel = { name: 'Intel UHD Graphics', integrated: true };
const nvidia = { name: 'NVIDIA GeForce RTX 4090', integrated: false };
const amd = { name: 'AMD Radeon RX 7900', integrated: false };

describe('resolvePrimaryGpu', () => {
  it('defaults to the first discrete GPU regardless of enumeration order', () => {
    expect(resolvePrimaryGpu([intel, nvidia], '')).toBe(nvidia);
    expect(resolvePrimaryGpu([nvidia, intel], '')).toBe(nvidia);
  });

  it('honours an explicit preference by model name', () => {
    expect(resolvePrimaryGpu([nvidia, intel], intel.name)).toBe(intel);
  });

  it('falls back to the discrete default when the preferred name is stale', () => {
    expect(resolvePrimaryGpu([intel, nvidia], 'GPU that was unplugged')).toBe(nvidia);
  });

  it('falls back to the first entry when every GPU is integrated', () => {
    expect(resolvePrimaryGpu([intel], '')).toBe(intel);
  });

  it('picks the first discrete among several discrete GPUs', () => {
    expect(resolvePrimaryGpu([intel, nvidia, amd], '')).toBe(nvidia);
  });

  it('returns undefined for an empty list', () => {
    expect(resolvePrimaryGpu([], '')).toBeUndefined();
    expect(resolvePrimaryGpu([], 'anything')).toBeUndefined();
  });
});
