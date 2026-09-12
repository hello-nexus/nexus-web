import { describe, expect, it } from 'vitest';
import { buildFpsSignatureParams } from './fpsSignatureParams';
import type { SystemSpecs } from '../../../hooks/useSystemSpecs';

function specs(overrides: Partial<SystemSpecs> = {}): SystemSpecs {
  return {
    pcName: 'Nexus-PC',
    osBuild: 'Windows 11 Pro (10.0.26100)',
    processor: 'AMD Ryzen 9 9950X3D',
    motherboard: 'ASUS ROG CROSSHAIR X670E HERO',
    memory: '32 GB DDR5-6000 (2 × 16 GB Corsair CMK32GX5M2B6000C36)',
    storage: '2 TB NVMe',
    graphicsCard: 'NVIDIA GeForce RTX 5080',
    monitor: 'Dell U2723QE (3840×2160 @ 60 Hz)',
    soundCard: 'Realtek',
    networkCard: 'Intel',
    ...overrides,
  };
}

describe('buildFpsSignatureParams', () => {
  it('parses a full rig into gpu/cpu/mobo/ramBytes/res/hz', () => {
    const params = buildFpsSignatureParams(specs());
    expect(params).toEqual({
      gpu: 'NVIDIA GeForce RTX 5080',
      cpu: 'AMD Ryzen 9 9950X3D',
      mobo: 'ASUS ROG CROSSHAIR X670E HERO',
      ramBytes: 32 * 1024 ** 3,
      res: '3840x2160',
      hz: 60,
    });
  });

  it('prefers the service-picked primaryGpu over the joined graphicsCard string', () => {
    const params = buildFpsSignatureParams(specs({
      graphicsCard: 'AMD Radeon Graphics + AMD Radeon RX 7700 XT',
      primaryGpu: 'AMD Radeon RX 7700 XT',
    }));
    expect(params?.gpu).toBe('AMD Radeon RX 7700 XT');
  });

  it('falls back to the first GPU segment when the service sends no primaryGpu', () => {
    const params = buildFpsSignatureParams(specs({ graphicsCard: 'NVIDIA GeForce RTX 4070 + AMD Radeon Graphics' }));
    expect(params?.gpu).toBe('NVIDIA GeForce RTX 4070');
  });

  it('tolerates an ASCII x separator and no monitor name', () => {
    const params = buildFpsSignatureParams(specs({ monitor: '2560x1440 @ 165Hz' }));
    expect(params?.res).toBe('2560x1440');
    expect(params?.hz).toBe(165);
  });

  it('omits hz when the monitor string carries no refresh rate', () => {
    const params = buildFpsSignatureParams(specs({ monitor: 'Dell U2723QE (3840×2160)' }));
    expect(params?.res).toBe('3840x2160');
    expect(params?.hz).toBeUndefined();
  });

  it('parses a bare RAM total with no DDR generation or stick layout', () => {
    const params = buildFpsSignatureParams(specs({ memory: '16 GB' }));
    expect(params?.ramBytes).toBe(16 * 1024 ** 3);
  });

  it('parses a terabyte RAM total', () => {
    const params = buildFpsSignatureParams(specs({ memory: '1.5 TB DDR5-4800' }));
    expect(params?.ramBytes).toBe(Math.round(1.5 * 1024 ** 4));
  });

  it('omits ramBytes when the memory string has no parseable total', () => {
    const params = buildFpsSignatureParams(specs({ memory: '' }));
    expect(params?.ramBytes).toBeUndefined();
  });

  it('omits mobo when the motherboard string is empty', () => {
    const params = buildFpsSignatureParams(specs({ motherboard: '' }));
    expect(params?.mobo).toBeUndefined();
  });

  it('returns null when the monitor string has no parseable resolution', () => {
    expect(buildFpsSignatureParams(specs({ monitor: '' }))).toBeNull();
    expect(buildFpsSignatureParams(specs({ monitor: 'Dell U2723QE' }))).toBeNull();
  });
});
