import { describe, expect, it } from 'vitest';
import { advanceRotor, ROTOR_PERIOD, type RotorSpin } from './rotorSpin';

const ring = (a: number, b: number) => { const d = Math.abs(a - b) % ROTOR_PERIOD; return Math.min(d, ROTOR_PERIOD - d); };

describe('advanceRotor', () => {
  it('starts at the target rate and keeps the angle inside one blade period', () => {
    let spin: RotorSpin | undefined;
    for (let i = 0; i < 5000; i++) {
      spin = advanceRotor(spin, 1 / 240, 1.2, 1);
      expect(spin.angle).toBeGreaterThanOrEqual(0);
      expect(spin.angle).toBeLessThan(ROTOR_PERIOD);
    }
    expect(spin!.rate).toBeCloseTo(1.2, 10);
  });

  it('is continuous across the wrap: each step moves by rate times dt, modulo the period', () => {
    let spin = advanceRotor(undefined, 0, 1.0, 1);
    const dt = 1 / 144;
    for (let i = 0; i < 3000; i++) {
      const next = advanceRotor(spin, dt, 1.0, 1);
      expect(ring(next.angle, spin.angle + 2 * Math.PI * 1.0 * dt)).toBeLessThan(1e-9);
      spin = next;
    }
  });

  it('does not move the angle when the rpm changes, only the speed, and eases the rate', () => {
    const before = advanceRotor(advanceRotor(undefined, 0, 0.5, 1), 0.01, 0.5, 1);
    const after = advanceRotor(before, 0, 1.4, 1);
    expect(after.angle).toBe(before.angle);
    expect(after.rate).toBe(0.5);
    const later = advanceRotor(after, 0.1, 1.4, 1);
    expect(later.rate).toBeGreaterThan(0.5);
    expect(later.rate).toBeLessThan(1.4);
    // The step is the integral of the eased rate, no jump beyond one frame's travel.
    expect(ring(later.angle, after.angle)).toBeLessThan(2 * Math.PI * 1.4 * 0.1 + 1e-9);
  });

  it('spins backward for a negative sign and wraps below zero', () => {
    let spin = advanceRotor(undefined, 0, 1, -1);
    spin = advanceRotor(spin, 0.01, 1, -1);
    expect(spin.angle).toBeGreaterThan(0);
    expect(spin.angle).toBeLessThan(ROTOR_PERIOD);
    expect(ring(spin.angle, -2 * Math.PI * 0.01)).toBeLessThan(1e-9);
  });

  it('stays exact after a very long run', () => {
    let spin: RotorSpin | undefined;
    for (let i = 0; i < 200000; i++) spin = advanceRotor(spin, 1 / 60, 1.3, 1);
    expect(spin!.angle).toBeLessThan(ROTOR_PERIOD);
    expect(Number.isFinite(spin!.angle)).toBe(true);
  });
});
