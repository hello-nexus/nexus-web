import { describe, expect, it } from 'vitest';
import type { SceneAnchor, SceneObject } from '../../../../api/lightingScene';
import { anchorLabel, objectLabel } from './sceneLabels';

const t = (key: string, params?: Record<string, string | number>) => (params ? `${key}(${Object.values(params).join(',')})` : key);

const spot = (id: string, kind: string): SceneAnchor => ({
  id, kind, center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], width: 100, height: 100, shape: 'rect',
});
const obj = (id: string, kind: string, anchors: SceneAnchor[]): SceneObject => ({
  id, kind, source: 'build', position: [0, 0, 0], yaw: 0, size: [100, 100, 100], anchors,
});

describe('scene labels', () => {
  const pc = obj('case', 'case', []);
  const at = (id: string, kind: string) => anchorLabel(t, pc, spot(id, kind));

  it('names fan mounts by position and 1-based index', () => {
    expect(at('fan:front:120:0', 'fan')).toBe('lighting.scene.anchor.fan.front(1)');
    expect(at('fan:rear:120:0', 'fan')).toBe('lighting.scene.anchor.fan.rear(1)');
    expect(at('fan:psu-shroud:120:1', 'fan')).toBe('lighting.scene.anchor.fan.other(2)');
    expect(at('fan:cooler:120:0', 'fan')).toBe('lighting.scene.anchor.fan.cooler');
    expect(at('fan:radiator-0:120:2', 'fan')).toBe('lighting.scene.anchor.fan.radiator(3)');
  });

  it('names parts and strips through translation keys', () => {
    expect(at('ram:2', 'ram')).toBe('lighting.scene.anchor.ram(3)');
    expect(at('gpu', 'gpu')).toBe('lighting.scene.anchor.gpu');
    expect(at('strip:top', 'strip')).toBe('lighting.scene.anchor.strip.top');
  });

  it('names a desk surface after its product', () => {
    const kb = obj('keyboard', 'keyboard', [spot('top', 'surface')]);
    expect(anchorLabel(t, kb, kb.anchors[0])).toBe('lighting.scene.kind.keyboard');
    expect(objectLabel(t, { ...kb, label: 'HYTE Keeb TKL' })).toBe('HYTE Keeb TKL');
    expect(objectLabel(t, pc)).toBe('lighting.scene.kind.case');
  });
});
